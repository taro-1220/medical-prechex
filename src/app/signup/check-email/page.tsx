export default function SignupCheckEmailPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-4xl mb-4">📩</p>
        <p className="font-bold text-gray-900 mb-2">確認メールを送信しました</p>
        <p className="text-sm text-gray-500 leading-relaxed">
          ご登録のメールアドレス宛に確認メールをお送りしました。メール内のリンクを開いて、登録を完了してください。
        </p>
      </div>
    </div>
  );
}
