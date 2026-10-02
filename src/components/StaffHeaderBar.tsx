"use client";
import { useEffect, useState } from "react";
import {
  getCurrentUser,
  signOut,
  fetchCurrentClinicName,
  resolveStaffHeaderLabel,
  type StaffHeaderMode,
  type ClinicNameFetchResult,
} from "@/lib/clinic-auth";

type StaffHeaderBarProps = {
  /**
   * "clinicName"（既定）：選択中の医院名を表示（医院なしは「運営者」、取得失敗はラベル無し）。
   * "email"：従来どおりメールアドレスを表示する（/opsはこちらを明示的に指定し、表示を変えない）。
   */
  mode?: StaffHeaderMode;
};

/**
 * 医院向け・運営者向け画面共通のヘッダー部品。ログアウトボタンを常に表示し、
 * modeに応じて医院名またはメールアドレスをラベルとして表示する。
 * 患者向け画面（/confirm等）には組み込まない（患者はアカウントを持たないため）。
 * ログアウトに確認ダイアログは出さない。誤って押しても再ログインすれば戻れるため。
 */
export default function StaffHeaderBar({ mode = "clinicName" }: StaffHeaderBarProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [clinicNameResult, setClinicNameResult] = useState<ClinicNameFetchResult | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      setEmail(user?.email ?? null);
      if (user && mode === "clinicName") {
        fetchCurrentClinicName().then(setClinicNameResult);
      }
    });
  }, [mode]);

  if (!email) return null;

  const label = resolveStaffHeaderLabel(mode, email, clinicNameResult);

  return (
    <div className="flex items-center gap-2 min-w-0 shrink-0">
      {label && (
        <span
          className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[220px]"
          title={label}
        >
          {label}
        </span>
      )}
      <button
        onClick={() => signOut()}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition whitespace-nowrap"
      >
        ログアウト
      </button>
    </div>
  );
}
