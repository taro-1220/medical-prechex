# CANCELLATION_POLICY — キャンセルポリシー管理

## 役割
キャンセルポリシーの設計・保存・バージョン管理・料金計算のルールを定義する。
「患者が同意したポリシー」と「実際に請求したキャンセル料」の乖離を防ぐ。

## 管理対象
- キャンセルポリシーのデータモデル
- ポリシーバージョン管理ルール
- キャンセル料計算ロジックの設計
- 予約日時変更時の同意再取得ルール
- 患者表示文面の保存要件

## 書いてよい内容
- ポリシーのデータフィールド定義
- バージョン管理の方針（不変・追記のみ）
- キャンセル料計算の入力変数と計算順序
- 変更時の既存予約への影響ルール

## 書いてはいけない内容
- 実装コード・計算式のコード
- 個別クリニックのポリシー内容
- 患者向けUI文言（→ UX_RULES.md / CONSENT_UX.md へ）

## 更新ルール
- ポリシーのデータモデルを変更する際は既存 `consent_log` への影響を先に評価する
- 計算ロジックの変更は既存予約への影響をシミュレーションしてから適用する

## ポリシーデータモデル

| フィールド | 型 | 説明 |
|---|---|---|
| `policy_id` | UUID | 不変 |
| `clinic_id` | UUID | 所有クリニック |
| `version` | integer | 単調増加。変更時はインクリメント |
| `effective_from` | timestamp | このバージョンが適用される最初の予約作成日時 |
| `free_cancel_hours` | integer | 無料キャンセル可能な診療時刻からの時間数 |
| `fee_type` | enum | `fixed` / `percentage` |
| `fee_value` | decimal | `fixed`: 金額、`percentage`: 率（0〜100） |
| `fee_max` | decimal | `percentage` の場合の上限金額（nullable） |
| `display_text` | text | 患者に表示する文面（日本語全文） |
| `status` | enum | `draft` / `approved` / `archived` |

## バージョン管理ルール
- ポリシーは**不変**。更新は新バージョン作成のみ
- 既存の `approved` バージョンは `archived` にできるが削除禁止
- 予約の `consent_log` は `policy_id` + `version` の両方を保存する
- キャンセル料計算時は**同意時のバージョン**を使用する（最新バージョンではない）

## キャンセル料計算ルール

### 入力変数
- `appointment_datetime`: 診療日時
- `cancel_requested_at`: キャンセル操作日時
- `policy_version`: **同意時**のバージョン（SSOTルール）
- `authorization_amount`: オーソリ済み金額

### 計算順序
1. `hours_before = (appointment_datetime - cancel_requested_at) / 3600`
2. `hours_before >= policy.free_cancel_hours` → 料金0
3. `hours_before < policy.free_cancel_hours` かつ `fee_type=fixed` → `fee_value`
4. `hours_before < policy.free_cancel_hours` かつ `fee_type=percentage` → `min(authorization_amount * fee_value / 100, fee_max ?? ∞)`

## 予約日時変更時の同意再取得
- 変更前と変更後でキャンセル料が変わる可能性がある場合 → **同意再取得必須**
- 変更後のポリシーが変更前より患者に不利（料金が高い）→ **必ず再取得**
- 変更後のポリシーが同一または有利 → 再取得推奨だが必須でない（設計判断）
- 再取得しない場合は `consent_log` に「変更前同意が引き継がれた」旨を記録する

## 関連する状態
- STATE_MACHINE.md: `cancelled_free` / `cancelled_charged` / `no_show`
- EVENT_MODEL.md: `cancellation.fee_calculated` / `cancellation.charged`

## 関連する事故パターン
- ポリシーを更新したが `consent_log` が旧バージョンを参照し、新料金を請求して紛争
- キャンセル料計算時に最新ポリシーを使用し、同意時のポリシーと異なる金額を請求
- `display_text` を保存していなかったため「何に同意したか」の文面証拠がない
- 予約日時変更後に同意を再取得せず、変更後のポリシーで請求して紛争

## 将来の再利用先
- 美容・ホテル等キャンセルポリシーが必要な業種全般
- 段階的キャンセル料（48時間前: 50%、24時間前: 100%）への対応
