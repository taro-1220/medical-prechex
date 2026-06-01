# UI_FLOW — MVP画面遷移定義

## 役割
MVPの画面構成・遷移・表示項目・文言ルールを定義する。
実装前に「何を作るか」を固定し、画面ごとのステータス・イベント対応を明記する。

## 管理対象
- 画面一覧と遷移パス
- 画面ごとの表示項目
- 画面ごとのステータス対応（STATE_MACHINE.md）
- 画面操作ごとのイベント対応（EVENT_MODEL.md）
- 文言ルール

## 書いてよい内容
- 画面名・ルート・遷移パス
- 表示項目・入力項目の定義
- UI文言のOK/NG

## 書いてはいけない内容
- 実装コード・コンポーネント名
- スタイル・カラーコード（→ 実装ファイルへ）
- 決済・Stripe関連（→ PAYMENT_ARCHITECTURE.md へ）

## 更新ルール
- 画面追加時は遷移パス・ステータス対応・イベント対応を必ず明記する
- 文言変更は NG/OK ルールを参照してから行う

---

## 文言ルール

### NG（使用禁止）

- 決済 / 支払い済み / 決済完了
- オーソリ / Authorization / Capture
- キャンセル料回収 / 自動徴収
- 損失ゼロ / ペナルティ

### OK（使用推奨）

- 予約確認 / 同意取得 / QR来院確認
- 予約確定チケット / 来院用QR
- 無断キャンセル抑止 / 受付業務効率化
- 予約確認対象額 / 予約保証（将来）

---

## クリニック側 画面遷移

```
/clinic               予約一覧
  ↓
/clinic/new           新規予約作成
  ↓
/clinic/new → 完了    予約作成完了 + 確認URL発行
  ↓
/clinic               確認状況管理（一覧に戻る）
  ↓（確認済の予約）
来院確認ボタン         来院確認
```

### 画面: 予約一覧 `/clinic`

**表示ステータス対応**

| 表示ラベル | appointment.status |
|---|---|
| 確認待ち | confirmation_pending |
| 確認済 | confirmed / ticket_issued |
| 来院済 | checked_in / completed |
| キャンセル | cancelled / expired |

**上部サマリー**

| 項目 | 集計対象 |
|---|---|
| 本日の予約 | appointmentAt が今日 |
| 確認待ち | status = confirmation_pending |
| 確認済 | status = confirmed または ticket_issued |
| 来院済 | status = checked_in |
| キャンセル | status = cancelled または expired |

**操作**
- 新規予約ボタン → `/clinic/new`
- 確認URLコピーボタン（各行）→ クリップボードへコピー
- 来院確認ボタン（confirmed / ticket_issued の行のみ表示）

**発火イベント**
- 来院確認ボタン押下 → `checked_in`

---

### 画面: 新規予約作成 `/clinic/new`

**入力項目**

| 項目 | 必須 | 備考 |
|---|---|---|
| 患者名 | ✅ | |
| 電話番号 | — | sms 将来対応 |
| メールアドレス | — | email 将来対応 |
| 予約日時 | ✅ | |
| 予約内容 | ✅ | 診療内容・処置など |
| キャンセルポリシー | ✅ | テキスト入力。クリニックが自由記述 |

**送信後**
- ステータス: `confirmation_pending` に遷移
- 発火イベント: `reservation_created` → `confirmation_url_generated`
- 確認URLを画面に表示
- URLコピーボタンを表示

---

### 画面: 予約作成完了（インライン表示 or モーダル）

**表示項目**
- 確認URL（テキスト表示）
- URLコピーボタン
- 送信手段セクション:
  - SMS: 「準備中」
  - メール: 「準備中」
  - LINE: 「準備中」
- 「予約一覧に戻る」リンク

---

## 患者側 画面遷移

```
/confirm/[token]          予約確認画面
  ↓（同意チェック + 確定ボタン）
/confirm/[token]/complete QR来院チケット
```

### 画面: 予約確認 `/confirm/[token]`

**対応ステータス**: `confirmation_pending`（それ以外はエラーまたは完了済み表示）

**表示項目**
- クリニック名
- 患者名
- 予約日時
- 予約内容
- キャンセルポリシー（全文表示）
- 同意チェックボックス: 「キャンセルポリシーを確認しました」
- CTA: 「予約内容を確認して確定」（同意チェック後のみ活性）

**発火イベント（順序）**
1. 画面表示 → `confirmation_opened`
2. ポリシー表示 → `policy_viewed`
3. 同意チェック → `policy_consented`
4. 確定ボタン押下 → `confirmation_completed` → `qr_issued`

**エラーケース**

| ケース | 表示 |
|---|---|
| token が存在しない | 「予約が見つかりません」 |
| status = confirmed / ticket_issued 以降 | 「予約はすでに確認済みです」+ QRへのリンク |
| status = cancelled | 「この予約はキャンセルされました」 |
| status = expired | 「確認期限が過ぎています。クリニックにお問い合わせください」 |

---

### 画面: QR来院チケット `/confirm/[token]/complete`

**対応ステータス**: `confirmed` / `ticket_issued`

**表示項目**
- ヘッダー: 「予約確定チケット」
- バッジ群:
  - ✓ 予約確認済
  - ✓ 同意取得済
  - ✓ 来院用QR
- QRコード（予約番号またはtoken をエンコード）
- 予約番号
- クリニック名
- 予約日時
- 予約内容

**発火イベント**
- 画面表示 → `qr_issued`（未発行の場合）

---

## ステータス × 画面 対応表

| appointment.status | クリニック側表示 | 患者側アクセス結果 |
|---|---|---|
| `created` | （遷移中・通常見えない） | URLなし |
| `confirmation_pending` | 確認待ち | 予約確認画面を表示 |
| `confirmed` | 確認済 | QR来院チケットを表示 |
| `ticket_issued` | 確認済（QR発行済） | QR来院チケットを表示 |
| `checked_in` | 来院済（MVP terminal） | 「来院確認済みです」 |
| `cancelled` | キャンセル | 「キャンセルされました」 |
| `expired` | キャンセル | 「確認期限切れ」 |

---

## 画面 × イベント 対応表

| 画面操作 | 発火イベント |
|---|---|
| クリニック: 予約作成フォーム送信 | `reservation_created` |
| クリニック: 確認URL発行 | `confirmation_url_generated` |
| 患者: 確認URLを開く | `confirmation_opened` |
| 患者: ポリシー表示 | `policy_viewed` |
| 患者: 同意チェック | `policy_consented` |
| 患者: 確定ボタン押下 | `confirmation_completed` |
| システム: QRチケット生成 | `qr_issued` |
| クリニック: 来院確認ボタン | `checked_in` |
| システム: 来院完了処理 | `reservation_completed`（V2以降） |
| クリニック/患者: キャンセル操作 | `reservation_cancelled` |
| システム: 確認期限切れ検知 | `confirmation_expired` |

---

## 関連する状態
- STATE_MACHINE.md: ステータス定義・遷移ルール
- EVENT_MODEL.md: イベント定義・ペイロード
- MVP_SCOPE.md: V1スコープ（決済はアウトスコープ）
- CONSENT_UX.md: 同意UXの詳細ルール
