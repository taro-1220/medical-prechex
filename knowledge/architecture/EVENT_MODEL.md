# EVENT_MODEL — イベント定義

## 役割
システム内で発生するすべての状態変化をイベントとして定義する。
イベントログが紛争証拠・監査証跡・デバッグ情報の正本となる。

## 管理対象
- イベント名一覧と定義
- 各イベントに必須のペイロードフィールド
- イベントの発生主体（患者 / クリニック / システム / Stripe）
- イベントログの保存先と保持期間

## 書いてよい内容
- イベント名（スネークケース）
- イベントの発生条件
- ペイロードの必須フィールド
- 発生後にトリガーされる処理（サイドエフェクト）
- 保存先・保持期間

## 書いてはいけない内容
- 実装コード・メッセージキューの設定
- 通知テンプレートの内容（→ NOTIFICATIONS.md へ）
- UI側の処理フロー（→ PATIENT_CHECK_FLOW.md へ）

## 更新ルール
- 新イベント追加時はペイロード必須フィールドを定義してから実装する
- 既存イベントのペイロード変更は後方互換性を明記する
- イベント名の変更は旧名の廃止計画と移行時期をセットで記録する

## コアイベント一覧

| イベント名 | 発生主体 | 概要 |
|---|---|---|
| `appointment.created` | 患者 | 予約フォーム送信 |
| `consent.presented` | システム | 同意画面を患者に表示 |
| `consent.agreed` | 患者 | キャンセルポリシーに同意 |
| `card.setup_initiated` | システム | SetupIntent 発行 |
| `card.registered` | Stripe | SetupIntent succeeded |
| `authorization.requested` | システム | PaymentIntent 発行（capture_method=manual） |
| `authorization.succeeded` | Stripe | requires_capture に到達 |
| `authorization.failed` | Stripe | オーソリ失敗 |
| `authorization.expired` | Stripe | オーソリ失効（7日超過） |
| `visit.confirmed` | クリニック | 来院確認 |
| `capture.requested` | システム | capture API呼び出し |
| `capture.succeeded` | Stripe | 請求確定 |
| `capture.failed` | Stripe | capture失敗 |
| `cancellation.initiated` | 患者/クリニック | キャンセル操作 |
| `cancellation.fee_calculated` | システム | キャンセル料計算完了 |
| `cancellation.charged` | Stripe | キャンセル料回収完了 |
| `dispute.opened` | Stripe | チャージバック申告 |
| `dispute.evidence_submitted` | システム | 証拠提出 |

## ペイロード必須フィールド（全イベント共通）
- `event_id`: UUID
- `event_type`: イベント名
- `occurred_at`: ISO8601
- `actor`: `patient` / `clinic` / `system` / `stripe`
- `appointment_id`: 関連予約ID
- `patient_id`: 患者ID

## 関連する状態
STATE_MACHINE.md の各遷移は必ずイベントと1対1で対応する。
イベントログなしの状態遷移は発生させない。

## 関連する事故パターン
- イベントログが `appointment_id` を持たず紛争時に予約と紐付けできない
- `consent.agreed` イベントのペイロードに同意文面バージョンが含まれておらず、後から表示内容の証明ができない
- `capture.requested` ログがなく二重 capture の検出ができない

## 将来の再利用先
- 監査ログ画面への表示
- 紛争対応時の証拠パッケージ自動生成
- SLA監視・アラート
