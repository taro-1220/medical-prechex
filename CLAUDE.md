# medipre Project Rules

医療機関向けmedipre。予約確認・キャンセルポリシー同意・事前カード登録・オーソリ・キャンセル料回収・来院確認を扱う「同意・決済・状態遷移・紛争耐性OS」。

Node 25系では全ページがSSRで500になる（localStorage.getItem is not a function）。開発は Node 22 LTS を使用すること。

## Commands

- Node.js: `.nvmrc` = `22`、`package.json` の `engines` = `>=22 <23`（Node 25 は不可）
- `npm run dev` / `npm run build` / `npm run typecheck`（`tsc --noEmit`）/ `npm run lint`（`next lint`）/ `npm test`（`vitest run`）
- 上記は `package.json` の scripts に実在することを確認済み（CI 設定は本リポジトリに無い）

---

## 応答ルール

- 中間報告・進捗説明・長文要約 **禁止**
- 実装前の長文分析・影響範囲サマリー・複数案比較 **禁止**
- 不要な安全説明・注意書き・装飾文 **禁止**
- 報告形式: 変更ファイル / 変更内容 / 確認項目 / commit可否 のみ

## 調査ルール

- 広域 grep / 広域 glob / 無差別ディレクトリ探索 **禁止**
- Bash の find / grep / ls 連打 **禁止**
- 指定外ディレクトリ探索 **禁止**
- Read は必要箇所のみ。全文読まない
- 1回の Read は最大 250 行
- offset / limit または line 指定で読む
- 変更対象が推定できる場合は、該当ファイル・該当セクションを直接読む

## 変更ルール

- unrelated refactor **禁止**
- 既存設計変更 **禁止**
- 指定外ファイル修正 **禁止**
- push / merge / commit は明示指示まで **禁止**
- 既存ファイルへの追記は「不足のみ追加」。既存記述を破壊しない

## 設計原則

### SSOT最上位
- dual write **禁止**
- fallback延命 **禁止**
- localStorage / cache / UI state を正本にしない

### 同意
- 患者同意ログなしの請求 **禁止**
- キャンセルポリシーは患者表示文面と同意ログを必ず保存
- 予約日時変更時は旧同意の扱いを明示する

### 決済
- Stripe状態とDB状態の乖離 **禁止**
- オーソリ失敗時に「保証済み」表示しない
- 二重 capture 防止を最優先
- キャンセル料回収は同意ログ・Stripe event・DB状態が三者一致していることを前提とする

### 運用
- クリニック任意運用に逃がさない（設定の余地は設計で制限する）
- 事故記録は抽象化しすぎない。原因・影響・再発条件・防止策を残す
- 事故・セキュリティ修正は `knowledge/core/INCIDENTS.md` の形式（INC-YYYY-NNN）で記録する。INC が0件であることは「事故が無かった」証拠ではない（記録運用が未整備だった可能性があり、git 履歴には `fix(security)` 等の修正が存在する）。過去分を遡及記録する場合は、確認できた事実のみ書き、推測は書かない

## セキュリティ制約（実装・テスト・migration で確認済み。弱めない）

- DB クライアント（`src/lib/supabase.ts`）は `SUPABASE_SERVICE_ROLE_KEY` を使う＝**RLS をバイパスする**。クリニック間分離の実効的な防壁は API ルートの認証と `clinic_users` 所属チェック。新規ルートは必ずこれを実装する
- 予約トークン（URL の `[token]`）単独での状態変更は禁止。汎用 PATCH は廃止済み（`appointments/[token]/route.ts`）。`checkin` / `complete` は Bearer 認証 + `clinic_users` 所属確認が必須で、許可する遷移は `confirmed → checked_in → completed` のみ（不正遷移は 409、未認証 401、他院 403。`route.test.ts` で検証）
- `GET /api/patients/search`、`GET/POST /api/appointments`: 認証 + `clinic_users` 所属が必須。操作可能な `clinic_id` は所属から確定し、クライアント入力の `clinic_id` は所属に含まれる場合のみ採用、他院は 403
- RLS: `clinic_users_select` は `SECURITY DEFINER` 関数 `public.is_clinic_member()` 経由（migration 007）。`clinic_users` 上のポリシー内で `clinic_users` を直接サブクエリすると無限再帰（42P17）になるため禁止。migration 上で RLS が有効化されているのは `clinics`・`clinic_users`・`message_templates`・`clinic_cancel_policies`・`charge_events`・`available_slots`・`slot_notifications` のみ（`appointments`・`consent_logs`・`patients` は migration 内に RLS 定義なし。Supabase 側の実設定は未確認）
- `src/middleware.ts`（site-gate）: `SITE_ACCESS_PASSWORD` 未設定時は全体が無効化される。`BYPASS_PATHS` は各ルート自身の認証が前提であり、追加時は当該ルートの認証を確認する。`/ops`・`/api/ops` はバイパスしない（`/api/ops/me` のみ例外）。運営者 API は `requireOpsAdmin`（`OPS_ADMIN_EMAILS`）で 401/403

## ドキュメント体系

```
/knowledge/architecture/  — システム設計の根拠と制約
/knowledge/core/          — 製品原則・コンプライアンス・運用OS
/knowledge/business/      — 事業モデル・価格・GTM・MVPスコープ
/knowledge/domains/       — 業務フロー・ドメインルール
/skills/                  — AIエージェント向け実装ガイド
```

`docs/ai-os/` は git 未追跡で、正式な管理対象かどうか未確認。確認が取れるまで必須参照にしない（存在しても正本として扱わない）。

各ドキュメントの更新は「不足のみ追加」原則。既存記述の削除は明示的な廃止決定が必要。
