// 認証リダイレクト（/login ?next=）のオープンリダイレクト対策を検証する。
// isSafeRedirectPathは純粋関数のため、ここではこの関数のみを対象にする。
// /login側の実際の遷移は `router.push(isSafeRedirectPath(next) ? next : "/clinic")` という
// 単純な三項演算のみで構成されており、この関数の真偽値がそのまま遷移先を決定する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("./supabase-browser", () => ({
  getSupabaseBrowser: () => ({ auth: { signOut: signOutMock } }),
}));

import {
  isSafeRedirectPath,
  getClinicApprovalRedirect,
  shouldShowStripePreCheck,
  getStripeStatusLabel,
  isStripePendingBannerVisible,
  isStripePendingBannerVisibleOnDashboard,
  requestStripeConnectUrl,
  calculateFeeExampleReceivedAmount,
  getSupportContactLine,
  formatSupportContactLine,
  SUPPORT_CONTACT_TEXT,
  signOut,
  redirectToLogin,
  resolveStaffHeaderLabel,
} from "./clinic-auth";

describe("isSafeRedirectPath: /loginのnextパラメータ検証（オープンリダイレクト対策）", () => {
  it("同一オリジンの絶対パス（クエリ付き）は安全と判定する", () => {
    expect(isSafeRedirectPath("/clinic/onboarding?stripe=return")).toBe(true);
  });

  it("単純な絶対パスも安全と判定する", () => {
    expect(isSafeRedirectPath("/clinic")).toBe(true);
  });

  it("プロトコル相対URL（//evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
  });

  it("バックスラッシュ経由の相対URL（/\\evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
  });

  it("外部の絶対URL（https://evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
  });

  it("nextが無ければ拒否する（呼び出し側は既定の/clinicへフォールバックする）", () => {
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
  });

  it("\"/\"で始まらない相対パスは拒否する", () => {
    expect(isSafeRedirectPath("clinic/onboarding")).toBe(false);
  });
});

describe("getClinicApprovalRedirect: Phase P1 承認制の退避判定", () => {
  it("activeならリダイレクト不要(null)", () => {
    expect(getClinicApprovalRedirect("active")).toBeNull();
  });

  it("pending_approvalなら/clinic/pending-approvalへ退避する", () => {
    expect(getClinicApprovalRedirect("pending_approval")).toBe("/clinic/pending-approval");
  });

  it("rejectedも同じ画面へ退避する（画面側でメッセージを出し分ける）", () => {
    expect(getClinicApprovalRedirect("rejected")).toBe("/clinic/pending-approval");
  });
});

describe("shouldShowStripePreCheck: セクションF-1 事前準備モーダルの表示条件", () => {
  it("未接続(not_connected)なら表示する（初回接続時のみガイドが必要）", () => {
    expect(shouldShowStripePreCheck("not_connected")).toBe(true);
  });

  it("プロフィール未取得(undefined)でも表示する", () => {
    expect(shouldShowStripePreCheck(undefined)).toBe(true);
  });

  it("pending（再開）なら表示しない。既存のconnectStripe()を直接呼ぶ", () => {
    expect(shouldShowStripePreCheck("pending")).toBe(false);
  });

  it("active（管理画面を開く）なら表示しない", () => {
    expect(shouldShowStripePreCheck("active")).toBe(false);
  });
});

describe("getStripeStatusLabel: セクションF-3 Stripe欄の表示文言", () => {
  it("activeは「✓ 有効」", () => {
    expect(getStripeStatusLabel("active", null)).toBe("✓ 有効");
  });

  it("not_connectedは「未接続」", () => {
    expect(getStripeStatusLabel("not_connected", null)).toBe("未接続");
  });

  it("pendingかつdetailsSubmitted不明/false は「未完了」（再開できることはバナー・ボタン文言で伝える）", () => {
    expect(getStripeStatusLabel("pending", false)).toBe("未完了");
    expect(getStripeStatusLabel("pending", null)).toBe("未完了");
  });

  it("pendingかつdetailsSubmitted=true（提出済み）は「Stripeで確認中」", () => {
    expect(getStripeStatusLabel("pending", true)).toBe("Stripeで確認中");
  });
});

