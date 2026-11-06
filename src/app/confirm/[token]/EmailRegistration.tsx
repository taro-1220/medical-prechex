"use client";
import { useState } from "react";
import { maskEmail } from "@/lib/contact-info";

/** 患者が自ら登録する、前日リマインド受取用メール（任意）。予約単位の保存で患者台帳は変更しない。 */
export default function EmailRegistration({ token, currentEmail }: { token: string; currentEmail?: string }) {
  const [editing, setEditing] = useState(!currentEmail);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | "invalid" | "rate_limited" | null>(null);

  const save = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/appointments/${token}/register-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (res.ok) {
        setResult("success");
        setEditing(false);
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.error === "invalid_email") setResult("invalid");
        else if (body.error === "rate_limited") setResult("rate_limited");
        else setResult("error");
      }
    } catch {
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">前日のお知らせを受け取るメールアドレス（任意）</p>
      {!editing && currentEmail ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700">登録済み：{maskEmail(currentEmail)}</span>
          <button
            onClick={() => { setEditing(true); setValue(""); setResult(null); }}
            className="text-xs text-teal-600 hover:underline shrink-0"
          >
            変更する
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="example@mail.com"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={save}
            disabled={submitting || !value.trim()}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存"}
          </button>
        </div>
      )}
      {result === "success" && <p className="text-xs text-teal-600">登録しました</p>}
      {result === "invalid" && <p className="text-xs text-red-600">メールアドレスの形式が正しくありません</p>}
      {result === "rate_limited" && <p className="text-xs text-amber-600">しばらくしてから再度お試しください</p>}
      {result === "error" && <p className="text-xs text-red-600">保存に失敗しました</p>}
    </div>
  );
}
