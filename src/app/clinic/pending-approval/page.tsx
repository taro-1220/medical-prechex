"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getCurrentClinic, redirectToLogin, getSupportContactLine } from "@/lib/clinic-auth";
import type { ClinicStatus } from "@/lib/types";
import StaffHeaderBar from "@/components/StaffHeaderBar";

type ViewState = "loading" | "pending_approval" | "rejected";

export default function ClinicPendingApprovalPage() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>("loading");

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { redirectToLogin(router); return; }
      const clinic = await getCurrentClinic();
      if (!clinic) { redirectToLogin(router); return; }
      if (clinic.status === "active") { router.replace("/clinic"); return; }
      setState(clinic.status as Exclude<ClinicStatus, "active">);
    })();
  }, [router]);

  if (state === "loading") {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>;
  }

  const contactLine = getSupportContactLine();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-black text-teal-700">medipre</span>
        <StaffHeaderBar />
      </header>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          {state === "pending_approval" ? (
            <>
              <p className="text-4xl mb-4">🕐</p>
              <p className="font-bold text-gray-900 mb-2">承認をお待ちください</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                お申し込みありがとうございます。medipre運営事務局にて内容を確認しております。
                承認が完了すると、ご登録のメールアドレスへご連絡いたします。
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl mb-4">🙏</p>
              <p className="font-bold text-gray-900 mb-2">今回はご案内を見送らせていただきました</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                ご不明な点がございましたら、medipre運営事務局までお問い合わせください。
              </p>
            </>
          )}
          {contactLine && <p className="text-xs text-gray-400 mt-4">{contactLine}</p>}
        </div>
      </div>
    </div>
  );
}
