import StaffHeaderBar from "@/components/StaffHeaderBar";

/**
 * /clinic配下の全画面共通のレイアウト。ログアウト導線（StaffHeaderBar）を
 * 各画面の個別配置ではなく、ここに一括設置する。StaffHeaderBar自身が
 * 未ログイン時は何も描画しない（email取得前・未ログイン時はnull）ため、
 * 各画面のガード判定（useClinicGuard等）とは独立して動作してよい。
 */
export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-50">
        <StaffHeaderBar />
      </div>
    </>
  );
}
