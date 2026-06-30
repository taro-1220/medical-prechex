# Phase2 成約後オンボーディング 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理者が医院を作成し、医院管理者がプロフィール・ポリシー・通知メッセージを設定して利用開始できるオンボーディングフローを追加する。

**Architecture:** clinic_profile（患者向け表示情報SSOT）とonboarding_progress（進捗管理）の2テーブルを追加。APIルートで各設定を保存し、/clinic/onboardingページで4カード表示。/clinicページはactivated_at未設定時にバナー表示。

**Tech Stack:** Next.js App Router API Routes, Supabase (service role), TypeScript

---

## 禁止事項（作業中に守ること）

- Sales OS連携・Stripe・Trial・OPS・CRM・営業メール → 実装禁止
- TODOコメント追加禁止
- 指定外ファイル修正禁止
- unrelated refactor禁止

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/005_onboarding.sql`

**Step 1: ファイル作成**

```sql
-- clinic_profile
create table if not exists clinic_profile (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null unique references clinics(id) on delete cascade,
  clinic_display_name  text not null default '',
  director_name        text not null default '',
  phone                text not null default '',
  email                text not null default '',
  postal_code          text not null default '',
  address              text not null default '',
  website_url          text not null default '',
  cancellation_policy  text not null default '',
  default_message      text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger clinic_profile_updated_at
  before update on clinic_profile
  for each row execute procedure set_updated_at();

create index if not exists clinic_profile_clinic_id_idx on clinic_profile(clinic_id);

-- onboarding_progress
create table if not exists onboarding_progress (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null unique references clinics(id) on delete cascade,
  profile_completed       boolean not null default false,
  policy_completed        boolean not null default false,
  notification_completed  boolean not null default false,
  activated_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger onboarding_progress_updated_at
  before update on onboarding_progress
  for each row execute procedure set_updated_at();

create index if not exists onboarding_progress_clinic_id_idx on onboarding_progress(clinic_id);
```

**Step 2: Supabase に適用（手動）**

Supabase SQL Editorで実行するか `supabase db push` を使う。

**Step 3: Commit**

```bash
git add supabase/migrations/005_onboarding.sql
git commit -m "feat: add clinic_profile and onboarding_progress migrations"
```

---

## Task 2: 型追加

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: 末尾に追加**

```typescript
export interface ClinicProfile {
  id: string;
  clinicId: string;
  clinicDisplayName: string;
  directorName: string;
  phone: string;
  email: string;
  postalCode: string;
  address: string;
  websiteUrl: string;
  cancellationPolicy: string;
  defaultMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  id: string;
  clinicId: string;
  profileCompleted: boolean;
  policyCompleted: boolean;
  notificationCompleted: boolean;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add ClinicProfile and OnboardingProgress types"
```

---

## Task 3: GET /api/clinic/onboarding

**Files:**
- Create: `src/app/api/clinic/onboarding/route.ts`

**Step 1: ファイル作成**

認証パターンは `/api/clinic/list/route.ts` と同じ（Bearer token → getUser → clinic_users確認）。
clinic_id はクエリパラメータ `?clinic_id=<uuid>` で受け取る。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { ClinicProfile, OnboardingProgress } from "@/lib/types";

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });

  // 所属確認
  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // onboarding_progress
  const { data: prog } = await getSupabase()
    .from("onboarding_progress")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  // clinic_profile
  const { data: prof } = await getSupabase()
    .from("clinic_profile")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const progress: OnboardingProgress | null = prog ? {
    id: prog.id as string,
    clinicId: prog.clinic_id as string,
    profileCompleted: prog.profile_completed as boolean,
    policyCompleted: prog.policy_completed as boolean,
    notificationCompleted: prog.notification_completed as boolean,
    activatedAt: prog.activated_at as string | null,
    createdAt: prog.created_at as string,
    updatedAt: prog.updated_at as string,
  } : null;

  const profile: ClinicProfile | null = prof ? {
    id: prof.id as string,
    clinicId: prof.clinic_id as string,
    clinicDisplayName: prof.clinic_display_name as string,
    directorName: prof.director_name as string,
    phone: prof.phone as string,
    email: prof.email as string,
    postalCode: prof.postal_code as string,
    address: prof.address as string,
    websiteUrl: prof.website_url as string,
    cancellationPolicy: prof.cancellation_policy as string,
    defaultMessage: prof.default_message as string,
    createdAt: prof.created_at as string,
    updatedAt: prof.updated_at as string,
  } : null;

  return NextResponse.json({ progress, profile });
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/clinic/onboarding/route.ts
git commit -m "feat: add GET /api/clinic/onboarding"
```

---

## Task 4: PUT /api/clinic/profile

**Files:**
- Create: `src/app/api/clinic/profile/route.ts`

**Step 1: ファイル作成**

clinic_profileをupsert、onboarding_progressのprofile_completed=trueを設定する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clinicId, clinicDisplayName, directorName, phone, email, postalCode, address, websiteUrl } = body;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({
      clinic_id: clinicId,
      clinic_display_name: clinicDisplayName ?? "",
      director_name: directorName ?? "",
      phone: phone ?? "",
      email: email ?? "",
      postal_code: postalCode ?? "",
      address: address ?? "",
      website_url: websiteUrl ?? "",
    }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, profile_completed: true }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/clinic/profile/route.ts
git commit -m "feat: add PUT /api/clinic/profile"
```

---

## Task 5: PUT /api/clinic/policy

**Files:**
- Create: `src/app/api/clinic/policy/route.ts`

**Step 1: ファイル作成**

cancellation_policyのみ更新し、policy_completed=trueを設定する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId, cancellationPolicy } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, cancellation_policy: cancellationPolicy ?? "" }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, policy_completed: true }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/clinic/policy/route.ts
git commit -m "feat: add PUT /api/clinic/policy"
```

---

## Task 6: PUT /api/clinic/notification

**Files:**
- Create: `src/app/api/clinic/notification/route.ts`

**Step 1: ファイル作成**

default_messageのみ更新し、notification_completed=trueを設定する。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId, defaultMessage } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, default_message: defaultMessage ?? "" }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, notification_completed: true }, { onConflict: "clinic_id", ignoreDuplicates: false });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/clinic/notification/route.ts
git commit -m "feat: add PUT /api/clinic/notification"
```

---

## Task 7: POST /api/clinic/activate

**Files:**
- Create: `src/app/api/clinic/activate/route.ts`

**Step 1: ファイル作成**

3項目がすべてtrueの場合のみactivated_at=now(), clinics.status='active'にする。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: prog } = await getSupabase()
    .from("onboarding_progress")
    .select("profile_completed, policy_completed, notification_completed")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!prog?.profile_completed || !prog?.policy_completed || !prog?.notification_completed) {
    return NextResponse.json({ error: "初期設定が完了していません" }, { status: 400 });
  }

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .update({ activated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId);
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  const { error: clinicErr } = await getSupabase()
    .from("clinics")
    .update({ status: "active" })
    .eq("id", clinicId);
  if (clinicErr) return NextResponse.json({ error: clinicErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/clinic/activate/route.ts
git commit -m "feat: add POST /api/clinic/activate"
```

