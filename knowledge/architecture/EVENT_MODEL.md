# EVENT_MODEL — イベント定義

## 役割
システム内で発生するすべての状態変化をイベントとして定義する。
イベントログが紛争証拠・監査証跡・デバッグ情報の正本となる。

## 管理対象
- イベント名一覧と定義
- 各イベントに必須のペイロードフィールド
- イベントの発生主体（患者 / クリニック / システム）
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

---

## MVP イベント一覧

| イベント名 | 発生主体 | 概要 |
|---|---|---|
| `reservation_created` | クリニック | 予約を新規作成 |
| `confirmation_url_generated` | システム | 患者向け確認URLを発行 |
| `confirmation_opened` | 患者 | 患者が確認URLを開いた |
| `policy_viewed` | 患者 | キャンセルポリシーを表示した |
| `policy_consented` | 患者 | キャンセルポリシーに同意した |
| `confirmation_completed` | 患者 | 予約確認・同意を完了した |
| `qr_issued` | システム | QR来院チケットを発行した |
| `checked_in` | クリニック | 来院確認を完了した（MVP terminal） |
| `reservation_cancelled` | 患者 / クリニック | 予約をキャンセルした |
| `confirmation_expired` | システム | 確認期限が切れた |

---

## 将来イベント（V2以降・決済実装後）

> MVP_SCOPE.md の V1 には含まれない。PAYMENT_ARCHITECTURE.md と対応する。

| イベント名 | 発生主体 | 概要 |
|---|---|---|
| `reservation_completed` | システム | 診察・会計完了後の予約完了処理（V2以降） |
| `guarantee_registered` | 患者 | 予約保証登録完了（カード登録） |
| `authorization_started` | システム | Authorization 開始 |
| `authorization_succeeded` | 外部（Stripe） | Authorization 完了 |
| `authorization_failed` | 外部（Stripe） | Authorization 失敗 |
| `authorization_released` | システム | Authorization 解放 |
| `no_show_detected` | システム | 無断キャンセル検知 |
| `capture_started` | システム | Capture 開始 |
| `capture_completed` | 外部（Stripe） | Capture 完了 |
| `capture_failed` | 外部（Stripe） | Capture 失敗 |
| `refund_started` | システム | 返金開始 |
| `refund_completed` | 外部（Stripe） | 返金完了 |

---

## ペイロード必須フィールド（全イベント共通）

- `event_id`: UUID
- `event_type`: イベント名
- `occurred_at`: ISO8601
- `actor`: `patient` / `clinic` / `system` / `external`
- `appointment_id`: 関連予約ID

## 関連する状態
STATE_MACHINE.md の各遷移は必ずイベントと1対1で対応する。
イベントログなしの状態遷移は発生させない。

## 関連する事故パターン
- イベントログが `appointment_id` を持たず紛争時に予約と紐付けできない
- `policy_consented` イベントのペイロードに同意文面バージョンが含まれておらず、後から表示内容の証明ができない

## 画面操作との対応
UI_FLOW.md の「画面 × イベント 対応表」を正本とする。

| 画面操作 | 発火イベント |
|---|---|
| 予約作成フォーム送信 | `reservation_created` |
| 確認URL発行 | `confirmation_url_generated` |
| 患者: URL開く | `confirmation_opened` |
| 患者: ポリシー表示 | `policy_viewed` |
| 患者: 同意チェック | `policy_consented` |
| 患者: 確定ボタン | `confirmation_completed` → `qr_issued` |
| クリニック: 来院確認 | `checked_in` → `reservation_completed` |

## 将来の再利用先
- 監査ログ画面への表示
- 紛争対応時の証拠パッケージ自動生成
- SLA監視・アラート
