"use client";
import { useState } from "react";
import { startStripeConnect } from "@/lib/clinic-auth";

/** Phase P1 セクションF-2: Stripe Connectが途中(pending)のときに/clinicと/clinic/onboarding上部へ出す再開バナー */
export default function StripePendingBanner({ clinicId }: { clinicId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resume = async () => {
    setError(null);
    setLoading(true);
    const result = await startStripeConnect(clinicId);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-amber-800 font-medium">Stripe連携が途中です。続きから再開できます</p>
        <button
          onClick={resume}
          disabled={loading}
          className="px-4 py-1.5 bg-amber-500 rounded-lg text-white text-sm font-bold hover:bg-amber-600 transition disabled:opacity-50"
        >
          {loading ? "処理中..." : "続きから再開"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
