# STATE_MACHINE — 予約状態遷移定義

## 役割
予約・同意・来院の状態遷移を一元定義する。
不正遷移を防ぎ、紛争時に「どの状態でどの操作が実行されたか」を再現できるようにする。

## 管理対象
- 予約ステータス (`appointment.status`) の遷移グラフ
- 同意ステータス (`consent.status`) の遷移グラフ
- 遷移条件・遷移禁止条件
- 遷移イベント名（EVENT_MODEL.md との対応）

## 書いてよい内容
- ステータス値の定義と意味
- 遷移可能なパスとその条件
- 遷移不可パスとその理由
- terminal state の定義

## 書いてはいけない内容
- 実装コード・ORM定義
- UIのステップ表示ロジック
- 個別クリニックの運用ルール（→ CANCELLATION_POLICY.md へ）

## 更新ルール
- 新ステータス追加前に「既存遷移への影響」を明記する
- terminal state を変更する場合は事故パターンとセットで記録する

---

## MVP ステータス定義

### 予約ステータス（appointment.status）

| status | 意味 |
|---|---|
| `created` | 予約作成済み。確認URL発行前 |
| `confirmation_pending` | 確認URL発行済み。患者の確認待ち |
| `confirmed` | 患者が予約確認・同意完了。来院待ち |
| `ticket_issued` | QR来院チケット発行済み |
| `checked_in` | 来院確認済み（MVP terminal） |
| `cancelled` | キャンセル（terminal） |
| `expired` | 確認期限切れ（terminal） |

### 正常遷移パス

```
created
  → confirmation_pending   （確認URL発行）
    → confirmed            （患者が同意完了）
      → ticket_issued      （QRチケット発行）
        → checked_in       （来院確認・MVP terminal）
```

### 例外遷移パス

```
confirmation_pending → expired   （確認期限切れ）
confirmation_pending → cancelled （クリニックがキャンセル）
confirmed           → cancelled  （クリニックがキャンセル）
ticket_issued       → cancelled  （クリニックがキャンセル）
```

---

## 将来ステータス（V2以降・決済実装後）

> MVP_SCOPE.md の V1 には含まれない。PAYMENT_ARCHITECTURE.md と対応する。

| status | 意味 |
|---|---|
| `completed` | 診察・会計完了（V2以降） |
| `guaranteed` | 予約保証登録完了（カード登録済み） |
| `authorization_pending` | Authorization 実行中 |
| `authorization_succeeded` | Authorization 完了。来院待ち |
| `authorization_released` | Authorization 解放（来院確認後） |
| `no_show` | 無断キャンセル検知 |
| `capture_pending` | Capture 実行中 |
| `captured` | Capture 完了 |
| `refunded` | 返金完了 |

---

## 遷移禁止ルール

- `completed` → いかなる状態へも遷移不可（terminal）
- `cancelled` → いかなる状態へも遷移不可（terminal）
- `expired` → いかなる状態へも遷移不可（terminal）
- 同意ログのない状態で `confirmed` へ遷移不可
- `confirmation_pending` 以前の状態でQRチケット発行不可

---

## 状態管理の禁止事項

- **localStorage を状態の正本・復元・同期に使用することを禁止**
  - UI の表示補助・一時キャッシュ目的のみ許容
  - localStorage がクリアされても業務状態が失われない設計にする
- 同意ログ・状態遷移ログは **分離して保存する**
  - `consent_logs`（同意の証拠）
  - `appointment_transitions`（状態遷移の証拠）
  - 1テーブルに混在させない

---

## 関連する事故パターン

- 同意ログなしで `confirmed` に遷移し紛争時に証明できない
- `expired` 状態の予約で来院確認が実行される
- 遷移ログがなく紛争時に経緯を証明できない

## 画面との対応
UI_FLOW.md の「ステータス × 画面 対応表」を正本とする。

| appointment.status | クリニック表示ラベル |
|---|---|
| `confirmation_pending` | 確認待ち |
| `confirmed` / `ticket_issued` | 確認済 |
| `checked_in` / `completed` | 来院済 |
| `cancelled` / `expired` | キャンセル |

## 将来の再利用先
- リマインダー・通知の送信タイミング定義
- 管理画面のステータス表示
- 紛争対応フローの自動判定
