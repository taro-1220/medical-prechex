"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [clinicName, setClinicName]     = useState("");
  const [directorName, setDirectorName] = useState("");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/clinic/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicName, directorName, email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        body.error === "email_already_registered"
          ? "このメールアドレスは既に登録されています。ログインまたはパスワード再設定をご利用ください。"
          : (body.error ?? "登録に失敗しました");
      setError(message);
      setLoading(false);
      return;
    }
    router.push("/signup/check-email");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <span className="text-xl font-black text-teal-700">medipre</span>
          <p className="text-xs text-gray-400 mt-0.5">医院アカウントの新規登録</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                医院名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required value={clinicName}
                onChange={e => setClinicName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">院長名</label>
              <input
                type="text" value={directorName}
                onChange={e => setDirectorName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード <span className="text-red-500">*</span>
              </label>
              <input
                type="password" required minLength={6} value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-teal-600 rounded-xl font-bold text-sm text-white hover:bg-teal-700 transition disabled:opacity-50"
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">ご利用料金</p>
          <div className="space-y-2 text-sm text-gray-700">
            <p>入会金・初期費用: <span className="font-bold text-gray-900">無料</span></p>
            <p>キャンセル料回収機能を有効化した月から: <span className="font-bold text-gray-900">月額9,800円</span>（初月無料）</p>
            <p>回収成功時の手数料: <span className="font-bold text-gray-900">5%</span></p>
          </div>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            まずは無料でお試しいただけます。キャンセル料回収機能を使わない場合、費用は発生しません。
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">ご登録後の流れ</p>
          <ol className="space-y-2 text-sm text-gray-700">
            <li><span className="font-bold text-gray-900">1. お申し込み</span></li>
            <li><span className="font-bold text-gray-900">2. 運営事務局で確認</span></li>
            <li><span className="font-bold text-gray-900">3. ご利用開始</span></li>
          </ol>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            登録内容は運営事務局で確認のうえ、承認され次第ご利用を開始いただけます。
          </p>
        </div>
      </div>
    </div>
  );
}
