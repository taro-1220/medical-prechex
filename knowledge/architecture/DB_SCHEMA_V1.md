# DB_SCHEMA_V1 — MVPデータベーススキーマ設計

## 役割
MVP（V1）で必要なテーブル構成・フィールド・制約を定義する。
実装時のマイグレーション設計と「なぜそのテーブルに置くか」の根拠として使う。

## 管理対象
- MVPで作成するテーブルの設計
- テーブル間の関係と依存
- 将来拡張で分離する項目の予告

## 書いてよい内容
- テーブル定義・フィールド名・型・制約
- SSOT判定
- 将来分離候補の明示

## 書いてはいけない内容
- 実装コード・ORM定義
- RLS設定値
- 個別クリニックのデータ

## 更新ルール
- マイグレーション実行後に実テーブルと差異が生じた場合は即更新
- 新フィールド追加時は「追加理由」と「既存レコードへの影響」を明記

---

## MVP方針

- **決済なし**: Stripe / Apple Pay / Google Pay / Authorization / Capture は V1 スコープ外
- **本番DB変更なし（設計フェーズ）**: 本ドキュメントはスキーマ設計文書。実マイグレーションは別途
- **将来Stripe用テーブルは作らない**: `payment_intents` / `stripe_customers` / `card_registrations` はV2以降
- **RLSはV1スコープ外**: クリニック間データ分離は V2 でマルチテナント化時に設計
- **実装済みテーブル**: `appointments`（既存）。今後 `consent_logs` / `event_logs` を追加

---

## テーブル一覧

| テーブル | MVPステータス | 役割 |
|---|---|---|
| `appointments` | ✅ 実装済み | 予約の正本 |
| `consent_logs` | 🔵 MVP候補 | 患者同意の証拠記録（追記のみ） |
| `event_logs` | 🔵 MVP候補 | 状態遷移の監査ログ（追記のみ） |
| `notification_logs` | ⬜ 将来拡張 | SMS/メール/LINE送信ログ |
| `patients` | ⬜ 判断保留 | 患者の分離管理（下記参照） |

---

## appointments テーブル（実装済み）

**役割**: 予約の唯一の正本（SSOT）。患者情報・日時・ポリシー・ステータスを一元管理する。

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | 不変 |
| `token` | text | unique, not null | 確認URL用トークン |
| `clinic_name` | text | not null, default '' | クリニック名（MVP: クリニック認証なし） |
| `patient_name` | text | not null | 患者名 |
| `phone` | text | not null, default '' | 電話番号 |
| `email` | text | not null, default '' | メールアドレス |
| `communication_channel` | text | not null, default 'manual' | SMS / email / line / manual |
| `appointment_at` | timestamptz | not null | 予約日時（SSOT: epoch ms基準） |
| `description` | text | not null, default '' | 予約内容 |
| `cancellation_policy` | text | not null, default '' | 表示文面（同意時の全文を保存） |
| `status` | text | not null, default 'confirmation_pending' | 下記ステータス定義 |
| `consent_at` | timestamptz | nullable | 患者同意日時 |
| `checked_in_at` | timestamptz | nullable | 来院確認日時 |
| `cancelled_at` | timestamptz | nullable | キャンセル日時 |
| `created_at` | timestamptz | not null, default now() | 作成日時 |
| `updated_at` | timestamptz | not null, default now() | 更新日時（trigger自動更新） |

**ステータス定義**:

| status | 意味 |
|---|---|
| `confirmation_pending` | 作成済み・患者確認待ち |
| `confirmed` | 患者が同意・確定 |
| `ticket_issued` | 来院チケット発行済み（将来） |
| `checked_in` | 来院確認済み |
| `cancelled` | キャンセル |
| `expired` | 確認期限切れ |

**SSOT可否**: ✅ 正本。appointment.statusはDB正本。Stripe等の外部サービスがない場合は唯一の真実。

**作成タイミング**: クリニックスタッフが `/clinic/new` から予約作成時

**更新可能主体**: クリニックスタッフ（ステータス変更）/ 患者（confirmation_pending → confirmed）/ システム（expired自動更新・将来）

**削除可否**: 禁止。キャンセルは `status: cancelled` で表現する。

