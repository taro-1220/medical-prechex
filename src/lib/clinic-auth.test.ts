// 認証リダイレクト（/login ?next=）のオープンリダイレクト対策を検証する。
// isSafeRedirectPathは純粋関数のため、ここではこの関数のみを対象にする。
// /login側の実際の遷移は `router.push(isSafeRedirectPath(next) ? next : "/clinic")` という
// 単純な三項演算のみで構成されており、この関数の真偽値がそのまま遷移先を決定する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSafeRedirectPath,
  getClinicApprovalRedirect,
  shouldShowStripePreCheck,
  getStripeStatusLabel,
  isStripePendingBannerVisible,
  requestStripeConnectUrl,
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

  it("pendingかつdetailsSubmitted不明/false は「未完了（続きから再開できます）」", () => {
    expect(getStripeStatusLabel("pending", false)).toBe("未完了（続きから再開できます）");
    expect(getStripeStatusLabel("pending", null)).toBe("未完了（続きから再開できます）");
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

describe("requestStripeConnectUrl: セクションF-4 失敗時に生の内部エラーを出さない", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("tokenが無い場合は案内文を返す（APIは呼ばない）", async () => {
    const result = await requestStripeConnectUrl("clinic-1", null);
    expect(result).toEqual({ ok: false, error: "現在お支払い連携を開始できません。運営事務局までご連絡ください" });
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

  it("APIがエラーを返しても、生のエラー文ではなく日本語の案内文を返す（STRIPE_SECRET_KEY未設定時の想定を含む）", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Error: STRIPE_SECRET_KEY is not set" }),
    });
    const result = await requestStripeConnectUrl("clinic-1", "token-1");
    expect(result).toEqual({ ok: false, error: "現在お支払い連携を開始できません。運営事務局までご連絡ください" });
  });
});
