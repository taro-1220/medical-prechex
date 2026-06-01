# PATIENT_CHECK_FLOW — 患者チェックフロー

## 役割
患者が予約から来院確認までたどるフローのドメインルールを定義する。
各ステップで何が必要で、何が起きると先に進めないかを明確にする。

## 管理対象
- 予約フローのステップ定義
- 各ステップの完了条件と失敗時の分岐
- 来院確認の操作主体と手順
- 患者へのステータス通知タイミング

## 書いてよい内容
- ステップごとの入力・処理・出力
- 失敗時（オーソリ失敗・カード登録失敗等）の患者向け案内方針
- 来院確認の確定操作とその不可逆性
- 患者がキャンセルできるタイミングと制限

## 書いてはいけない内容
- 実装コード・APIスキーマ
- UI文言の詳細（→ UX_RULES.md へ）
- キャンセル料の計算ロジック（→ CANCELLATION_POLICY.md へ）

## 更新ルール
- フローの変更はSTATE_MACHINE.mdと同期して更新する
- 患者からの問い合わせで多い混乱ポイントを「注意点」として追記する

## 予約フロー

### Step 1: 予約情報入力
- 入力: 日時・診療科目・人数・患者基本情報
- 出力: `appointment` レコード (`status=draft`)
- 失敗: バリデーションエラー → 入力画面に戻す

### Step 2: キャンセルポリシー同意
- 表示: ポリシー全文（バージョン番号付き）
- 入力: 同意ボタンタップ
- 出力: `consent_log` レコード (`agreed_at`, `policy_version`, `ip_address`)
- 失敗: 同意しない → 予約キャンセル（`draft` 削除）
- **禁止**: このステップをスキップして先に進む

### Step 3: カード登録
- 処理: Stripe SetupIntent 発行 → 患者がカード情報入力
- 出力: Stripe `customer_id` + `payment_method_id` をDBに保存
- Webhook: `setup_intent.succeeded` でDB更新
- 失敗: カード登録失敗 → 再試行促す（3回失敗で予約キャンセル候補）
- **禁止**: SetupIntent成功のWebhook受信前にカード登録済みと表示

### Step 4: オーソリ（予約確定）
- 処理: PaymentIntent 発行 (`capture_method=manual`)
- 出力: `appointment.status = authorized`, `authorization_id` 保存
- Webhook: `payment_intent.requires_capture` でDB更新
- 失敗: オーソリ失敗 → `status = card_pending` に戻す + 患者通知
- **禁止**: オーソリ失敗時に「予約が確定しました」と表示

### Step 5: 来院確認（クリニック操作）
- 操作主体: クリニックスタッフ
- 処理: ダッシュボードで「来院確認」ボタン押下
- 出力: `appointment.status = visited`, `visited_at` 保存
- この操作後: capture 処理へ進む（または手動 capture）
- **不可逆**: 来院確認後の取り消し禁止

### Step 6: 会計・capture
- 処理: PaymentIntent の capture API 呼び出し
- 出力: `appointment.status = completed`, `captured_at` 保存
- Webhook: `payment_intent.succeeded` でDB更新
- 失敗: capture失敗 → OPERATIONS_OS.md の障害対応フローへ

## 患者がキャンセルできるタイミング
- `consent_pending` / `card_pending` / `authorized`: キャンセル可能（ポリシーに従い料金発生の可能性）
- `visited` 以降: キャンセル不可

## 関連する状態
- STATE_MACHINE.md: status 遷移定義
- EVENT_MODEL.md: 各ステップで発生するイベント

## 関連する事故パターン
- Step 4 でオーソリ失敗したが「確認中」と表示し、患者が来院して無断キャンセル扱いに
- Step 3 の Webhook 未着でカード登録済みと表示したが実際はカード未登録
- Step 5 の来院確認を誤操作し、来院していない患者に請求が発生

## 将来の再利用先
- オンライン診療・遠隔相談への適用（来院確認が「開始確認」になる）
- 美容・パーソナルジム向けの来店確認フロー
