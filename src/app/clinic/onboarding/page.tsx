"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAccessToken,
  getClinicApprovalRedirect,
  requestStripeConnectUrl,
  shouldShowStripePreCheck,
  getStripeStatusLabel,
  isStripePendingBannerVisible,
} from "@/lib/clinic-auth";
import { useClinicGuard } from "@/lib/useClinicGuard";
import { shouldRenderClinicContent } from "@/lib/clinic-guard";
import type { ClinicProfile, OnboardingProgress, CancelPolicyScope, ClinicCancelPolicySettings, CancelTier } from "@/lib/types";
import { findRiskyPolicyWording, scopeAppliesToCategory, isInsuranceAcknowledgmentSatisfied, isBasisNoteValid } from "@/lib/cancel-policy";
import { areTierPercentsValid } from "@/lib/charge-policy";
import StripePreCheckModal from "../StripePreCheckModal";
import StripePendingBanner from "../StripePendingBanner";
import StaffHeaderBar from "@/components/StaffHeaderBar";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
const labelCls = "block text-xs text-gray-500 mb-1";

type CategoryForm = { policyText: string; basisNote: string; showBasisToPatient: boolean; graceHours: number; tiers: CancelTier[] | null };
const EMPTY_CATEGORY_FORM: CategoryForm = { policyText: "", basisNote: "", showBasisToPatient: false, graceHours: 24, tiers: null };

const CATEGORY_LABEL: Record<"private" | "insurance", string> = { private: "自由診療", insurance: "保険診療" };

const INSURANCE_ACK_TEXT =
  "保険診療のキャンセル料徴収は、療養担当規則等により取扱いが限定される場合があります。設定と運用の適法性は医院さまのご判断と責任において行っていただきます。";

