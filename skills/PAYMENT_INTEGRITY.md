# PAYMENT_INTEGRITY — 決済整合性ガイド

## 役割
決済フローに関わる実装・レビュー時に確認すべきチェックリストを提供する。
二重請求・無請求・状態乖離を設計段階で防ぐ。

## 管理対象
- 決済フロー実装前チェックリスト
- レビュー時の必須確認項目
- テストケースの設計ガイド
- 本番確認手順

## 書いてよい内容
- 実装前・レビュー時・テスト時の確認項目
- テストシナリオの標準セット
- 本番で確認すべき指標

## 書いてはいけない内容
- 実装コード
- Stripe の設定値・APIキー

## 更新ルール
- 新しいリスクが INCIDENTS.md に追加されたときにチェックリストを更新する

## 実装前チェックリスト
- [ ] capture の実行条件を STATE_MACHINE.md と照合した
- [ ] 冪等性キーを設計した
- [ ] Webhook 駆動の状態更新パターンに従っている
- [ ] 部分失敗シナリオを TRANSACTIONAL_STATE_DESIGN.md で確認した
- [ ] オーソリ失効の処理を設計した
- [ ] 二重 capture 防止の排他チェックを設計した
- [ ] キャンセル料計算に同意時のポリシーバージョンを使う設計になっている

## レビュー必須確認項目
- [ ] Stripe API 呼び出しより前に DB を更新していないか
- [ ] API レスポンスで `captured_at` / `completed` を更新していないか（Webhook のみで更新すべき）
- [ ] capture 前に `capture_requested_at IS NULL` を確認しているか
- [ ] オーソリ失敗時に「確定済み」を示す表示がないか
- [ ] Stripe 状態と DB 状態の乖離を検知する仕組みがあるか

## テストシナリオ標準セット

| シナリオ | 確認項目 |
|---|---|
| 正常フロー（来院 → capture） | DB status = completed、Stripe = succeeded |
| オーソリ失敗 | DB status = card_pending、患者通知送信 |
| capture 失敗 | DB status = visited のまま、アラート送信 |
| Webhook 遅延 | DB 更新が遅延しても二重更新が発生しない |
| 同一冪等性キーで二重 capture 試行 | 二回目は Stripe が冪等性キーで弾く |
| オーソリ失効（7日超過） | DB status = card_pending に遷移、通知送信 |
| キャンセル料計算 | 同意時バージョンのポリシーで計算されている |
| チャージバック発生 | DB status = disputed、証拠パッケージ生成 |

## 本番確認指標（週次）
- Stripe と DB の status 乖離件数: 0 件
- `capture_requested_at IS NOT NULL AND captured_at IS NULL` の件数: 0 件（1日以上経過）
- `authorization.expired` イベント件数（増加なら監視強化）

## 関連する状態
- PAYMENT_ARCHITECTURE.md: 技術方針
- AUTH_AND_CAPTURE.md: ドメインルール
- INCIDENTS.md: 既知リスク

## 関連する事故パターン
- レビューで二重 capture パターンを見落とした
- テストで Webhook 遅延シナリオを省略した
- 本番乖離チェックを実装しなかった

## 将来の再利用先
- CI/CD パイプラインの自動チェックルール
- QAエンジニア向けテスト設計ガイド
