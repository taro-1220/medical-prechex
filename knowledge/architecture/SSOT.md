# SSOT — Single Source of Truth

## 役割
すべてのデータ読み書きにおいて「どのストアが正本か」を定義する。
dual writeを禁止し、正本以外を参照したことによる矛盾・紛争証拠欠如を防ぐ。

## 管理対象
- 各エンティティの正本ストア（DB / Stripe / ログサービス）
- 非正本として許容されるキャッシュ・UI stateの条件と寿命
- 乖離検知ルール

## 書いてよい内容
- エンティティごとの正本定義（テーブル名・フィールド名）
- 読み取り経路（どの順序でどのストアから読むか）
- 乖離許容条件（許容しない場合はその理由）
- Webhookや非同期イベントによる状態反映ルール

## 書いてはいけない内容
- 実装コード
- ORMスキーマ定義
- 特定フレームワーク固有の設定

## 更新ルール
- 新エンティティ追加時に必ず正本を明記してからテーブル設計を開始する
- fallback は原則禁止。重大障害時のみ例外を認める。例外を追加する場合は INCIDENTS.md への登録・撤去期限の明記・恒久化禁止を必須とする
- dual writeを例外的に許容する場合は事故パターンとともに記録する

## エンティティ正本マッピング
- `appointment.status`: DB（appointments テーブル）が正本。Stripeの PaymentIntent status は補助情報
- `consent.agreed_at`: DB（consent_logs テーブル）が正本。UI state は表示のみ
- `payment_intent.status`: Stripe が正本。DB は Webhook 反映後に更新
- `card.registered`: Stripe Customer / SetupIntent が正本。DB は reference のみ
- `event_log`: DB（event_logs テーブル）が正本。append-only。更新・削除禁止。Stripe Webhook 由来イベントも DB に書き込んだ時点で正本
- `cancellation_policy.version`: DB（cancellation_policies テーブル）が正本。不変。更新は新バージョン挿入のみ。キャンセル料計算・紛争対応では必ず同意時の version を参照する
- `notification_log`: DB（notification_logs テーブル）が正本。送信成否・content_hash を含む。配信プロバイダのステータスは補助情報

## 同意ログと請求の関係（SSOT原則）
- `consent_log` が存在しない予約への請求は禁止
- `consent_log` が請求可否判定の正本。UI state・セッション変数・キャッシュで代替しない
- `consent_log` には表示文面（または display_text_hash）・同意時刻・policy_version を必ず保存する

## 関連する事故パターン
- Webhook 未着でDB状態が stale のまま請求処理が進む
- UI state（予約確認済みフラグ）を正本として扱い、DBの状態と乖離
- キャンセルポリシー同意を localStorage に保存し、ブラウザクリアで消失
- Stripe の capture 結果を確認せず「請求完了」と表示

## 将来の再利用先
- 他業種（美容・ホテル）へのPrechex展開時の設計基準
- マルチテナント化時のテナント間SSOT分離ルール
