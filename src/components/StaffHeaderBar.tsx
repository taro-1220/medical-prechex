"use client";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut } from "@/lib/clinic-auth";

/**
 * 医院向け・運営者向け画面共通のヘッダー部品。ログイン中のメールアドレスと
 * ログアウトボタンを表示する。患者向け画面（/confirm等）には組み込まない
 * （患者はアカウントを持たないため）。
 * ログアウトに確認ダイアログは出さない。誤って押しても再ログインすれば戻れるため。
 */
export default function StaffHeaderBar() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => setEmail(user?.email ?? null));
  }, []);

  if (!email) return null;

  return (
    <div className="flex items-center gap-2 min-w-0 shrink-0">
      <span
        className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[220px]"
        title={email}
      >
        {email}
      </span>
      <button
        onClick={() => signOut()}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition whitespace-nowrap"
      >
        ログアウト
      </button>
    </div>
  );
}
