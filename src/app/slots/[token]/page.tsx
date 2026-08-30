"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SlotInfo = { clinicName: string; appointmentAt: string; status: "open" | "booked" | "closed" };
type LoadState = "loading" | "ready" | "not_found" | "load_failed";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function SlotClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotInfo | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [claiming, setClaiming] = useState(false);
  const [claimClosed, setClaimClosed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/slots/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setState("not_found"); return; }
        if (!res.ok) { setState("load_failed"); return; }
        setSlot(await res.json());
        setState("ready");
      })
      .catch(() => setState("load_failed"));
  }, [token]);

  const handleClaim = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(`/api/slots/${token}/claim`, { method: "POST" });
      if (res.status === 409) { setClaimClosed(true); setClaiming(false); return; }
      if (!res.ok) { setClaimError("予約できませんでした。しばらくしてから再度お試しください。"); setClaiming(false); return; }
      const { token: newToken } = await res.json();
      router.push(`/confirm/${newToken}`);
    } catch {
      setClaimError("予約できませんでした。しばらくしてから再度お試しください。");
      setClaiming(false);
    }
  };

  if (state === "not_found") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-bold text-gray-900 mb-2">この空き枠は見つかりません</p>
          <p className="text-sm text-gray-500">URLをご確認いただくか、クリニックへお問い合わせください。</p>
        </div>
      </div>
    );
  }

  if (state === "load_failed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-bold text-gray-900 mb-2">読み込みに失敗しました</p>
          <p className="text-sm text-gray-500">しばらく経ってから再度お試しください。</p>
        </div>
      </div>
    );
  }

  if (state === "loading" || !slot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (slot.status !== "open" || claimClosed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🙏</p>
          <p className="font-bold text-gray-900 mb-2">この予約枠は受付終了しました</p>
          <p className="text-sm text-gray-500">先着順のため、すでに他の方が予約されました。またの機会にご案内いたします。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        <p className="text-xs text-gray-400 mb-1">空き枠のお知らせ</p>
        <p className="font-black text-gray-900 text-lg mb-4">{slot.clinicName}</p>
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs text-gray-400 mb-1">予約可能な日時</p>
          <p className="font-bold text-gray-900">{formatDate(slot.appointmentAt)}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">※先着順のため、すでに受付終了となっている場合があります。</p>
        {claimError && <p className="text-xs text-red-600 mb-3">{claimError}</p>}
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full py-3 bg-teal-600 rounded-xl text-white font-bold text-sm hover:bg-teal-700 transition disabled:opacity-50"
        >
          {claiming ? "予約しています..." : "この枠を予約する"}
        </button>
      </div>
    </div>
  );
}