---

## Task 8: オンボーディングページ

**Files:**
- Create: `src/app/clinic/onboarding/page.tsx`

**Step 1: ファイル作成**

4カード表示。各カードは「設定する」で展開するインラインフォーム。利用開始ボタンは3項目完了時のみ有効。

```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getCurrentClinic } from "@/lib/clinic-auth";
import type { ClinicProfile, OnboardingProgress } from "@/lib/types";

type Section = "profile" | "policy" | "notification" | null;

export default function OnboardingPage() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [open, setOpen] = useState<Section>(null);
  const [saving, setSaving] = useState(false);

  // profile form state
  const [pf, setPf] = useState({ clinicDisplayName: "", directorName: "", phone: "", email: "", postalCode: "", address: "", websiteUrl: "" });
  const [policy, setPolicy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const clinic = await getCurrentClinic();
      if (!clinic) { router.replace("/login"); return; }
      setClinicId(clinic.id);
      await load(clinic.id);
    })();
  }, [router]);

  async function load(cid: string) {
    const token = await getAccessToken();
    const res = await fetch(`/api/clinic/onboarding?clinic_id=${cid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { progress: prog, profile: prof } = await res.json();
    setProgress(prog);
    setProfile(prof);
    if (prof) {
      setPf({ clinicDisplayName: prof.clinicDisplayName, directorName: prof.directorName, phone: prof.phone, email: prof.email, postalCode: prof.postalCode, address: prof.address, websiteUrl: prof.websiteUrl });
      setPolicy(prof.cancellationPolicy);
      setMessage(prof.defaultMessage);
    }
  }

  async function saveProfile() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, ...pf }),
    });
    await load(clinicId);
    setOpen(null);
    setSaving(false);
  }

  async function savePolicy() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, cancellationPolicy: policy }),
    });
    await load(clinicId);
    setOpen(null);
    setSaving(false);
  }

  async function saveNotification() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/notification", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, defaultMessage: message }),
    });
    await load(clinicId);
    setOpen(null);
    setSaving(false);
  }

  async function activate() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    const res = await fetch("/api/clinic/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId }),
    });
    setSaving(false);
    if (res.ok) router.replace("/clinic");
  }

  const allDone = !!progress?.profileCompleted && !!progress?.policyCompleted && !!progress?.notificationCompleted;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <p className="text-gray-400 text-sm">← <button onClick={() => router.back()} className="hover:text-gray-900 transition">戻る</button></p>
        <h1 className="text-xl font-black mt-1">初期設定</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        {/* Card: 医院プロフィール */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">医院プロフィール</p>
              <p className="text-xs text-gray-400 mt-0.5">医院名・院長名・連絡先・住所</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.profileCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setOpen(open === "profile" ? null : "profile")} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {open === "profile" ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {open === "profile" && (
            <div className="mt-4 space-y-3">
              <div><label className={labelCls}>医院表示名</label><input className={inputCls} value={pf.clinicDisplayName} onChange={e => setPf(p => ({ ...p, clinicDisplayName: e.target.value }))} /></div>
              <div><label className={labelCls}>院長名</label><input className={inputCls} value={pf.directorName} onChange={e => setPf(p => ({ ...p, directorName: e.target.value }))} /></div>
              <div><label className={labelCls}>電話番号</label><input className={inputCls} value={pf.phone} onChange={e => setPf(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label className={labelCls}>メールアドレス</label><input className={inputCls} value={pf.email} onChange={e => setPf(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label className={labelCls}>郵便番号</label><input className={inputCls} value={pf.postalCode} onChange={e => setPf(p => ({ ...p, postalCode: e.target.value }))} /></div>
              <div><label className={labelCls}>住所</label><input className={inputCls} value={pf.address} onChange={e => setPf(p => ({ ...p, address: e.target.value }))} /></div>
              <div><label className={labelCls}>Webサイト</label><input className={inputCls} value={pf.websiteUrl} onChange={e => setPf(p => ({ ...p, websiteUrl: e.target.value }))} /></div>
              <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        {/* Card: キャンセルポリシー */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">キャンセルポリシー</p>
              <p className="text-xs text-gray-400 mt-0.5">患者に表示するキャンセル規約</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.policyCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setOpen(open === "policy" ? null : "policy")} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {open === "policy" ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {open === "policy" && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={policy} onChange={e => setPolicy(e.target.value)} placeholder="例：予約日24時間前以降のキャンセルは、キャンセル料が発生します。" />
              <button onClick={savePolicy} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        {/* Card: 予約確認メッセージ */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">予約確認メッセージ</p>
              <p className="text-xs text-gray-400 mt-0.5">予約確定時に患者へ送るメッセージ</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.notificationCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setOpen(open === "notification" ? null : "notification")} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {open === "notification" ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {open === "notification" && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="例：ご予約が確定しました。当日はお時間に余裕をもってお越しください。" />
              <button onClick={saveNotification} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        {/* Card: 利用開始 */}
        <div className={`rounded-2xl border shadow-sm p-5 ${allDone ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">利用開始</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {allDone ? "すべての設定が完了しました" : "上記3項目をすべて設定してください"}
              </p>
            </div>
            <button
              onClick={activate}
              disabled={!allDone || saving}
              className="px-5 py-2.5 bg-teal-600 rounded-xl text-white font-bold text-sm hover:bg-teal-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {saving ? "処理中..." : "利用開始"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
```

**Step 2: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/clinic/onboarding/page.tsx
git commit -m "feat: add /clinic/onboarding page"
```

---

## Task 9: /clinic ページにバナー追加

**Files:**
- Modify: `src/app/clinic/page.tsx`

**Step 1: state追加と onboarding_progress フェッチ**

`ClinicPage` コンポーネントに以下を追加する。

state追加（既存stateの後に）:
```typescript
const [activatedAt, setActivatedAt] = useState<string | null | undefined>(undefined);
```

`undefined` = 未ロード、`null` = 未設定、`string` = 設定済み。

**Step 2: useEffect内でonboarding fetchを追加**

既存のuseEffect（clinics取得）の内部、`setClinic(current)` の後に追加:

```typescript
// onboarding_progressのactivated_atを確認
const token = await getAccessToken();
const obRes = await fetch(`/api/clinic/onboarding?clinic_id=${current.id}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (obRes.ok) {
  const { progress } = await obRes.json();
  setActivatedAt(progress?.activatedAt ?? null);
} else {
  setActivatedAt(null);
}
```

import追加:
```typescript
import { getCurrentUser, getUserClinics, getSelectedClinicId, setSelectedClinicId, getAccessToken } from "@/lib/clinic-auth";
```

**Step 3: バナーをJSXに追加**

`{showGuide && <OnboardingGuide ... />}` の直後に追加:

```typescript
{activatedAt === null && (
  <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
    <p className="text-sm text-amber-800 font-medium">初期設定が完了していません</p>
    <a href="/clinic/onboarding" className="px-4 py-1.5 bg-amber-500 rounded-lg text-white text-sm font-bold hover:bg-amber-600 transition">
      初期設定へ
    </a>
  </div>
)}
```

**Step 4: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/app/clinic/page.tsx
git commit -m "feat: show onboarding banner on /clinic when not activated"
```

---

## Task 10: 最終確認

**Step 1: typecheck**

```bash
cd /Users/taro/projects/medipre && npx tsc --noEmit 2>&1
```

エラーなしを確認。

**Step 2: build**

```bash
cd /Users/taro/projects/medipre && npx next build 2>&1 | tail -20
```

**Step 3: commit可否判断**

全タスク完了・typecheck/build通過で commit 可。

---

## 追加テーブル一覧

| テーブル | 用途 |
|---|---|
| clinic_profile | 患者向け表示情報SSOT（医院名・院長・連絡先・キャンセルポリシー・通知メッセージ） |
| onboarding_progress | 初期設定進捗（profile_completed/policy_completed/notification_completed/activated_at） |

## 追加APIルート一覧

| Method | Path | 処理 |
|---|---|---|
| GET | /api/clinic/onboarding | progress + profile 取得 |
| PUT | /api/clinic/profile | 医院プロフィール保存 → profile_completed=true |
| PUT | /api/clinic/policy | キャンセルポリシー保存 → policy_completed=true |
| PUT | /api/clinic/notification | 通知メッセージ保存 → notification_completed=true |
| POST | /api/clinic/activate | 3項目確認後 activated_at=now(), status='active' |

## 追加画面

| パス | 内容 |
|---|---|
| /clinic/onboarding | 4カードの初期設定ページ |

## 変更画面

| パス | 変更内容 |
|---|---|
| /clinic | activated_at=null時にバナー表示 |
