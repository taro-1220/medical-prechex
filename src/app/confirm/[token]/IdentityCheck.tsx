"use client";
import { useState } from "react";

/** 確認URLの操作前の本人確認。電話番号があれば下4桁、無ければフルネームで照合する。 */
export default function IdentityCheck({ token, hasPhone, onVerified }: { token: string; hasPhone: boolean; onVerified: () => void }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${token}/verify-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: value }),
      });
      if (res.ok) {
        onVerified();
      } else {
        setError("確認できませんでした");
      }
    } catch {
      setError("確認できませんでした");
    } finally {
      setSubmitting(false);
      setValue("");
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">本人確認</p>
      <p className="text-sm text-gray-700 leading-relaxed">
        {hasPhone
          ? "ご予約時にお伺いした、お電話番号の下4桁を入力してください"
          : "ご予約時にお伺いした、お名前（フルネーム）を入力してください"}
      </p>
      <div className="flex gap-2">
        <input
          type={hasPhone ? "tel" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={hasPhone ? "1234" : "山田 太郎"}
          maxLength={hasPhone ? 4 : 50}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          onClick={submit}
          disabled={submitting || !value.trim()}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50"
        >
          {submitting ? "確認中..." : "確認する"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
