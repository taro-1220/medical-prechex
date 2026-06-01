# STATE_MACHINE — 予約・決済状態遷移定義

## 役割
予約・決済・同意・来院の状態遷移を一元定義する。
不正遷移を防ぎ、紛争時に「どの状態でどの操作が実行されたか」を再現できるようにする。

## 管理対象
- 予約ステータス (`appointment.status`) の遷移グラフ
- 決済ステータス (`payment_intent.status`) の遷移グラフ
- 同意ステータス (`consent.status`) の遷移グラフ
- 遷移条件・遷移禁止条件
- 遷移イベント名（EventModelとの対応）

## 書いてよい内容
- ステータス値の定義と意味
- 遷移可能なパスとその条件
- 遷移不可パスとその理由
- terminal stateの定義
- 並行状態（例: オーソリ保留中 + 来院確認待ち）の扱い

## 書いてはいけない内容
- 実装コード・ORM定義
- UIのステップ表示ロジック
- 個別クリニックの運用ルール（→ CANCELLATION_POLICY.md へ）

## 更新ルール
- 新ステータス追加前に「既存遷移への影響」を明記する
- terminal stateを変更する場合は事故パターンとセットで記録する
- Stripeのステータスモデルに変更があった場合は必ず同期する

## 予約ステータス定義

| status | 意味 |
|---|---|
| `draft` | 入力途中。保存前 |
| `consent_pending` | 予約仮確定。同意待ち |
| `card_pending` | 同意完了。カード登録待ち |
| `authorized` | オーソリ完了。来院待ち |
| `visited` | 来院確認済み |
| `completed` | 会計完了 |
| `cancelled_free` | キャンセル（料金なし） |
| `cancelled_charged` | キャンセル（キャンセル料徴収済み） |
| `no_show` | 無断キャンセル（キャンセル料未回収または回収中） |
| `disputed` | 紛争申告中 |

## 遷移禁止ルール
- `completed` → いかなる状態へも遷移不可（terminal）
- `cancelled_charged` → `visited` への遷移不可
- `authorized` 状態でオーソリが失効した場合は `card_pending` に戻す（`authorized` のまま放置禁止）
- 同意ログのない状態で `authorized` へ遷移不可

## 決済ステータス（PaymentStatus）候補

| status | 意味 |
|---|---|
| `none` | 未オーソリ。カード登録前または登録後・オーソリ前 |
| `authorized` | オーソリ完了（Stripe: `requires_capture`）。来院待ち |
| `captured` | capture完了（Stripe: `succeeded`）。請求確定 |
| `refunded` | 返金完了。キャンセル料なしのキャンセルまたは返金処理後 |

- 正本は DB（`payment_intents` テーブル）。Stripe は `payment_intent.status` の正本（SSOT.md参照）
- `released`（void）は Stripe 側のオーソリ取り消し。DB では `refunded` または `cancelled_free` として記録する

## 状態管理の禁止事項
- **localStorage を状態の正本・復元・同期に使用することを禁止**
  - UI の表示補助・一時キャッシュ目的のみ許容
  - localStorage がクリアされても業務状態が失われない設計にする
- 同意ログ・決済ログ・状態遷移ログは **分離して保存する**
  - `consent_logs`（同意の証拠）
  - `payment_intents` / `event_logs`（決済の証拠）
  - `appointment_transitions`（状態遷移の証拠）
  - 1テーブルに混在させない

## 関連する状態
- `payment_intent.status` (Stripe): `requires_capture` = authorized, `succeeded` = captured
- `consent.status`: `agreed` なしに `card_pending` へ進めない

## 関連する事故パターン
- `authorized` のまま来院日を過ぎてオーソリ失効 → capture できず無料扱い
- `cancelled_free` と `cancelled_charged` を混同し二重返金
- `no_show` のまま放置しキャンセル料回収を忘れる
- 遷移ログがなく紛争時に経緯を証明できない

## 将来の再利用先
- リマインダー・通知の送信タイミング定義
- 事業者ダッシュボードのステータス表示
- 紛争対応フローの自動判定