export default function OnboardingPage() {
  const router = useRouter();
  const { state: guardState, clinic } = useClinicGuard(router);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pf, setPf] = useState({ clinicDisplayName: "", directorName: "", phone: "", email: "", postalCode: "", address: "", websiteUrl: "" });
  const [policy, setPolicy] = useState("");
  const [message, setMessage] = useState("");

  // MVP+1: キャンセル料ポリシー
  const [cancelPolicyOpen, setCancelPolicyOpen] = useState(false);
  const [cpEnabled, setCpEnabled] = useState(false);
  const [cpScope, setCpScope] = useState<CancelPolicyScope | null>(null);
  const [cpInsuranceAck, setCpInsuranceAck] = useState(false);
  const [cpPrivate, setCpPrivate] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [cpInsurance, setCpInsurance] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [cpWarnings, setCpWarnings] = useState<Record<string, string[]>>({});
  const [cpError, setCpError] = useState<string | null>(null);

  // MVP+2: Stripe Connect
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeDetailsSubmitted, setStripeDetailsSubmitted] = useState<boolean | null>(null);
  const [showStripePreCheck, setShowStripePreCheck] = useState(false);

  // MVP+3: 空き枠自動通知
  const [autoNotifySlot, setAutoNotifySlot] = useState(false);
  const [savingSlotSettings, setSavingSlotSettings] = useState(false);

  async function loadOnboarding(cid: string) {
    const token = await getAccessToken();
    const res = await fetch(`/api/clinic/onboarding?clinic_id=${cid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { progress: prog, profile: prof } = await res.json();
      setProgress(prog);
      setProfile(prof);
      if (prof) {
        setPf({ clinicDisplayName: prof.clinicDisplayName, directorName: prof.directorName, phone: prof.phone, email: prof.email, postalCode: prof.postalCode, address: prof.address, websiteUrl: prof.websiteUrl });
        setPolicy(prof.cancellationPolicy);
        setMessage(prof.defaultMessage);
        setAutoNotifySlot(prof.autoNotifyAvailableSlot);
      }

      // セクションF-3: pendingのときだけ「入力途中」か「提出済み」かを追加取得する
      if (prof?.stripeAccountStatus === "pending" && prof.stripeAccountId) {
        const stripeStatusRes = await fetch(`/api/clinic/stripe/status?clinic_id=${cid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (stripeStatusRes.ok) {
          const { detailsSubmitted } = await stripeStatusRes.json();
          setStripeDetailsSubmitted(!!detailsSubmitted);
        }
      } else {
        setStripeDetailsSubmitted(null);
      }
    }

    const cpRes = await fetch(`/api/clinic/cancel-policy?clinic_id=${cid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cpRes.ok) {
      const settings: ClinicCancelPolicySettings = await cpRes.json();
      setCpEnabled(settings.enabled);
      setCpScope(settings.scope);
      setCpInsuranceAck(settings.insuranceAcknowledged);
      if (settings.policies.private) setCpPrivate(settings.policies.private);
      if (settings.policies.insurance) setCpInsurance(settings.policies.insurance);
    }
  }

  useEffect(() => {
    if (guardState !== "ok" || !clinic) return;
    (async () => {
      setIsSettingsMode(new URLSearchParams(window.location.search).get("mode") === "settings");
      const approvalRedirect = getClinicApprovalRedirect(clinic.status);
      if (approvalRedirect) { router.replace(approvalRedirect); return; }
      setClinicId(clinic.id);
      await loadOnboarding(clinic.id);
      setLoading(false);

      // Stripe Connect オンボーディングから戻ってきた直後は、最新状態をポーリングして反映する
      if (new URLSearchParams(window.location.search).get("stripe")) {
        const token = await getAccessToken();
        await fetch(`/api/clinic/stripe/status?clinic_id=${clinic.id}`, { headers: { Authorization: `Bearer ${token}` } });
        await loadOnboarding(clinic.id);
        router.replace("/clinic/onboarding");
      }
    })();
  }, [guardState, clinic, router]);

  async function connectStripe() {
    if (!clinicId) return;
    setShowStripePreCheck(false);
    setStripeError(null);
    setConnectingStripe(true);
    const token = await getAccessToken();
    const result = await requestStripeConnectUrl(clinicId, token);
    if (result.ok) {
      window.location.href = result.url;
    } else {
      setStripeError(result.error);
      setConnectingStripe(false);
    }
  }

  function onClickStripeConnectButton() {
    if (shouldShowStripePreCheck(profile?.stripeAccountStatus)) {
      setShowStripePreCheck(true);
    } else {
      connectStripe();
    }
  }

  async function saveCancelPolicy() {
    if (!clinicId) return;
    setCpError(null);
    setSaving(true);
    const token = await getAccessToken();
    const res = await fetch("/api/clinic/cancel-policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clinicId,
        enabled: cpEnabled,
        scope: cpScope,
        insuranceAcknowledged: cpInsuranceAck,
        policies: { private: cpPrivate, insurance: cpInsurance },
      }),
    });
    if (res.ok) {
      const { warnings } = await res.json();
      setCpWarnings(warnings ?? {});
    } else {
      const { error } = await res.json().catch(() => ({ error: "保存に失敗しました" }));
      setCpError(String(error));
    }
    await loadOnboarding(clinicId);
    setSaving(false);
  }

  async function saveAvailableSlotSettings(nextEnabled: boolean) {
    if (!clinicId) return;
    setSavingSlotSettings(true);
    setAutoNotifySlot(nextEnabled);
    const token = await getAccessToken();
    await fetch("/api/clinic/available-slot-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, enabled: nextEnabled }),
    });
    setSavingSlotSettings(false);
  }

  const cpAppliesTo = (category: "private" | "insurance") => cpScope != null && scopeAppliesToCategory(cpScope, category);
  const cpTiersOk = (t: CategoryForm) => !t.tiers || areTierPercentsValid(t.tiers);
  const cpCanSave =
    !cpEnabled ||
    (cpScope != null &&
      isInsuranceAcknowledgmentSatisfied(cpScope, cpInsuranceAck) &&
      (!cpAppliesTo("private") || (cpPrivate.policyText.trim().length > 0 && isBasisNoteValid(cpPrivate.basisNote) && cpTiersOk(cpPrivate))) &&
      (!cpAppliesTo("insurance") || (cpInsurance.policyText.trim().length > 0 && isBasisNoteValid(cpInsurance.basisNote) && cpTiersOk(cpInsurance))));

  async function saveProfile() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, ...pf }),
    });
    await loadOnboarding(clinicId);
    setProfileOpen(false);
    setSaving(false);
  }

  async function savePolicy() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, cancellationPolicy: policy }),
    });
    await loadOnboarding(clinicId);
    setPolicyOpen(false);
    setSaving(false);
  }

  async function saveNotification() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/notification", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, defaultMessage: message }),
    });
    await loadOnboarding(clinicId);
    setNotificationOpen(false);
    setSaving(false);
  }

  async function activate() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    const res = await fetch("/api/clinic/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId }),
    });
    setSaving(false);
    if (res.ok) router.replace("/clinic");
  }

  const allDone = !!progress?.profileCompleted && !!progress?.policyCompleted && !!progress?.notificationCompleted;
  const REQUIRED_TOTAL = 3;
  const requiredCompletedCount = [progress?.profileCompleted, progress?.policyCompleted, progress?.notificationCompleted].filter(Boolean).length;

  if (!shouldRenderClinicContent(guardState)) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.push("/clinic")} className="text-gray-400 text-sm hover:text-gray-900 transition">← 管理画面へ</button>
          <h1 className="text-xl font-black mt-1">{isSettingsMode ? "医院設定" : "初期設定"}</h1>
          {!isSettingsMode && (
            <p className="text-xs text-gray-400 mt-1">
              {allDone
                ? `必須項目 ${REQUIRED_TOTAL}/${REQUIRED_TOTAL} 完了`
                : `必須項目 ${requiredCompletedCount}/${REQUIRED_TOTAL} 完了・あと${REQUIRED_TOTAL - requiredCompletedCount}項目で利用開始できます`}
            </p>
          )}
        </div>
        <StaffHeaderBar />
      </header>

      {clinicId && isStripePendingBannerVisible(profile?.stripeAccountStatus) && (
        <StripePendingBanner clinicId={clinicId} />
      )}

      {showStripePreCheck && (
        <StripePreCheckModal onProceed={connectStripe} onClose={() => setShowStripePreCheck(false)} />
      )}

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">医院プロフィール</p>
              <p className="text-xs text-gray-400 mt-0.5">医院名・院長名・連絡先・住所</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.profileCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setProfileOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {profileOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {profileOpen && (
            <div className="mt-4 space-y-3">
              <div><label className={labelCls}>医院表示名</label><input className={inputCls} value={pf.clinicDisplayName} onChange={e => setPf(p => ({ ...p, clinicDisplayName: e.target.value }))} /></div>
              <div><label className={labelCls}>院長名</label><input className={inputCls} value={pf.directorName} onChange={e => setPf(p => ({ ...p, directorName: e.target.value }))} /></div>
              <div><label className={labelCls}>電話番号</label><input className={inputCls} value={pf.phone} onChange={e => setPf(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label className={labelCls}>メールアドレス</label><input className={inputCls} value={pf.email} onChange={e => setPf(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label className={labelCls}>郵便番号</label><input className={inputCls} value={pf.postalCode} onChange={e => setPf(p => ({ ...p, postalCode: e.target.value }))} /></div>
              <div><label className={labelCls}>住所</label><input className={inputCls} value={pf.address} onChange={e => setPf(p => ({ ...p, address: e.target.value }))} /></div>
              <div><label className={labelCls}>Webサイト</label><input className={inputCls} value={pf.websiteUrl} onChange={e => setPf(p => ({ ...p, websiteUrl: e.target.value }))} /></div>
              <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">キャンセルポリシー</p>
              <p className="text-xs text-gray-400 mt-0.5">患者に表示するキャンセル規約</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.policyCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setPolicyOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {policyOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {policyOpen && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={policy} onChange={e => setPolicy(e.target.value)} placeholder="例：予約日24時間前以降のキャンセルは、キャンセル料が発生します。" />
              <button onClick={savePolicy} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">予約確認メッセージ</p>
              <p className="text-xs text-gray-400 mt-0.5">予約確定時に患者へ送るメッセージ</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.notificationCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setNotificationOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {notificationOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {notificationOpen && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="例：ご予約が確定しました。当日はお時間に余裕をもってお越しください。" />
              <button onClick={saveNotification} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-gray-900">お支払い連携（Stripe）</p>
              <p className="text-xs text-gray-400 mt-0.5">キャンセル料を、患者さんが登録したカードから自動で回収し、医院の口座へ振り込むための設定です。キャンセル料を回収する場合のみ必要です。</p>
            </div>
            <div className="flex items-center gap-3 sm:shrink-0">
              <span className={`whitespace-nowrap font-bold text-sm ${profile?.stripeAccountStatus === "active" ? "text-teal-600" : profile?.stripeAccountStatus === "pending" ? "text-amber-600" : "text-xs text-gray-400 font-normal"}`}>
                {getStripeStatusLabel(profile?.stripeAccountStatus, stripeDetailsSubmitted)}
              </span>
              <button onClick={onClickStripeConnectButton} disabled={connectingStripe} className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
                {connectingStripe ? "接続中..." : profile?.stripeAccountStatus === "active" ? "管理画面を開く" : profile?.stripeAccountStatus === "pending" ? "続きを設定する" : "Stripeに接続する"}
              </button>
            </div>
          </div>
          {stripeError && <p className="text-xs text-red-600 mt-2">{stripeError}</p>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">キャンセル料ポリシー</p>
              <p className="text-xs text-gray-400 mt-0.5">任意設定。予約時に患者さまへ提示し、同意をいただく文章です</p>
            </div>
            <div className="flex items-center gap-3">
              {cpEnabled
                ? <span className="text-teal-600 font-bold text-sm">✓ 有効</span>
                : <span className="text-xs text-gray-400">未設定（使わない）</span>}
              <button onClick={() => setCancelPolicyOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {cancelPolicyOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>

          {cancelPolicyOpen && (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
                予約時に患者さまへ提示し、同意をいただく文章を設定します。設定しない場合、患者さまにキャンセルに関する表示は一切行われません。
              </p>

              <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <input type="checkbox" checked={cpEnabled} onChange={e => setCpEnabled(e.target.checked)} className="h-4 w-4 accent-teal-600" />
                キャンセル料ポリシーを使う
              </label>

              {cpEnabled && (
                <>
                  <div>
                    <label className={labelCls}>対象範囲</label>
                    <div className="flex gap-2">
                      {([["private", "自由診療のみ"], ["insurance", "保険診療のみ"], ["both", "両方"]] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCpScope(v)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition ${cpScope === v ? "bg-teal-600 border-teal-600 text-white font-bold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {cpScope && (cpScope === "insurance" || cpScope === "both") && (
                    <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed">
                      <input type="checkbox" checked={cpInsuranceAck} onChange={e => setCpInsuranceAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600 shrink-0" />
                      {INSURANCE_ACK_TEXT}
                    </label>
                  )}

                  {(["private", "insurance"] as const).filter(cpAppliesTo).map((category) => {
                    const form = category === "private" ? cpPrivate : cpInsurance;
                    const setForm = category === "private" ? setCpPrivate : setCpInsurance;
                    const risky = findRiskyPolicyWording(form.policyText);
                    return (
                      <div key={category} className="border border-gray-200 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-bold text-gray-700">{CATEGORY_LABEL[category]}のポリシー</p>
                        <div>
                          <label className={labelCls}>患者さまへの提示文（必須）</label>
                          <textarea
                            className={`${inputCls} min-h-[100px] resize-y`}
                            value={form.policyText}
                            onChange={e => setForm({ ...form, policyText: e.target.value })}
                            placeholder="例：予約日3日前まで無料、前日〜当日は治療費の◯割、無断キャンセルは◯割をお願いしております。"
                          />
                          {risky.length > 0 && (
                            <p className="text-xs text-amber-700 mt-1">
                              ⚠ 実際の損害を超える部分は無効と判断される可能性があります（該当語: {risky.join("・")}）
                            </p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>金額の根拠メモ（必須・院内記録用）</label>
                          <input
                            className={inputCls}
                            value={form.basisNote}
                            onChange={e => setForm({ ...form, basisNote: e.target.value })}
                            placeholder="例：1枠60分の準備原価と埋め戻し困難性"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input type="checkbox" checked={form.showBasisToPatient} onChange={e => setForm({ ...form, showBasisToPatient: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                          根拠メモを患者さまにも表示する
                        </label>
                        <div>
                          <label className={labelCls}>予約直後の無条件無料時間（時間）</label>
                          <input
                            type="number"
                            min={0}
                            className={`${inputCls} w-32`}
                            value={form.graceHours}
                            onChange={e => setForm({ ...form, graceHours: Number(e.target.value) || 0 })}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>段階テーブル（キャンセル発生時の請求率。金額の初期値はありません）</label>
                          <div className="space-y-2">
                            {(form.tiers ?? []).map((tier, i) => (
                              <div key={i} className="flex items-center gap-2">
                                {tier.noShow ? (
                                  <span className="text-xs w-28 shrink-0 text-gray-600">無断不来院</span>
                                ) : (
                                  <span className="text-xs w-28 shrink-0 text-gray-600 flex items-center gap-1">
                                    <input
                                      type="number" min={0} className={`${inputCls} w-14 px-2 py-1`}
                                      value={tier.daysBefore ?? 0}
                                      onChange={e => {
                                        const tiers = [...(form.tiers ?? [])];
                                        tiers[i] = { ...tier, daysBefore: Number(e.target.value) || 0 };
                                        setForm({ ...form, tiers });
                                      }}
                                    />
                                    日前
                                  </span>
                                )}
                                <input
                                  type="number" min={0} max={100} className={`${inputCls} w-20 px-2 py-1`}
                                  value={tier.percent}
                                  onChange={e => {
                                    const tiers = [...(form.tiers ?? [])];
                                    tiers[i] = { ...tier, percent: Number(e.target.value) || 0 };
                                    setForm({ ...form, tiers });
                                  }}
                                />
                                <span className="text-xs text-gray-500">%</span>
                                <button type="button" onClick={() => {
                                  const tiers = (form.tiers ?? []).filter((_, j) => j !== i);
                                  setForm({ ...form, tiers });
                                }} className="text-xs text-gray-400 hover:text-red-600 ml-2">削除</button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button type="button" onClick={() => setForm({ ...form, tiers: [...(form.tiers ?? []), { daysBefore: 0, percent: 0 }] })} className="text-xs text-teal-600 hover:underline">
                              ＋ 日数指定の段階を追加
                            </button>
                            {!(form.tiers ?? []).some(t => t.noShow) && (
                              <button type="button" onClick={() => setForm({ ...form, tiers: [...(form.tiers ?? []), { noShow: true, percent: 0 }] })} className="text-xs text-teal-600 hover:underline">
                                ＋ 無断不来院の段階を追加
                              </button>
                            )}
                          </div>
                          {form.tiers && !areTierPercentsValid(form.tiers) && (
                            <p className="text-xs text-red-600 mt-1">% は0〜100の範囲で入力してください</p>
                          )}
                        </div>

                        {form.policyText && (
                          <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">患者さまにはこう表示されます</p>
                            <p className="text-xs text-gray-700 leading-relaxed">
                              このご予約は〔{CATEGORY_LABEL[category]}〕のため、{pf.clinicDisplayName || "貴院"}のキャンセルポリシーが適用されます
                            </p>
                            <p className="text-xs text-gray-800 whitespace-pre-wrap mt-1.5 leading-relaxed">{form.policyText}</p>
                            {form.showBasisToPatient && form.basisNote && (
                              <p className="text-xs text-gray-500 mt-1.5">{form.basisNote}</p>
                            )}
                            {form.tiers && form.tiers.length > 0 && (
                              <table className="mt-2 text-xs text-gray-700 w-full">
                                <tbody>
                                  {form.tiers.map((t, i) => (
                                    <tr key={i} className="border-t border-gray-200">
                                      <td className="py-1 pr-2">{t.noShow ? "ご連絡のないキャンセル" : t.daysBefore === 0 ? "当日" : `${t.daysBefore}日前まで`}</td>
                                      <td className="py-1 text-right font-bold">{t.percent === 0 ? "無料" : `${t.percent}%`}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {cpError && <p className="text-xs text-red-600">{cpError}</p>}
              <button onClick={saveCancelPolicy} disabled={saving || !cpCanSave} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">空き枠自動通知</p>
              <p className="text-xs text-gray-400 mt-0.5">患者のキャンセルにより再予約可能な枠が発生した際、通知を許可している患者へ自動でお知らせします。</p>
            </div>
            <div className="flex items-center gap-3">
              {autoNotifySlot
                ? <span className="text-teal-600 font-bold text-sm">✓ 有効</span>
                : <span className="text-xs text-gray-400">通知OFF</span>}
              <button
                onClick={() => saveAvailableSlotSettings(!autoNotifySlot)}
                disabled={savingSlotSettings}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {savingSlotSettings ? "保存中..." : autoNotifySlot ? "OFFにする" : "即時通知をONにする"}
              </button>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border shadow-sm p-5 flex items-center justify-between ${allDone ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"}`}>
          <div>
            <p className="font-bold text-gray-900">利用開始</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {allDone ? "すべての設定が完了しました" : "上記3項目をすべて設定してください"}
            </p>
          </div>
          <button
            onClick={activate}
            disabled={!allDone || saving}
            className="px-5 py-2.5 bg-teal-600 rounded-xl text-white font-bold text-sm hover:bg-teal-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "処理中..." : "利用開始"}
          </button>
        </div>

      </div>
    </div>
  );
}
