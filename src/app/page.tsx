import Link from "next/link";

const STEPS = [
  { n: "01", title: "確認URL送信", desc: "クリニックが予約情報を入力し、確認URLを発行" },
  { n: "02", title: "予約内容を確認", desc: "患者がURLを開き、予約日時・内容を確認" },
  { n: "03", title: "キャンセルポリシーに同意", desc: "ポリシー全文を確認し、明示的に同意" },
  { n: "04", title: "QR来院チケット発行", desc: "同意完了後に来院用QRチケットを発行" },
  { n: "05", title: "来院時にQR確認", desc: "受付でQRを提示。来院確認が完了" },
];

const FEATURES = [
  { icon: "✓", title: "予約確認を自動化", desc: "電話による予約確認業務を削減。URLを送るだけで患者が確認・同意まで完結。" },
  { icon: "🔒", title: "無断キャンセルを抑止", desc: "キャンセルポリシーへの明示的同意を取得。予約責任を患者と共有。" },
  { icon: "📱", title: "QR来院チケット", desc: "同意完了後にQRコードを発行。受付でかざすだけで来院確認が完了。" },
  { icon: "📋", title: "厚労省通知対応", desc: "予約に基づく診察の患者都合キャンセル料の運用開始に対応した同意証跡を管理。" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0B1629] text-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#0B1629]/90 backdrop-blur border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-black tracking-tight">PreChex</span>
        <div className="flex gap-6 text-sm text-white/50">
          <a href="#features" className="hover:text-white transition">特徴</a>
          <a href="#howto" className="hover:text-white transition">仕組み</a>
        </div>
        <Link href="/clinic" className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition">
          クリニック管理画面
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center min-h-screen px-6 text-center pt-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-300">医療向け予約保証プラットフォーム</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6">
          予約確認・同意取得・<br />
          <span className="text-blue-400">来院確認をひとつに。</span>
        </h1>
        <p className="text-lg text-white/50 max-w-lg mx-auto mb-10 leading-relaxed">
          厚労省通知対応。予約確認の自動化と無断キャンセル抑止を、同意証跡とQR来院チケットで実現。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/clinic" className="px-8 py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition shadow-[0_4px_32px_rgba(37,99,235,0.4)]">
            クリニック管理画面を開く
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-blue-400 mb-4">Features</p>
          <h2 className="text-center text-4xl font-black tracking-tight mb-16">選ばれる理由</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.08] transition">
                <div className="text-2xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="howto" className="py-28 px-6 bg-white/[0.02]">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-blue-400 mb-4">How it works</p>
          <h2 className="text-center text-4xl font-black tracking-tight mb-16">5ステップで完結</h2>
          <div className="space-y-6">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-6 items-start">
                <span className="text-3xl font-black text-blue-500/40 tabular-nums shrink-0 w-10">{s.n}</span>
                <div>
                  <p className="font-bold text-base mb-1">{s.title}</p>
                  <p className="text-sm text-white/50">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/30">
        © 2026 PreChex. 医療向け予約保証プラットフォーム
      </footer>
    </main>
  );
}