describe("isStripePendingBannerVisible: セクションF-2 再開バナーの表示条件", () => {
  it("pendingのときだけtrue", () => {
    expect(isStripePendingBannerVisible("pending")).toBe(true);
  });

  it("active・not_connected・undefinedはfalse", () => {
    expect(isStripePendingBannerVisible("active")).toBe(false);
    expect(isStripePendingBannerVisible("not_connected")).toBe(false);
    expect(isStripePendingBannerVisible(undefined)).toBe(false);
  });
});

describe("isStripePendingBannerVisibleOnDashboard: /clinicでは初期設定完了後だけStripeバナーを出す", () => {
  it("初期設定未完了(activatedAtがnull/undefined)なら、pendingでもfalse（初期設定バナーのみ出す）", () => {
    expect(isStripePendingBannerVisibleOnDashboard(null, "pending")).toBe(false);
    expect(isStripePendingBannerVisibleOnDashboard(undefined, "pending")).toBe(false);
  });

  it("初期設定完了(activatedAtが日時文字列)かつpendingならtrue", () => {
    expect(isStripePendingBannerVisibleOnDashboard("2026-09-01T00:00:00Z", "pending")).toBe(true);
  });

  it("初期設定完了していてもactive/not_connectedならfalse", () => {
    expect(isStripePendingBannerVisibleOnDashboard("2026-09-01T00:00:00Z", "active")).toBe(false);
    expect(isStripePendingBannerVisibleOnDashboard("2026-09-01T00:00:00Z", "not_connected")).toBe(false);
  });
});

describe("requestStripeConnectUrl: セクションF-4 失敗時に生の内部エラーを出さない", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("tokenが無い場合は案内文（連絡先つき）を返す（APIは呼ばない）", async () => {
    const result = await requestStripeConnectUrl("clinic-1", null);
    expect(result).toEqual({
      ok: false,
      error: "現在お支払い連携を開始できません。運営事務局までご連絡ください\nお困りの場合：support@medipre.jp",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("APIが200を返せばurlを含めて成功を返す", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://connect.stripe.com/setup/xxx" }),
    });
    const result = await requestStripeConnectUrl("clinic-1", "token-1");
    expect(result).toEqual({ ok: true, url: "https://connect.stripe.com/setup/xxx" });
  });

  it("APIがエラーを返しても、生のエラー文ではなく日本語の案内文（連絡先つき）を返す（STRIPE_SECRET_KEY未設定時の想定を含む）", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Error: STRIPE_SECRET_KEY is not set" }),
    });
    const result = await requestStripeConnectUrl("clinic-1", "token-1");
    expect(result).toEqual({
      ok: false,
      error: "現在お支払い連携を開始できません。運営事務局までご連絡ください\nお困りの場合：support@medipre.jp",
    });
  });
});

describe("calculateFeeExampleReceivedAmount: セクションF-B6 手数料例（表示専用、application_fee計算とは無関係）", () => {
  it("1,000円の例で受取額914円になる（Stripe3.6%＋Medipre5%を控除）", () => {
    expect(calculateFeeExampleReceivedAmount(1000)).toBe(914);
  });
});

describe("formatSupportContactLine: セクションC 問い合わせ先（空・値ありの両方を検証）", () => {
  it("空文字ならnull（連絡先の行を出さない）", () => {
    expect(formatSupportContactLine("")).toBeNull();
  });

  it("値があれば「お困りの場合：（連絡先）」を返す", () => {
    expect(formatSupportContactLine("support@medipre.jp")).toBe("お困りの場合：support@medipre.jp");
  });
});

