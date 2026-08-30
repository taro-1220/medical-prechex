"use client";
import { useEffect, useState } from "react";

type State = "loading" | "done" | "error";

export default function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("error"); return; }
    fetch("/api/patient/notifications/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(res => setState(res.ok ? "done" : "error"))
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        {state === "loading" && <p className="text-sm text-gray-400">処理しています...</p>}
        {state === "done" && (
          <>
            <p className="text-4xl mb-4">✓</p>
            <p className="font-bold text-gray-900 mb-2">空き枠のお知らせを停止しました</p>
            <p className="text-sm text-gray-500">今後、空き枠のご案内メールは届きません。</p>
          </>
        )}
        {state === "error" && (
          <>
            <p className="text-4xl mb-4">⚠️</p>
            <p className="font-bold text-gray-900 mb-2">処理できませんでした</p>
            <p className="text-sm text-gray-500">URLをご確認いただくか、時間をおいて再度お試しください。</p>
          </>
        )}
      </div>
    </div>
  );
}
