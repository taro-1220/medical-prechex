# PAYMENT_ARCHITECTURE — 決済アーキテクチャ（将来形）

## 役割
将来の予約保証登録・Authorization・Capture・返金の設計方針を定義する。
MVPスコープ外の決済設計を先行して記録し、V2実装時の判断基準とする。

## 重要: MVPとの関係

**MVP（V1）では決済を実装しない。**

| 項目 | MVP | 将来（V2以降） |
|---|---|---|
| Stripe | 未使用 | SetupIntent / PaymentIntent |
| カード登録 | なし | SetupIntent (usage=off_session) |
| Authorization | なし | capture_method=manual |
| Capture | なし | 来院確認後またはキャンセル時 |
| Apple Pay / Google Pay | なし | 患者向け優先決済手段 |
| 決済文言 | 使用禁止 | 患者向けは「予約保証登録」等 |

**MVPの実装範囲は MVP_SCOPE.md が定義する。本ファイルは将来構想の記録であり、MVP実装判断に使用しない。**

---

## 管理対象
- PaymentIntent ライフサイクルとDB状態の対応
- capture タイミングとその条件
- キャンセル料計算・回収フロー
- 失敗時のリカバリパス
- 冪等性キーの設計

## 書いてよい内容
- Stripe APIの使用方針（capture_method, setup_future_usage 等）
- イベントとDB更新の順序
- 二重 capture 防止の具体的メカニズム
- Authorization 失効の監視と対処
- キャンセル料の計算ロジック設計（コードなし）

## 書いてはいけない内容
- 実装コード・Stripe SDK呼び出し
- クリニック個別の料金設定（→ CANCELLATION_POLICY.md へ）
- 患者向けUI文言（→ CONSENT_UX.md へ）

## 更新ルール
- Stripe APIバージョンを変更する際は影響するフローを全列挙してから更新する
- capture失敗のリカバリパスを変更する際は事故パターンとセットで記録する

---

## 将来の決済フロー概要

```
予約発生
  → SMS / LINE 送信（将来チャネル）
  → 患者が予約確認
  → キャンセルポリシーに同意
  → Apple Pay / Google Pay / カード番号入力
  → 予約保証登録（SetupIntent）
  → Authorization（PaymentIntent, capture_method=manual）
  → QR発行
  → 来院
  → QR確認
  → 来院確認
  → Authorization 解放（cancel PaymentIntent）

例外: 無断キャンセル
  → キャンセルポリシー判定
  → Capture（部分または全額）
```

## 患者向け文言ルール（将来実装時も適用）

使用しない表現:
- オーソリ / Authorization / Capture
- 決済完了 / 支払い済み
- キャンセル料回収 / ペナルティ / 自動徴収

使用する表現:
- 予約保証登録
- QR来院確認
- 予約確定チケット
- 来院用QR
- 予約確認対象額

---

## 二重 capture 防止（将来実装時）

- capture 前に DB で `capture_requested_at IS NULL` を確認
- capture API 呼び出し時は冪等性キーを使用
- Webhook 受信時のみ DB の status を更新（API レスポンスで更新しない）

## Authorization 失効対策（将来実装時）

- Authorization 発行から6日後に警告通知
- 失効前日に自動延長試行
- 失効した場合は `authorization.expired` イベントを記録し `guaranteed` に戻す

---

## 関連する状態
- STATE_MACHINE.md: 将来ステータス（`guaranteed` / `authorization_succeeded` 等）
- EVENT_MODEL.md: 将来イベント一覧
- MVP_SCOPE.md: V1スコープ（決済はアウトスコープ）

## 関連する事故パターン
- Webhook 未着でDB状態が stale のまま処理が進む
- capture を API レスポンスで更新し Webhook と二重更新
- Authorization 失効を検知できず「保証済み」と表示し続ける

## 将来の再利用先
- 美容・ホテル等、Authorization→来店確認→captureが必要な業種全般
- サブスクリプション型医療（定期受診保証料）への応用
