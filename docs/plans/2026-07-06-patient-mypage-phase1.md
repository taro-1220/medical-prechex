# 患者向けマイページ Phase1 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 患者が次回予約・来院履歴・同意履歴・自身の登録情報を閲覧できるマイページを追加する。Phase1は認証未実装のため `/api/patient/me` はダミーデータを返し、将来 `user_id` 取得後に実クエリへ差し替え可能な構造にする。

**Architecture:** 既存の `Appointment` / `Patient` 型をそのまま利用し、`ConsentSummary` / `PatientMeResponse` を追加。`/api/patient/me` (GET) が固定ダミーデータを返却し、`src/app/patient/page.tsx` がそれをfetchして5枚のカードUIで表示する。DBスキーマ変更・既存ページ変更なし。

**Tech Stack:** Next.js App Router (Client Component + Route Handler), TypeScript, Tailwind CSS v4

---

## 禁止事項（作業中に守ること）

- 既存ファイル（confirm/*, api/appointments/*, store.ts, patient-auth.ts等）の変更禁止。追加のみ
- consent_logs等のDBスキーマ変更禁止（patient_id紐付け追加はPhase2判断）
- 認証処理の実装禁止。TODOコメントのみ
- push / merge / commit は明示指示まで禁止

---

## Task 1: 型定義の追加

**Files:**
- Modify: `src/lib/types.ts`（末尾に追記のみ）

**追加内容:**

```ts
export interface ConsentSummary {
  clinicName: string;
  consentedAt: string;
}

export interface PatientMeResponse {
  patient: Patient;
  nextAppointment: Appointment | null;
  appointmentHistory: Appointment[];
  consentHistory: ConsentSummary[];
}
```

**Commit:**
```bash
git add src/lib/types.ts
git commit -m "feat: add PatientMeResponse type for patient mypage"
```

---

## Task 2: `/api/patient/me` route実装（ダミーデータ）

**Files:**
- Create: `src/app/api/patient/me/route.ts`

**内容:**

```ts
import { NextResponse } from "next/server";
import type { PatientMeResponse } from "@/lib/types";

// Phase1: no patient auth yet. This endpoint returns fixed dummy data
// shaped exactly like the future real response so the page component
// does not need to change when Phase2 auth lands.
//
// TODO: Supabase Auth / LINE Login / Email OTP (see src/lib/patient-auth.ts)
// TODO: once user_id is available, resolve the patient via
//       `patients.user_id = auth.uid()` and query real appointments/consent_logs
//       via src/lib/store.ts instead of returning this dummy payload.
export async function GET() {
  const data: PatientMeResponse = {
    patient: {
      id: "dummy-patient-id",
      name: "山田 太郎",
      phone: "090-1234-5678",
      email: "yamada@example.com",
    },
    nextAppointment: {
      id: "dummy-appt-next",
      token: "dummy-token-next",
      clinicName: "medipre歯科クリニック",
      patientName: "山田 太郎",
      phone: "090-1234-5678",
      email: "yamada@example.com",
      communicationChannel: "email",
      appointmentAt: "2026-07-15T10:00:00+09:00",
      description: "定期検診",
      cancellationPolicy: "前日18時までのキャンセルは無料です。",
      status: "ticket_issued",
      createdAt: "2026-07-01T09:00:00+09:00",
    },
    appointmentHistory: [
      {
        id: "dummy-appt-1",
        token: "dummy-token-1",
        clinicName: "medipre歯科クリニック",
        patientName: "山田 太郎",
        phone: "090-1234-5678",
        email: "yamada@example.com",
        communicationChannel: "email",
        appointmentAt: "2026-05-10T14:00:00+09:00",
        description: "初診・カウンセリング",
        cancellationPolicy: "前日18時までのキャンセルは無料です。",
        status: "completed",
        createdAt: "2026-05-01T09:00:00+09:00",
      },
    ],
    consentHistory: [
      { clinicName: "medipre歯科クリニック", consentedAt: "2026-05-01T09:10:00+09:00" },
    ],
  };

  return NextResponse.json(data);
}
```

**確認:** `curl http://localhost:3000/api/patient/me` でJSONが返ること

**Commit:**
```bash
git add src/app/api/patient/me/route.ts
git commit -m "feat: add /api/patient/me dummy endpoint for patient mypage"
```

---

## Task 3: `src/app/patient/page.tsx` 実装

**Files:**
- Create: `src/app/patient/page.tsx`

**要件:**
- `"use client"` + `useEffect`でfetch、既存ページ（confirm/[token]等）と同じロード/エラー分岐パターン
- 5セクション: 次回予約 / 来院履歴（最新10件）/ 同意履歴 / 患者情報（表示のみ）/ Coming Soon（LINEログイン・予約通知・QR再表示・家族管理・お気に入り医院、非活性カード）
- 次回予約カードに「QR表示」ボタン → `/confirm/{token}/complete` へ遷移（既存QR表示ページを流用、新規QR生成ロジックは作らない）
- スタイルは既存ページ踏襲: `rounded-2xl border border-gray-200 bg-white shadow-sm`, teal系, `max-w-lg mx-auto`, `min-h-screen bg-gray-50`
- 将来のログイン導線: ヘッダー付近に将来 `/patient/login` 等へのリンクは置かず、コメントで拡張ポイントのみ明記（実リンクは未作成のPhase2ページのため404になるので今は置かない）

**確認:** `npm run dev` で `/patient` を開き5セクションが表示されること（手動確認）

**Commit:**
```bash
git add src/app/patient/page.tsx
git commit -m "feat: add patient mypage (Phase1, dummy data)"
```

---

## Task 4: 確認

**Run:**
```bash
npm run build
npx tsc --noEmit
```

**Expected:** 両方エラーなし。既存ページ（confirm/*, clinic/*, ops/*）への差分なし（git diffで新規ファイルのみであることを確認）。
