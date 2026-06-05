"use client";
import { useState } from "react";

const STEPS = [
  {
    n: 1,
    title: "予約を作成する",
    desc: "患者情報と予約日時を入力し、確認URLを発行します。",
  },
  {
    n: 2,
    title: "患者へ確認URLを送る",
    desc: "SMS・LINE・メールのいずれかで確認URLを送ります。",
  },
  {
    n: 3,
    title: "確認状況を確認する",
    desc: "「確認待ち」と「確認済み」の状態をこの画面で確認できます。",
  },
  {
    n: 4,
    title: "来院受付を行う",
    desc: "来院時に予約情報を確認し、受付を行います。",
  },
];

export const GUIDE_KEY = "prechex_guide_done";

export default function OnboardingGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem(GUIDE_KEY, "1");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1e35] p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest">PreChex 使い方ガイド</p>
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`block w-2 h-2 rounded-full ${i === step ? "bg-blue-400" : "bg-white/20"}`} />
            ))}
          </div>
        </div>

        <p className="text-xs font-bold text-blue-400 mb-2">STEP {current.n}</p>
        <h2 className="text-lg font-black mb-3">{current.title}</h2>
        <p className="text-sm text-white/60 leading-relaxed mb-8">{current.desc}</p>

        <div className="flex gap-3">
          <button
            onClick={finish}
            className="flex-1 py-2.5 rounded-xl border border-white/20 text-sm text-white/50 hover:bg-white/5 transition"
          >
            スキップ
          </button>
          <button
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 font-bold text-sm hover:bg-blue-500 transition"
          >
            {isLast ? "完了" : "次へ"}
          </button>
        </div>
      </div>
    </div>
  );
}
