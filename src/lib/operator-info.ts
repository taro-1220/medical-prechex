// /about（サービス紹介・Stripe審査用ページ）が参照する、運営者情報と料金の単一の定数。
// 数字はここだけを直す。サインアップ画面（src/app/signup/page.tsx）は既存のハードコードのまま、
// 今回は連動させない。
export const OPERATOR_INFO = {
  serviceName: "Medipre",
  representative: "金子太郎",
  contactEmail: "support@medipre.jp",
} as const;

export const PRICING = {
  setupFeeLabel: "入会金・初期費用",
  setupFeeValue: "無料",
  monthlyFeeYen: 9800,
  monthlyFeeNote: "税別。キャンセル料回収機能を有効化した月が初月で、初月は無料です",
  collectionFeePercent: 5,
  collectionFeeNote: "回収に成功したキャンセル料の5%（当方の取り分）",
  stripeFeePercent: 3.6,
  stripeFeeNote: "Stripeの決済手数料（3.6%）は医院の負担です",
} as const;
