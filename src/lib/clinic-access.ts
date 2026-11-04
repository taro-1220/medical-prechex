import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { ClinicRole, ClinicStatus } from "./types";

/**
 * 医院スコープ API の共通ガード。
 * DB クライアントは service role（RLS バイパス）のため、権限の防壁はここと各 route の認可になる。
 *
 * 権限マトリクス（唯一の定義。変更はここだけ）:
 *   view        予約・患者・設定の閲覧            owner / manager / staff
 *   operate     受付(checkin)・完了・キャンセル    owner / manager / staff
 *   reservation 予約の新規作成・通知送信記録       owner / manager / staff
 *   settings    医院設定の変更・初期設定の有効化    owner / manager
 *   stripe      Stripe Connect                    owner のみ
 * 承認・却下は運営管理者(requireOpsAdmin)のみで、本ガードの対象外。
 * 未知のロール値・null は全権限なし（fail-closed）。
 *
 * 承認状態(clinics.status)による制限:
 *   active            通常業務を許可
 *   pending_approval  承認待ち画面と申請に必要な最低限（current/list/select/onboarding の閲覧）のみ
 *   rejected          通常業務・患者情報アクセスを禁止（current/list/select で状態表示のみ）
 * 既存予約のキャンセル・返金・監査記録は、運営管理者専用の例外フロー設計が済むまで遮断しない
 * （clinic/appointments/[id]/cancel と judgment は承認状態を問わない。要判断事項として別途一覧化）。
 */
export type ClinicPermission = "view" | "operate" | "reservation" | "settings" | "stripe";

const ROLE_PERMISSIONS: Record<ClinicRole, ReadonlySet<ClinicPermission>> = {
  owner: new Set<ClinicPermission>(["view", "operate", "reservation", "settings", "stripe"]),
  manager: new Set<ClinicPermission>(["view", "operate", "reservation", "settings"]),
  staff: new Set<ClinicPermission>(["view", "operate", "reservation"]),
};

export function roleHasPermission(role: unknown, permission: ClinicPermission): boolean {
  if (typeof role !== "string") return false;
  const perms = ROLE_PERMISSIONS[role as ClinicRole];
  return perms ? perms.has(permission) : false;
}

export type ClinicAccessOk = { ok: true; user: User; clinicId: string; role: ClinicRole; clinicStatus: ClinicStatus | null };
export type ClinicAccessResult = ClinicAccessOk | { ok: false; response: NextResponse };

/** requireActive: active のみ許可。allowedStatuses: 許可する承認状態を明示（pending の申請用閲覧など）。 */
export type AccessOpts = { requireActive?: boolean; allowedStatuses?: ClinicStatus[] };

const deny = (error: string, status: number): { ok: false; response: NextResponse } =>
  ({ ok: false, response: NextResponse.json({ error }, { status }) });

/** Bearer トークンからユーザーを確定する。失敗時は null。 */
export async function authenticateRequest(req: NextRequest): Promise<User | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  return error || !user ? null : user;
}

/**
 * 認証済みユーザーが clinicId に所属し、permission を持つかを検証する。
 * requireActive=true のとき、clinics.status が 'active' でなければ 403（承認前・却下の医院は通常業務不可）。
 * 既存予約の処理・閲覧など、承認状態に関わらず許す操作は requireActive を指定しない。
 */
export async function authorizeClinicAccess(
  user: User,
  clinicId: string,
  permission: ClinicPermission,
  opts: AccessOpts = {},
): Promise<ClinicAccessResult> {
  const sb = getSupabase();
  const { data: cu, error: cuErr } = await sb
    .from("clinic_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (cuErr) return deny(cuErr.message, 500);
  if (!cu) return deny("Forbidden", 403);
  if (!roleHasPermission(cu.role, permission)) return deny(`Forbidden: ${permission} permission required`, 403);

  // 承認状態は requireActive のときだけ参照する（既存予約の処理などは承認状態を問わない）
  const allowed: ClinicStatus[] | null = opts.requireActive ? ["active"] : (opts.allowedStatuses ?? null);
  if (!allowed) {
    return { ok: true, user, clinicId, role: cu.role as ClinicRole, clinicStatus: null };
  }
  const { data: clinic, error: cErr } = await sb
    .from("clinics")
    .select("status")
    .eq("id", clinicId)
    .maybeSingle();
  if (cErr) return deny(cErr.message, 500);
  const status = clinic?.status as ClinicStatus | undefined;
  if (!status || !allowed.includes(status)) return deny("Forbidden: clinic not approved", 403);

  return { ok: true, user, clinicId, role: cu.role as ClinicRole, clinicStatus: status };
}

/** 認証 + authorizeClinicAccess。clinicId が事前に分かっている route 用。 */
export async function requireClinicAccess(
  req: NextRequest,
  clinicId: string,
  permission: ClinicPermission,
  opts: AccessOpts = {},
): Promise<ClinicAccessResult> {
  const user = await authenticateRequest(req);
  if (!user) return deny("Unauthorized", 401);
  return authorizeClinicAccess(user, clinicId, permission, opts);
}

/**
 * 一覧系 GET（患者・予約）用: ユーザーが view 権限を持つ「active な」所属医院の ID だけを返す。
 * pending_approval / rejected の医院の患者情報は返さない。所属は有るが active が無い場合は
 * blocked=true（呼び出し側が 403 にする）。所属自体が無い場合は blocked=false・空配列（従来どおり）。
 */
export async function getActiveClinicIdsForUser(
  userId: string,
): Promise<{ ok: true; clinicIds: string[]; blocked: boolean } | { ok: false; response: NextResponse }> {
  const sb = getSupabase();
  const { data: cu, error: cuErr } = await sb.from("clinic_users").select("clinic_id, role").eq("user_id", userId);
  if (cuErr) return deny(cuErr.message, 500);
  const members = (cu ?? []).filter(r => roleHasPermission(r.role, "view"));
  if (members.length === 0) return { ok: true, clinicIds: [], blocked: (cu ?? []).length > 0 };
  const { data: rows, error: cErr } = await sb
    .from("clinics")
    .select("id, status")
    .in("id", members.map(r => r.clinic_id as string));
  if (cErr) return deny(cErr.message, 500);
  const clinicIds = (rows ?? []).filter(r => r.status === "active").map(r => r.id as string);
  return { ok: true, clinicIds, blocked: clinicIds.length === 0 };
}
