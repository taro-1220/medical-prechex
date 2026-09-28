"use client";

export default function StripePreCheckModal({
  onProceed,
  onClose,
}: {
  onProceed: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-lg p-6">
        <h2 className="text-lg font-black text-gray-900 mb-4">お支払い連携（Stripe）を始める前に</h2>

        <p className="text-xs font-bold text-gray-500 mb-1.5">準備物</p>
        <ul className="text-sm text-gray-700 leading-relaxed list-disc pl-5 mb-4 space-y-1">
          <li>通帳（銀行コード・支店コード・口座番号・口座名義カナ）</li>
          <li>院長の生年月日・住所（漢字とカナ）・電話・メール</li>
          <li>本人確認書類（求められる場合があります）</li>
        </ul>

        <p className="text-xs text-gray-500 mb-4">所要時間の目安：15〜20分</p>

        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed mb-6 space-y-1">
          <p className="font-bold">院長ご本人が入力してください</p>
          <p>途中で閉じても、この画面から続きから再開できます</p>
          <p>ボタンを押すと Stripe の画面が開きます。案内のリンクは数分で無効になるため、そのまま最後まで入力してください</p>
        </div>

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
