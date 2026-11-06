# 保険診療キャンセル料の法的要件（2026-11作成）

## 前提（出典）

- 消費者契約法 第9条: 消費者契約の解除に伴う損害賠償額等を予定する条項について、「事業者に生ずべき平均的な損害の額を超える部分」は無効。
- 保医発0327第7号（2026-06-01施行）: 保険診療のキャンセル料は、選定療養「予約に基づく診察」として地方厚生局へ届出し、予約料を設定している医療機関で、診察日の直前に患者都合でキャンセルされた場合に限り徴収可能。徴収には、院内掲示・Web掲載・患者への説明・患者の同意・社会的に妥当な金額・他の費用と区別した領収証が必要。
- 2026-05-29の疑義解釈資料 問1（本リポジトリでは原文を未保有。ユーザー指示に基づく記載）。
- 2026-05-29の厚労省の通知訂正に関する報道（同上。原文未確認）。

## 実装した制御

1. **サーバー側の課金ゲート**（`src/lib/charge-policy.ts` の `evaluateChargeEligibility`、呼び出し元: `src/lib/charge-execution.ts` の `attemptCancelCharge`）
   - 予約の `treatmentCategory === "insurance"` かつ、医院の `insuranceNotificationConfirmedAt`（3項目確認日時）が未設定の場合、`blockedBy` に `insurance_notification_required` を追加し、課金を実行しない。
   - この判定は、患者起点のキャンセル（`/api/appointments/[token]/cancel-request`）、スタッフ起点のキャンセル記録（`/api/clinic/appointments/[id]/cancel`）、無断判定cron（`/api/cron/daily`）の3経路すべてで共通して効く（`attemptCancelCharge` を経由するため）。
   - 判定パネル（`/api/clinic/appointments/[id]/judgment`）にも同じ理由を表示する。
2. **設定保存時のサーバー側検証**（`src/app/api/clinic/cancel-policy/route.ts`）
   - `scope` が `insurance`／`both` の場合、`insuranceNotificationConfirmed`（3項目すべてチェック済み）が `true` でなければ `400 insurance_notification_confirmation_required` で保存を拒否する。
3. **確認日時の保存**（`clinic_profile.cancel_policy_insurance_notification_confirmed_at`、migration 023・未適用）
   - 3項目を個別には保存せず、「3項目すべて確認した」時点の1つの日時のみ保存する。
   - 一度確認済みになった後は、他の設定を保存しても確認日時は変わらない（チェックを外した場合のみ `null` に戻る）。
4. **未適用でも安全側で動く**
   - migration 023未適用（列が存在しない）の間、列へのSELECT/UPDATEは失敗するが、アプリ側はこれを検出して例外を投げず、「未確認（`null`）」として扱う。結果として、migration未適用の間は保険診療へのキャンセル料課金が常にブロックされる（安全側）。
5. **設定画面の表示**（`src/app/clinic/onboarding/page.tsx`）
   - scope に insurance を含む場合のみ、3項目チェックボックスと簡潔な説明を表示する。
   - 段階テーブル（%入力）の近くに、消費者契約法9条の案内文を表示する（自由診療・保険診療の両方に表示。法的な断定はしない）。

## 未確認事項（弁護士・地方厚生局への確認が必要）

- 歯科診療への適用の詳細（本実装は医科と歯科を区別していない。保医発0327第7号の歯科への適用範囲は未確認）。
- 「診察日の直前」の具体的な基準（本実装は既存の `grace_hours` ／ tiers 設定をそのまま使っており、2026-06-01施行の要件に合わせた基準の見直しは行っていない）。
- 届出の要否・届出番号の確認方法の詳細（本実装は医院の自己申告チェックのみで、届出の実在性をシステム側で検証していない）。
