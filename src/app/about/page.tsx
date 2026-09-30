import Link from "next/link";
import { OPERATOR_INFO, PRICING } from "@/lib/operator-info";

export const metadata = {
  title: "サービス紹介 | medipre",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 text-center">
        <span className="text-lg font-black text-teal-700">{OPERATOR_INFO.serviceName}</span>
        <p className="text-xs text-gray-400 mt-0.5">サービス紹介</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8 space-y-6">
          <h1 className="text-lg font-black text-gray-900">{OPERATOR_INFO.serviceName}について</h1>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">サービスの概要</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {OPERATOR_INFO.serviceName}は、歯科医院その他の医療機関向けに、予約確認、キャンセルポリシーへの同意取得、
              キャンセル料の自動回収、空き枠通知を提供するサービスです。医院と患者の間の予約・キャンセルのやり取りを、
              システムを通じて支援します。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">できること</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
              <li>予約確認：予約内容の確認URL・QRチケットの発行</li>
              <li>同意の取得：キャンセルポリシーへの患者の同意取得と記録</li>
              <li>キャンセル料の自動回収：患者が登録したカードへの、キャンセル料の自動請求</li>
              <li>空き枠通知：キャンセルで生じた空き枠を、希望する患者へ自動で通知</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">料金（医院向け）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{PRICING.setupFeeLabel}</td>
                    <td className="py-2 text-gray-900">{PRICING.setupFeeValue}</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap align-top">月額利用料</td>
                    <td className="py-2 text-gray-900">
                      {PRICING.monthlyFeeYen.toLocaleString()}円
                      <span className="block text-xs text-gray-500 mt-0.5">{PRICING.monthlyFeeNote}</span>
                    </td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap align-top">回収手数料</td>
                    <td className="py-2 text-gray-900">
                      {PRICING.collectionFeePercent}%
                      <span className="block text-xs text-gray-500 mt-0.5">{PRICING.collectionFeeNote}</span>
                    </td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap align-top">Stripe決済手数料</td>
                    <td className="py-2 text-gray-900">
                      {PRICING.stripeFeePercent}%
                      <span className="block text-xs text-gray-500 mt-0.5">{PRICING.stripeFeeNote}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">資金の流れ</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              キャンセル料は、患者のカードから、医院の Stripe アカウントへ直接入金されます。{OPERATOR_INFO.serviceName}は、
              資金を預かりません。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">運営者情報</h2>
            <ul className="text-sm text-gray-700 leading-relaxed space-y-1">
              <li>運営者：{OPERATOR_INFO.serviceName}</li>
              <li>代表者：{OPERATOR_INFO.representative}</li>
              <li>連絡先：{OPERATOR_INFO.contactEmail}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">お問い合わせ</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              サービスに関するお問い合わせは、{OPERATOR_INFO.contactEmail} までご連絡ください。
            </p>
          </section>

          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h2 className="text-base font-bold text-gray-900">規約</h2>
            <ul className="text-sm space-y-1">
              <li>
                <Link href="/terms/clinic" className="text-teal-700 underline underline-offset-2">
                  利用規約（医院向け）
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-teal-700 underline underline-offset-2">
                  利用規約（患者・サービス利用者向け）
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
