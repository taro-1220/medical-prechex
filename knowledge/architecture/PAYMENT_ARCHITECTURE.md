# PAYMENT_ARCHITECTURE — 決済アーキテクチャ

## 役割
オーソリ・capture・キャンセル料回収・返金の設計方針を定義する。
Stripe状態とDB状態の乖離、二重capture、オーソリ失効を防ぐ。

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
- オーソリ失効の監視と対処
- キャンセル料の計算ロジック設計（コードなし）

## 書いてはいけない内容
- 実装コード・Stripe SDK呼び出し
- クリニック個別の料金設定（→ CANCELLATION_POLICY.md へ）
- 患者向けUI文言（→ CONSENT_UX.md へ）

## 更新ルール
- Stripe APIバージョンを変更する際は影響するフローを全列挙してから更新する
- capture失敗のリカバリパスを変更する際は事故パターンとセットで記録する

## 決済フロー概要

```
患者 同意完了
  → SetupIntent 発行 (usage=off_session)
  → カード登録完了 (Webhook: setup_intent.succeeded)
  → DB: card_registered = true

予約確定時
  → PaymentIntent 発行 (capture_method=manual, confirm=true)
  → Webhook: payment_intent.requires_capture
  → DB: authorization_id = pi_xxx, status = authorized

来院確認時
  → capture API 呼び出し（冪等性キー: appointment_id）
  → Webhook: payment_intent.succeeded
  → DB: status = completed, captured_at = now

キャンセル時
  → キャンセル料計算（同意済みポリシーを参照）
  → キャンセル料あり: capture（部分または全額）
  → キャンセル料なし: cancel PaymentIntent
```

## 二重 capture 防止
- capture 前に DB で `capture_requested_at IS NULL` を確認
- capture API 呼び出し時は冪等性キーを使用
- Webhook 受信時のみ DB の status を更新（API レスポンスで更新しない）

## オーソリ失効対策
- オーソリ発行から6日後に警告通知
- 失効前日に自動延長試行（対応するStripe APIがあれば）
- 失効した場合は `authorization.expired` イベントを記録し `card_pending` に戻す
- 失効後に `authorized` のまま放置しない

## 関連する状態
- STATE_MACHINE.md: `authorized` / `completed` / `cancelled_charged`
- EVENT_MODEL.md: `authorization.succeeded` / `capture.succeeded` / `capture.failed`

## 関連する事故パターン
- Webhook 未着でDB状態が `card_pending` のまま来院日を迎える
- capture を API レスポンスで更新し Webhook と二重更新
- キャンセル料計算後 capture せずに返金処理が走る
- オーソリ失効を検知できず「保証済み」と表示し続ける

## 将来の再利用先
- 美容・ホテル等、オーソリ→来店確認→captureが必要な業種全般
- サブスクリプション型医療（定期受診保証料）への応用
