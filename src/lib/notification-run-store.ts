// 自動送信（前日リマインド等）の実行結果ログ(notification_run_log)と、予約単位の直近失敗記録
// (appointments.email_last_failed_at)。migration 026未適用の間は、記録の失敗を握りつぶし、
// 送信処理自体は止めない（安全側）。
import { getSupabase } from "./supabase";
import { isMissingColumnError } from "./db-errors";

/** 送信を止めた理由ごとのクリニック別件数。形式: {"clinic_settings_incomplete": [{clinic_id, count}]} */
export type NotificationSkipReasons = Record<string, { clinic_id: string; count: number }[]>;

export interface NotificationRunResult {
  notificationType: string;
  startedAt: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  cappedCount: number;
  clinicBreakdown?: Record<string, unknown>;
  skipReasons?: NotificationSkipReasons;
}

export async function recordNotificationRun(result: NotificationRunResult): Promise<void> {
  try {
    const base = {
      notification_type: result.notificationType,
      started_at: result.startedAt,
      sent_count: result.sentCount,
      failed_count: result.failedCount,
      skipped_count: result.skippedCount,
      capped_count: result.cappedCount,
      clinic_breakdown: result.clinicBreakdown ?? null,
    };
    const { error } = await getSupabase()
      .from("notification_run_log")
      .insert({ ...base, skip_reasons: result.skipReasons ?? null });
    // 列が存在しない(migration 031未適用)ときだけ、skip_reasons を外して既存列で記録し直す。
    // それ以外のエラーは意図的に見ない: migration未適用(42P01)等でも送信処理自体を止めないため。
    if (isMissingColumnError(error)) {
      console.error("notification_run_log skip_reasons column missing");
      await getSupabase().from("notification_run_log").insert(base);
    }
  } catch {
    // ネットワーク例外等でも送信処理自体は止めない
  }
}

export type RecentNotificationSummary =
  | { available: true; sent: number; failed: number; skipped: number; capped: number; lastRunAt: string | null }
  | { available: false };

/** 直近N時間の自動送信サマリ（/ops表示用）。migration未適用時はavailable:false */
export async function getRecentNotificationSummary(sinceIso: string): Promise<RecentNotificationSummary> {
  const { data, error } = await getSupabase()
    .from("notification_run_log")
    .select("sent_count, failed_count, skipped_count, capped_count, finished_at")
    .gte("started_at", sinceIso)
    .order("started_at", { ascending: false });
  if (error) return { available: false };
  const rows = data ?? [];
  const sum = (key: "sent_count" | "failed_count" | "skipped_count" | "capped_count") =>
    rows.reduce((acc, r) => acc + ((r[key] as number) ?? 0), 0);
  return {
    available: true,
    sent: sum("sent_count"),
    failed: sum("failed_count"),
    skipped: sum("skipped_count"),
    capped: sum("capped_count"),
    lastRunAt: (rows[0]?.finished_at as string | undefined) ?? null,
  };
}

/** 失敗時刻を記録。成功時はnull指定でクリアする。migration未適用時は何もしない */
export async function setEmailLastFailedAt(appointmentId: string, iso: string | null): Promise<void> {
  try {
    await getSupabase().from("appointments").update({ email_last_failed_at: iso }).eq("id", appointmentId);
    // 戻り値の{error}は意図的に見ない: migration未適用(42703)でも送信処理自体は止めない。
  } catch {
    // ネットワーク例外等でも送信処理自体は止めない
  }
}