**将来拡張で分離する項目**:
- `clinic_name` → `clinic_id` (clinics テーブル参照) に変更（マルチテナント化時）
- `patient_name / phone / email` → `patient_id` (patients テーブル参照) に変更（患者管理強化時）
- `cancellation_policy` → `policy_id` (cancellation_policies テーブル参照) に変更（ポリシーバージョン管理時）

---

## consent_logs テーブル（MVP候補）

**役割**: 患者が同意した事実を不変の証拠として記録する。`appointments.consent_at` は参照用。本証拠はこのテーブル。

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | uuid | PK | 不変 |
| `appointment_id` | uuid | FK → appointments.id, not null | 対象予約 |
| `policy_text` | text | not null | 同意時に表示した全文 |
| `policy_text_hash` | text | not null | SHA-256等。改ざん検知用 |
| `consented_at` | timestamptz | not null | 同意日時（epoch ms精度） |
| `ip_address` | text | nullable | 患者のIPアドレス（紛争対応用） |
| `user_agent` | text | nullable | ブラウザ情報（紛争対応用） |
| `created_at` | timestamptz | not null, default now() | 追記日時 |

**SSOT可否**: ✅ 同意証拠の正本。`appointments.consent_at` より優先する。

**作成タイミング**: 患者が `/confirm/[token]` で確認ボタンを押した瞬間

**更新可能主体**: なし（追記のみ。UPDATE / DELETE 禁止）

**削除可否**: 禁止。法的証拠として保全。

**将来拡張**:
- `policy_version_id` (cancellation_policies テーブル参照) を追加してポリシーバージョンと紐付け

---

## event_logs テーブル（MVP候補）

**役割**: 予約に関するすべての状態変化・操作を時系列で記録する監査ログ。紛争時に「いつ・誰が・何をしたか」を証明する。

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | uuid | PK | 不変 |
| `appointment_id` | uuid | FK → appointments.id, not null | 対象予約 |
| `event_type` | text | not null | 下記イベント種別 |
| `actor` | text | not null | `clinic` / `patient` / `system` |
| `before_status` | text | nullable | 変更前ステータス |
| `after_status` | text | nullable | 変更後ステータス |
| `metadata` | jsonb | nullable | イベント固有の追加情報 |
| `created_at` | timestamptz | not null, default now() | 発生日時 |

**イベント種別（event_type）**:

| event_type | 説明 |
|---|---|
| `appointment.created` | 予約作成 |
| `appointment.confirmed` | 患者確認完了 |
| `appointment.checked_in` | 来院確認 |
| `appointment.cancelled` | キャンセル |
| `appointment.expired` | 期限切れ |
| `consent.recorded` | 同意記録 |

**SSOT可否**: ✅ 状態遷移の監査記録。append-only。

**作成タイミング**: 各ステータス変更時にシステムが自動記録

**更新可能主体**: なし（追記のみ）

**削除可否**: 禁止。

**将来拡張**:
- `clinic_id` の追加（マルチテナント対応）
- Webhook送信ログとの紐付け

---

## patients テーブル（判断保留）

**MVPでの扱い**: 患者情報は `appointments` テーブル内に非正規化して保存する（`patient_name / phone / email`）。

**分離する場合の判断基準**:
- 同一患者が複数予約を持つケースが月10件以上発生する
- クリニックが「患者ごとの予約履歴」を必要とする
- 患者ログイン機能を実装する

**分離しない場合のリスク**:
- 患者情報の変更（電話番号変更等）が各予約に反映されない
- 将来の移行コスト

**MVPの判断**: 分離しない。`appointments` 内の非正規化で十分。V2で判断する。

---

## 関連するドキュメント
- STATE_MACHINE.md: appointments.status 遷移定義
- SSOT.md: 各エンティティの正本定義
- CANCELLATION_POLICY.md: cancellation_policy フィールドの設計根拠
- MVP_SCOPE.md: V1スコープ（決済なし・Stripe外し）

## 将来の再利用先
- V2マルチテナント設計（clinics テーブル追加）
- V2決済設計（payment_intents テーブル追加）
- V2ポリシーバージョン管理（cancellation_policies テーブル追加）
