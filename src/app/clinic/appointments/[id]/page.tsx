"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/clinic-auth";

interface TierMatch {
  reason: "grace_hours" | "tier" | "no_matching_tier" | "no_show_tier_missing";
  matchedTier: { daysBefore?: number; noShow?: boolean; percent: number } | null;
  percent: number;
}

interface Judgment {
  applicable: boolean;
  consented: boolean;
  consentedAt?: string | null;
  policySnapshot?: string | null;
  withinGraceHours?: boolean;
  graceHours?: number;
  tierMatch?: TierMatch;
  baseAmount?: number | null;
  amount?: number | null;
  hasPaymentMethod?: boolean;
  eligibility?: { eligible: boolean; blockedBy: string[] };
  chargeExecutionEnabled?: boolean;
  currentChargeStatus?: string;
  note?: string;
}

const BLOCKED_LABEL: Record<string, string> = {
  not_consented: "同意なし",
  within_grace_hours: "予約直後の無条件無料時間内",
  no_payment_method: "カード未登録",
  flag_disabled: "課金実行フラグが無効（ドライラン運用中）",
};

const REASON_LABEL: Record<string, string> = {
  grace_hours: "予約直後の無条件無料時間内のため無料",
  tier: "段階テーブルに該当",
  no_matching_tier: "該当する段階が無いため請求しない",
  no_show_tier_missing: "無断不来院の段階が未設定のため請求しない",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AppointmentJudgmentPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [judgment, setJudgment] = useState<Judgment | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { params.then(({ id: v }) => setId(v)); }, [params]);

  async function load(aid: string) {
    const token = await getAccessToken();
    const res = await fetch(`/api/clinic/appointments/${aid}/judgment`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setJudgment(await res.json());
    setLoading(false);
  }

  useEffect(() => { if (id) load(id); }, [id]);

  async function recordCancellation() {
    if (!id || recording) return;
    setRecording(true);
    const token = await getAccessToken();
    const res = await fetch(`/api/clinic/appointments/${id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setResult(data.charge ? `記録しました（${data.charge.percent}%・${data.charge.amount}円・${data.charge.dryRun ? "ドライラン" : data.charge.chargeStatus ?? "未実行"}）` : "記録しました（請求対象外）");
      await load(id);
    } else {
      setResult("記録に失敗しました");
    }
    setRecording(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 予約一覧へ</Link>
        <h1 className="text-xl font-black mt-1">キャンセル判定</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : !judgment ? (
          <p className="text-gray-400 text-sm">予約が見つかりません</p>
        ) : !judgment.applicable ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
            <p className="text-sm text-gray-600">{judgment.note ?? "このご予約はキャンセルポリシー対象外です。請求根拠はありません。"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">事実</p>
              <div className="flex gap-4">
                <span className="text-sm text-gray-400 w-32 shrink-0">同意</span>
                <span className="text-sm font-bold">
                  {judgment.consented ? `済み（${judgment.consentedAt ? formatDate(judgment.consentedAt) : ""}）` : "未同意（請求根拠なし）"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-sm text-gray-400 w-32 shrink-0">無条件無料時間</span>
                <span className="text-sm font-bold">{judgment.withinGraceHours ? `該当（${judgment.graceHours}時間以内）` : `対象外（${judgment.graceHours}時間経過）`}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-sm text-gray-400 w-32 shrink-0">段階判定</span>
                <span className="text-sm font-bold">
                  {judgment.tierMatch ? `${REASON_LABEL[judgment.tierMatch.reason]}（${judgment.tierMatch.percent}%）` : "-"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-sm text-gray-400 w-32 shrink-0">計算結果</span>
                <span className="text-sm font-bold">
                  {judgment.baseAmount != null ? `基準額${judgment.baseAmount}円 × ${judgment.tierMatch?.percent ?? 0}% = ${judgment.amount ?? 0}円` : "基準額未設定"}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-sm text-gray-400 w-32 shrink-0">カード登録</span>
                <span className="text-sm font-bold">{judgment.hasPaymentMethod ? "登録済み" : "未登録（窓口等でのご精算になります）"}</span>
              </div>
              {judgment.currentChargeStatus && judgment.currentChargeStatus !== "none" && (
                <div className="flex gap-4">
                  <span className="text-sm text-gray-400 w-32 shrink-0">現在の課金状態</span>
                  <span className="text-sm font-bold">{judgment.currentChargeStatus}</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">同意本文（スナップショット）</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{judgment.policySnapshot || "（本文なし）"}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">課金の成立条件</p>
              {judgment.eligibility?.eligible ? (
                <p className="text-sm font-bold text-teal-700">成立（同意済み・無料時間外・カード登録済み・課金フラグ有効）</p>
              ) : (
                <div className="text-sm text-amber-700">
                  <p className="font-bold">未成立</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {(judgment.eligibility?.blockedBy ?? []).map((b) => <li key={b}>{BLOCKED_LABEL[b] ?? b}</li>)}
                  </ul>
                </div>
              )}
              {!judgment.chargeExecutionEnabled && (
                <p className="text-xs text-gray-400">現在、課金実行フラグはOFFです。記録操作はドライラン（証跡記録のみ）になります。</p>
              )}
            </div>

            {result && <p className="text-sm text-teal-700 bg-teal-50 rounded-xl px-4 py-3">{result}</p>}

            <button
              onClick={recordCancellation}
              disabled={recording}
              className="w-full py-4 rounded-2xl bg-red-600 text-white font-bold text-base hover:bg-red-700 transition disabled:opacity-40"
            >
              {recording ? "記録中..." : "この予約のキャンセルを記録する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