describe("getSupportContactLine: 実際のSUPPORT_CONTACT_TEXTの値で組み立てる", () => {
  it("現在設定されているSUPPORT_CONTACT_TEXT(support@medipre.jp)から案内文を返す", () => {
    expect(SUPPORT_CONTACT_TEXT).toBe("support@medipre.jp");
    expect(getSupportContactLine()).toBe("お困りの場合：support@medipre.jp");
  });
});

describe("signOut: ログアウト（確認ダイアログなし、即座に実行）", () => {
  beforeEach(() => {
    signOutMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("supabase.auth.signOut()を呼び、完了後に/loginへ遷移する", async () => {
    const location = { href: "" };
    vi.stubGlobal("window", { location });

    await signOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(location.href).toBe("/login");
  });

  it("windowが存在しない環境（SSR等）でも例外を投げない", async () => {
    await expect(signOut()).resolves.not.toThrow();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe("redirectToLogin: 未ログイン時の/loginへの退避（多重発火対策）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("現在地とクエリをnextとして付与し/loginへ遷移する", () => {
    vi.stubGlobal("window", { location: { pathname: "/clinic/onboarding", search: "?stripe=return" } });
    const replace = vi.fn();
    redirectToLogin({ replace });
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fclinic%2Fonboarding%3Fstripe%3Dreturn");
  });

  it("現在地がすでに/loginなら、多重発火（Strict Mode等）でもnextの入れ子を作らず遷移しない", () => {
    vi.stubGlobal("window", { location: { pathname: "/login", search: "?next=%2Fclinic%2Fonboarding" } });
    const replace = vi.fn();
    redirectToLogin({ replace });
    expect(replace).not.toHaveBeenCalled();
  });

  it("現在地が/login/以下のサブパスでも遷移しない", () => {
    vi.stubGlobal("window", { location: { pathname: "/login/reset", search: "" } });
    const replace = vi.fn();
    redirectToLogin({ replace });
    expect(replace).not.toHaveBeenCalled();
  });

  it("windowが存在しない環境（SSR等）では何もしない", () => {
    const replace = vi.fn();
    expect(() => redirectToLogin({ replace })).not.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("resolveStaffHeaderLabel: StaffHeaderBarの表示ラベル判定（医院名／運営者／取得失敗／opsモード）", () => {
  it("clinicNameモードで医院ありなら医院名を表示する", () => {
    expect(resolveStaffHeaderLabel("clinicName", "taro@example.com", { ok: true, name: "みどり歯科クリニック" }))
      .toBe("みどり歯科クリニック");
  });

  it("clinicNameモードで医院なし（ok:true, name:null）なら「運営者」", () => {
    expect(resolveStaffHeaderLabel("clinicName", "taro@example.com", { ok: true, name: null }))
      .toBe("運営者");
  });

  it("clinicNameモードで取得失敗（ok:false）ならnull（ラベル無し、ログアウトのみ表示）", () => {
    expect(resolveStaffHeaderLabel("clinicName", "taro@example.com", { ok: false }))
      .toBeNull();
  });

  it("clinicNameモードで未取得（null、読み込み中）もnull（取得失敗と同じ扱い）", () => {
    expect(resolveStaffHeaderLabel("clinicName", "taro@example.com", null)).toBeNull();
  });

  it("長い医院名はそのまま返す（省略表示はCSS側の責務で、関数は切り詰めない）", () => {
    const longName = "医療法人社団とても長い名前の歯科・口腔外科・矯正歯科クリニックグループ本院";
    expect(resolveStaffHeaderLabel("clinicName", "taro@example.com", { ok: true, name: longName }))
      .toBe(longName);
  });

  it("emailモード（/ops）では、医院の取得結果に関わらずメールアドレスを表示する", () => {
    expect(resolveStaffHeaderLabel("email", "admin@example.com", null)).toBe("admin@example.com");
    expect(resolveStaffHeaderLabel("email", "admin@example.com", { ok: true, name: "無関係な医院名" }))
      .toBe("admin@example.com");
  });
});
