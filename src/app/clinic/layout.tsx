import StaffHeaderBar from "@/components/StaffHeaderBar";

/**
 * /clinic配下の全画面共通のレイアウト。ログアウト導線（StaffHeaderBar）を
 * 各画面の個別配置ではなく、ここに一括設置する。StaffHeaderBar自身が
 * 未ログイン時は何も描画しない（email取得前・未ログイン時はnull）ため、
 * 各画面のガード判定（useClinicGuard等）とは独立して動作してよい。
 *
 * StaffHeaderBarは通常フロー（fixed/absoluteではない）の帯として、各画面の
 * 本体より前に描画される。各画面側のmin-h-screenの基準点が帯の分だけ下がるため、
 * fixed/sticky要素を持つ画面はその分の調整が必要な場合がある（該当画面側で対応）。
 */
export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaffHeaderBar />
      {children}
    </>
  );
}
