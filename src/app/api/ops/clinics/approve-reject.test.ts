// approve / reject: 運営者のみ・監査付き状態変更(DB関数 ops_change_clinic_status)・メールは成功時のみ。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, rpcMock, maybeSingleMock, sendMailMock, emailEnabledMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  sendMailMock: vi.fn(),
  emailEnabledMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }),
}));
vi.mock("@/lib/notify-email", () => ({
  isEmailSendEnabled: emailEnabledMock,
  sendClinicApprovedEmail: sendMailMock,
}));

import { POST as approve } from "./[clinicId]/approve/route";
import { POST as reject } from "./[clinicId]/reject/route";

const CLINIC = "10000000-0000-4000-8000-000000000001";
const OPS = { id: "ops-user-1", email: "ops@example.com" };

function req(path: "approve" | "reject", opts: { auth?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost/api/ops/clinics/${CLINIC}/${path}`, {
    method: "POST",
    headers: {
      ...(opts.auth ? { Authorization: opts.auth } : {}),
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const ctx = (id = CLINIC) => ({ params: Promise.resolve({ clinicId: id }) });

const okEvent = (action: string, from: string, to: string) => ({
  data: { changed: true, event_id: "ev-1", action, from_status: from, to_status: to },
  error: null,
});

describe("POST /api/ops/clinics/[clinicId]/approve|reject", () => {
  const ORIGINAL = process.env.OPS_ADMIN_EMAILS;
  beforeEach(() => {
    for (const m of [getUserMock, rpcMock, maybeSingleMock, sendMailMock, emailEnabledMock]) m.mockReset();
    process.env.OPS_ADMIN_EMAILS = "ops@example.com";
    getUserMock.mockResolvedValue({ data: { user: OPS }, error: null });
    maybeSingleMock.mockResolvedValue({ data: { id: CLINIC, name: "テスト医院", email: "clinic@example.com" }, error: null });
    emailEnabledMock.mockReturnValue(true);
    sendMailMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => { process.env.OPS_ADMIN_EMAILS = ORIGINAL; });

  describe.each([["approve", approve], ["reject", reject]] as const)("%s: 認可", (name, handler) => {
    it("未認証は401で状態変更しない", async () => {
      const res = await handler(req(name), ctx());
      expect(res.status).toBe(401);
      expect(rpcMock).not.toHaveBeenCalled();
    });
    it("運営者以外は403で状態変更しない(医院の owner でも)", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "u9", email: "owner@clinic.example" } }, error: null });
      const res = await handler(req(name, { auth: "Bearer t", body: { reason: "x" } }), ctx());
      expect(res.status).toBe(403);
      expect(rpcMock).not.toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("不正なUUIDは404(DB関数を呼ばない)", async () => {
      const res = await handler(req(name, { auth: "Bearer t", body: { reason: "x" } }), ctx("not-a-uuid"));
      expect(res.status).toBe(404);
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe("approve", () => {
    it("成功: 実行者(ID・メール)と対象をDB関数へ渡し、メールを送る", async () => {
      rpcMock.mockResolvedValue(okEvent("approve", "pending_approval", "active"));
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, action: "approve", emailSent: true });
      expect(rpcMock).toHaveBeenCalledWith("ops_change_clinic_status", {
        p_clinic_id: CLINIC, p_to_status: "active", p_actor_user_id: OPS.id, p_actor_email: OPS.email, p_reason: null,
      });
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });
    it("理由(任意)はトリムして渡す", async () => {
      rpcMock.mockResolvedValue(okEvent("approve", "pending_approval", "active"));
      await approve(req("approve", { auth: "Bearer t", body: { reason: "  書類確認済み  " } }), ctx());
      expect(rpcMock.mock.calls[0][1].p_reason).toBe("書類確認済み");
    });
    it("重複承認(DBが55000)は409で、メールは送らない", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code: "55000", message: "invalid_transition" } });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "invalid_transition" });
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("再承認で理由なし(DBが22023 reason_required)は400で、メールは送らない", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code: "22023", message: "reason_required" } });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("DB関数が想定外のエラーなら500(内部エラー文言を漏らさない)で、メールは送らない", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret db detail" } });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("secret");
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("DB関数の戻り値が不正(changed!=true)なら500でメールを送らない", async () => {
      rpcMock.mockResolvedValue({ data: { changed: false }, error: null });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(500);
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("対象医院が存在しなければ404で、DB関数もメールも呼ばない", async () => {
      maybeSingleMock.mockResolvedValue({ data: null, error: null });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(404);
      expect(rpcMock).not.toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("メール送信が無効/失敗でも状態変更は成功として返す(emailSent=false)", async () => {
      rpcMock.mockResolvedValue(okEvent("approve", "pending_approval", "active"));
      sendMailMock.mockResolvedValue({ ok: false });
      const res = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res.status).toBe(200);
      expect((await res.json()).emailSent).toBe(false);
      emailEnabledMock.mockReturnValue(false);
      sendMailMock.mockClear();
      const res2 = await approve(req("approve", { auth: "Bearer t" }), ctx());
      expect(res2.status).toBe(200);
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("理由が文字列でない/長すぎる場合は400(DB関数を呼ばない)", async () => {
      const r1 = await approve(req("approve", { auth: "Bearer t", body: { reason: 123 } }), ctx());
      const r2 = await approve(req("approve", { auth: "Bearer t", body: { reason: "あ".repeat(1001) } }), ctx());
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("成功: 理由と実行者をDB関数へ渡す(メールは送らない)", async () => {
      rpcMock.mockResolvedValue(okEvent("reject", "pending_approval", "rejected"));
      const res = await reject(req("reject", { auth: "Bearer t", body: { reason: "書類不備" } }), ctx());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, action: "reject" });
      expect(rpcMock).toHaveBeenCalledWith("ops_change_clinic_status", {
        p_clinic_id: CLINIC, p_to_status: "rejected", p_actor_user_id: OPS.id, p_actor_email: OPS.email, p_reason: "書類不備",
      });
      expect(sendMailMock).not.toHaveBeenCalled();
    });
    it("理由なし・空白のみは400(DB関数を呼ばない)", async () => {
      const r1 = await reject(req("reject", { auth: "Bearer t" }), ctx());
      const r2 = await reject(req("reject", { auth: "Bearer t", body: { reason: "   " } }), ctx());
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
      expect(rpcMock).not.toHaveBeenCalled();
    });
    it("重複却下/不正遷移(DBが55000)は409", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code: "55000", message: "invalid_transition" } });
      const res = await reject(req("reject", { auth: "Bearer t", body: { reason: "x" } }), ctx());
      expect(res.status).toBe(409);
    });
    it("対象医院なし(DBがP0002)は404", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "clinic_not_found" } });
      const res = await reject(req("reject", { auth: "Bearer t", body: { reason: "x" } }), ctx());
      expect(res.status).toBe(404);
    });
  });
});
