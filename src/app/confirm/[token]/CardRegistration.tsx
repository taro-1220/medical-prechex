"use client";
import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { CancelTier } from "@/lib/types";

const TIER_ROW_LABEL = (t: CancelTier): string => {
  if (t.noShow) return "ご連絡のないキャンセル";
  if (t.daysBefore === 0) return "当日";
  return `${t.daysBefore}日前まで`;
};

function TierTable({ tiers }: { tiers: CancelTier[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {tiers.map((t, i) => (
          <tr key={i} className="border-t border-gray-100 first:border-t-0">
            <td className="py-2 text-gray-600">{TIER_ROW_LABEL(t)}</td>
            <td className="py-2 text-right font-bold text-gray-900">{t.percent === 0 ? "無料" : `${t.percent}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardForm({ token, onRegistered }: { token: string; onRegistered: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setRegistering(true);
    setError(null);
    try {
      const setupRes = await fetch(`/api/appointments/${token}/setup-intent`, { method: "POST" });
      if (!setupRes.ok) throw new Error("カード登録の準備に失敗しました");
      const { clientSecret } = await setupRes.json();

      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (stripeError) throw new Error(stripeError.message ?? "カード登録に失敗しました");
      if (setupIntent?.status !== "succeeded") throw new Error("カード登録が完了しませんでした");

      const confirmRes = await fetch(`/api/appointments/${token}/setup-intent/confirm`, { method: "POST" });
      if (!confirmRes.ok) throw new Error("登録の確認に失敗しました");

      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "カード登録に失敗しました");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="border border-gray-200 rounded-xl px-4 py-3.5 bg-white">
        <CardElement options={{ style: { base: { fontSize: "15px", color: "#111827" } } }} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleRegister}
        disabled={!stripe || registering}
        className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition disabled:opacity-40"
      >
        {registering ? "登録中..." : "カードを登録"}
      </button>
    </div>
  );
}

export default function CardRegistration({
  token,
  clinicName,
  category,
  tiers,
  onRegistered,
}: {
  token: string;
  clinicName: string;
  category: string;
  tiers: CancelTier[] | null;
  onRegistered: () => void;
}) {
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/appointments/${token}/setup-intent`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "準備に失敗しました" }));
          setPrepError(String(error));
          return;
        }
        const { connectedAccountId: acct } = await res.json();
        setConnectedAccountId(acct);
      })
      .catch(() => setPrepError("準備に失敗しました"));
  }, [token]);

  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    if (!connectedAccountId) return null;
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk, { stripeAccount: connectedAccountId });
  }, [connectedAccountId]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">お支払いカードのご登録</p>
      <p className="text-sm text-gray-700 leading-relaxed">
        カードのご登録のみで、この時点でお支払いは発生しません。ご来院いただければ一切の請求はありません。
        ご都合によるキャンセルの場合のみ、下記の条件に基づきご登録のカードへお支払いをお願いいたします。
      </p>
      {tiers && tiers.length > 0 && (
        <div className="bg-gray-50 rounded-xl px-4 py-2">
          <TierTable tiers={tiers} />
        </div>
      )}
      <p className="text-xs text-gray-400">{clinicName}（{category}）</p>

      {prepError && <p className="text-xs text-red-600">{prepError}</p>}
      {stripePromise && (
        <Elements stripe={stripePromise}>
          <CardForm token={token} onRegistered={onRegistered} />
        </Elements>
      )}
      {!stripePromise && !prepError && <p className="text-xs text-gray-400">読み込み中...</p>}
    </div>
  );
}
