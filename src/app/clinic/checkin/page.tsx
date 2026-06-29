"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function extractToken(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/\/clinic\/checkin\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/confirm\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // bare UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
  return null;
}

type ScanState = "idle" | "scanning" | "error_camera" | "error_qr";

export default function ClinicCheckinScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState(false);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  useEffect(() => {
    setHasBarcodeDetector("BarcodeDetector" in window);
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startScan = async () => {
    setScanState("scanning");
    activeRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!activeRef.current) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(scan);
          return;
        }
        try {
          const results: Array<{ rawValue: string }> = await detector.detect(v);
          if (!activeRef.current) return;
          if (results.length > 0) {
            const token = extractToken(results[0].rawValue);
            stopCamera();
            if (token) {
              router.push(`/clinic/checkin/${token}`);
            } else {
              setScanState("error_qr");
            }
            return;
          }
        } catch { /* frame not ready, continue */ }
        if (activeRef.current) rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (e) {
      stopCamera();
      const name = e instanceof Error ? e.name : "";
      setScanState(name === "NotAllowedError" ? "error_camera" : "error_qr");
    }
  };

  const handleManual = () => {
    setManualError(false);
    const token = extractToken(manualInput);
    if (token) {
      router.push(`/clinic/checkin/${token}`);
    } else {
      setManualError(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-700 transition">← 予約一覧</Link>
        <h1 className="text-xl font-black text-gray-900 mt-1">来院受付</h1>
      </header>

      <div className="max-w-sm mx-auto px-6 py-8 space-y-6">
        {scanState === "scanning" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 text-center">患者様のQRチケットをカメラに向けてください。</p>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 border-2 border-teal-400 rounded-xl opacity-80" />
              </div>
            </div>
            <button
              onClick={() => { stopCamera(); setScanState("idle"); }}
              className="w-full py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-100 transition"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto">
                <span className="text-3xl">📷</span>
              </div>
              <p className="text-sm text-gray-600">患者様のQRチケットを読み取ってください。</p>
            </div>

            {scanState === "error_camera" && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                カメラの使用が許可されていません。ブラウザの設定からカメラを許可してください。
              </div>
            )}

            {scanState === "error_qr" && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                medipreの受付用QRを読み取ってください。
              </div>
            )}

            {hasBarcodeDetector ? (
              <button
                onClick={startScan}
                className="w-full py-4 rounded-2xl bg-teal-600 text-white font-bold text-base hover:bg-teal-700 transition"
              >
                QRを読み取る
              </button>
            ) : (
              <div className="rounded-xl bg-gray-100 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                このブラウザはカメラQR読取に対応していません。下の手動入力をご利用ください。
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">手動入力</p>
              <input
                type="text"
                placeholder="URLまたは予約トークンを貼り付け"
                value={manualInput}
                onChange={e => { setManualInput(e.target.value); setManualError(false); }}
                onKeyDown={e => { if (e.key === "Enter") handleManual(); }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-teal-500 transition"
              />
              {manualError && (
                <p className="text-xs text-red-600">medipreの受付用QRを読み取ってください。</p>
              )}
              <button
                onClick={handleManual}
                disabled={!manualInput.trim()}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-700 transition disabled:opacity-40"
              >
                受付画面を開く
              </button>
            </div>

            <Link href="/clinic" className="block text-center text-sm text-gray-400 hover:text-gray-700 transition">
              ← 予約一覧へ戻る
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
