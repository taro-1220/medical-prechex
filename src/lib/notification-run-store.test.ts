import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { recordNotificationRun, getRecentNotificationSummary, setEmailLastFailedAt } from "./notification-run-store";

describe("recordNotificationRun", () => {
  it("migration未適用（42P01）でも例外を投げない", async () => {
    fromMock.mockReturnValue({ insert: async () => ({ error: { code: "42P01" } }) });
    await expect(
      recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 1, failedCount: 0, skippedCount: 0, cappedCount: 0 }),
    ).resolves.toBeUndefined();
  });

  it("正常時は指定したカラムでinsertする", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    await recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 3, failedCount: 1, skippedCount: 2, cappedCount: 0 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ notification_type: "reminder_day_before", sent_count: 3, failed_count: 1 }));
  });

  it("skip_reasons を保存する（migration 031）", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    const skipReasons = { clinic_settings_incomplete: [{ clinic_id: "clinic-1", count: 2 }] };
    await recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 0, failedCount: 0, skippedCount: 2, cappedCount: 0, skipReasons });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ skip_reasons: skipReasons }));
  });

  it("列なし以外のエラー（制約違反など）では再記録しない", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    fromMock.mockReturnValue({ insert });
    await recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 0, failedCount: 0, skippedCount: 1, cappedCount: 0, skipReasons: { clinic_settings_incomplete: [{ clinic_id: "clinic-1", count: 1 }] } });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("PostgRESTのスキーマキャッシュに列が無い(PGRST204)場合も skip_reasons を外して記録し直す", async () => {
    const insert = vi.fn()
      .mockResolvedValueOnce({ error: { code: "PGRST204", message: "Could not find the column in the schema cache" } })
      .mockResolvedValueOnce({ error: null });
    fromMock.mockReturnValue({ insert });
    await recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 0, failedCount: 0, skippedCount: 1, cappedCount: 0, skipReasons: { clinic_settings_incomplete: [{ clinic_id: "clinic-1", count: 1 }] } });
    expect(insert).toHaveBeenCalledTimes(2);
    expect("skip_reasons" in (insert.mock.calls[1][0] as Record<string, unknown>)).toBe(false);
  });

  it("migration 031未適用(42703)なら skip_reasons を外して記録し直す", async () => {
    const insert = vi.fn()
      .mockResolvedValueOnce({ error: { code: "42703", message: "column does not exist" } })
      .mockResolvedValueOnce({ error: null });
    fromMock.mockReturnValue({ insert });
    await recordNotificationRun({ notificationType: "reminder_day_before", startedAt: "2026-03-05T08:00:00.000Z", sentCount: 0, failedCount: 0, skippedCount: 1, cappedCount: 0, skipReasons: { clinic_settings_incomplete: [{ clinic_id: "clinic-1", count: 1 }] } });
    expect(insert).toHaveBeenCalledTimes(2);
    expect("skip_reasons" in (insert.mock.calls[1][0] as Record<string, unknown>)).toBe(false);
  });
});

describe("getRecentNotificationSummary", () => {
  it("migration未適用時はavailable:false", async () => {
    fromMock.mockReturnValue({
      select: () => ({ gte: () => ({ order: async () => ({ data: null, error: { code: "42P01" } }) }) }),
    });
    expect(await getRecentNotificationSummary("2026-03-04T00:00:00.000Z")).toEqual({ available: false });
  });

  it("複数行を合算して返す", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        gte: () => ({
          order: async () => ({
            data: [
              { sent_count: 3, failed_count: 1, skipped_count: 0, capped_count: 0, finished_at: "2026-03-05T08:01:00.000Z" },
              { sent_count: 2, failed_count: 0, skipped_count: 1, capped_count: 0, finished_at: "2026-03-04T08:01:00.000Z" },
            ],
            error: null,
          }),
        }),
      }),
    });
    const res = await getRecentNotificationSummary("2026-03-04T00:00:00.000Z");
    expect(res).toEqual({ available: true, sent: 5, failed: 1, skipped: 1, capped: 0, lastRunAt: "2026-03-05T08:01:00.000Z" });
  });

  it("0件でも0を返す（available:trueのまま）", async () => {
    fromMock.mockReturnValue({ select: () => ({ gte: () => ({ order: async () => ({ data: [], error: null }) }) }) });
    expect(await getRecentNotificationSummary("2026-03-04T00:00:00.000Z")).toEqual({ available: true, sent: 0, failed: 0, skipped: 0, capped: 0, lastRunAt: null });
  });
});

describe("setEmailLastFailedAt", () => {
  it("migration未適用でも例外を投げない", async () => {
    fromMock.mockReturnValue({ update: () => ({ eq: async () => ({ error: { code: "42703" } }) }) });
    await expect(setEmailLastFailedAt("a1", "2026-03-05T00:00:00.000Z")).resolves.toBeUndefined();
  });
});
