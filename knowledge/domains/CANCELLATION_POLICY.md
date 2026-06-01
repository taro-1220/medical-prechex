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

### 時間基準の原則
- 計算は **epoch ミリ秒（ms）** を基準とする。日付単位（00:00区切り）禁止
- `hours_before` は `(appointment_datetime_ms - cancel_requested_at_ms) / 3_600_000` で求める
- 「前日」等の曖昧な表現を計算ロジックに使わない。`hoursBefore` 数値で明示する

### 入力変数
- `appointment_datetime_ms`: 診療日時（epoch ms）
- `cancel_requested_at_ms`: キャンセル操作日時（epoch ms）
- `policy_version`: **同意時**のバージョン（SSOTルール）
- `authorization_amount`: オーソリ済み金額

### 計算順序（単一閾値ポリシーの場合）
1. `hours_before = (appointment_datetime_ms - cancel_requested_at_ms) / 3_600_000`
2. `hours_before >= policy.free_cancel_hours` → 料金0
3. `hours_before < policy.free_cancel_hours` かつ `fee_type=fixed` → `fee_value`
4. `hours_before < policy.free_cancel_hours` かつ `fee_type=percentage` → `min(authorization_amount * fee_value / 100, fee_max ?? ∞)`

### 複数ステップポリシーの評価順序
段階的キャンセル料（例: 72h前30%・24h前50%・当日100%）を扱う場合:
- ステップを `hoursBefore` **昇順**に評価し、`hours_before <= step.hoursBefore` を満たす最初のステップを適用する
- **降順ソート禁止**: 降順で評価すると `hours_before=20h` のとき最大閾値（72h）が先にマッチし過小料率になる誤判定が発生する

### オーソリ推奨時刻
- オーソリ（与信確保）の実行推奨時刻 = ポリシー最初の発動時刻の **48時間前**
- 「ポリシー最初の発動時刻」= `appointment_datetime_ms - max(hoursBefore) * 3_600_000`
- オーソリ後は来院人数・日時変更を制限する（変更可否の判定基準が変わるため）

### 日時・人数変更の可否
- **日時変更可**: ポリシー発動前（`cancel_requested_at_ms < policy_start_ms`）のみ無料変更可
- **日時変更不可**: ポリシー発動後は「キャンセル＋新規予約」として処理し、旧予約のキャンセル料を適用する
- **人数変更可**: オーソリ実行前のみ可。オーソリ後は与信額が確定するため変更不可
- 変更操作のたびにイベントログへ記録する（変更前後の値・操作主体を含む）

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
