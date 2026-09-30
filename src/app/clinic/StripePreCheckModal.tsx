"use client";
import {
  calculateFeeExampleReceivedAmount,
  getSupportContactLine,
  STRIPE_FEE_RATE_DISPLAY,
  MEDIPRE_FEE_RATE_DISPLAY,
  FEE_EXAMPLE_AMOUNT,
} from "@/lib/clinic-auth";

const sectionHeadingCls = "text-xs font-bold text-gray-500 mb-1";
const sectionBodyCls = "text-sm text-gray-700 leading-relaxed mb-4";

/** 0.036 → "3.6"、0.05 → "5" のように、末尾の".0"を落として表示する */
function formatPercent(rate: number): string {
  return String(Number((rate * 100).toFixed(1)));
}

export default function StripePreCheckModal({
  onProceed,
  onClose,
}: {
  onProceed: () => void;
  onClose: () => void;
}) {
  const exampleAmount = FEE_EXAMPLE_AMOUNT;
  const exampleReceived = calculateFeeExampleReceivedAmount(exampleAmount);
  const contactLine = getSupportContactLine();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-lg p-6">
        <h2 className="text-lg font-black text-gray-900 mb-4">お支払い連携（Stripe）とは</h2>

        <p className={sectionHeadingCls}>1. これは何？</p>
        <p className={sectionBodyCls}>
          患者さんがキャンセルしたとき、予約時に登録されたカードからキャンセル料を自動で回収し、医院の銀行口座へ振り込むための設定です。
        </p>

        <p className={sectionHeadingCls}>2. お金の流れ</p>
        <p className={sectionBodyCls}>
          患者さんのカードから、医院の口座へ直接入ります。medipreがお金をお預かりすることはありません。決済には、世界中で使われている決済サービス「Stripe」を使います。
        </p>

        <p className={sectionHeadingCls}>3. これからの流れ</p>
        <ol className="text-sm text-gray-700 leading-relaxed mb-4 space-y-1.5">
          <li>①Stripeの画面に移動します（アドレスはconnect.stripe.comで始まる正規の画面です）</li>
          <li>②院長ご本人の情報と口座を入力します（15〜20分）</li>
          <li>③最後まで進むと、自動でmedipreに戻ります。</li>
        </ol>

        <p className={sectionHeadingCls}>4. なぜ本人確認が必要？</p>
        <p className={sectionBodyCls}>
          お金を受け取る方の本人確認は、法律で求められています。入力した情報はStripeに送られ、本人確認に使われます。
        </p>

        <p className={sectionHeadingCls}>5. 準備物</p>
        <ul className="text-sm text-gray-700 leading-relaxed list-disc pl-5 mb-4 space-y-1">
          <li>通帳（銀行コード・支店コード・口座番号・口座名義カナ）</li>
          <li>院長の生年月日・住所（漢字とカナ）・電話・メール</li>
          <li>本人確認書類（求められる場合があります）</li>
        </ul>

        <p className={sectionHeadingCls}>6. 手数料</p>
        <p className={sectionBodyCls}>
          回収したキャンセル料から、Stripeの決済手数料（{formatPercent(STRIPE_FEE_RATE_DISPLAY)}%）とmedipreの手数料（{formatPercent(MEDIPRE_FEE_RATE_DISPLAY)}%）が差し引かれます。
          <br />
          例：{exampleAmount.toLocaleString()}円を回収した場合、医院の受取額は{exampleReceived.toLocaleString()}円です。
        </p>

        <p className={sectionHeadingCls}>7. 補足</p>
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed mb-4 space-y-1">
          <p className="font-bold">院長ご本人が入力してください</p>
          <p>ボタンを押すと Stripe の画面が開きます。案内のリンクは数分で無効になるため、そのまま最後まで入力してください</p>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed mb-6">
          途中でやめても、続きから再開できます。この設定をしなくても、予約管理や空き枠通知は使えます。
          {contactLine && (
            <>
              <br />
              {contactLine}
            </>
          )}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            あとで
          </button>
          <button
            onClick={onProceed}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition"
          >
            準備できたので進む
          </button>
        </div>
      </div>
    </div>
  );
}
