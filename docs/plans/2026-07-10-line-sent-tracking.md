# LINE送信記録(送信申告フロー) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 予約確認URLの手動送信後、スタッフの「送信しました」申告を `appointments.{line,sms,email}_sent_at` に記録し、送信画面・予約一覧に送信済み状態を表示する。

**Architecture:** Supabase migration でカラム追加 → Bearer認証+clinic_users所有権チェック付きの mark-sent API → `clinic/new` に確認モーダル/Toast/送信済みバッジ、`clinic` 一覧にLINE送信状態表示。設計正本: `docs/plans/2026-07-10-line-sent-tracking-design.md`

**Tech Stack:** Next.js 15 App Router (Route Handlers) / React 19 / Supabase / Tailwind v4

**テストについて:** このリポジトリにテストフレームワークは未導入(scripts: dev/build/typecheck/lint のみ)。テスト基盤の新規導入はスコープ外変更のため行わず、検証は `npm run typecheck` と手動フロー確認で行う。

**commit:** CLAUDE.md により明示指示まで commit 禁止。全タスク完了後「commit可否」を報告して指示を待つ。

---

### Task 1: DBカラム + 型 + マッピング

**Files:**
- Create: `supabase/migrations/009_add_sent_at_columns.sql`
- Modify: `src/lib/types.ts:82-88`(Appointment)
- Modify: `src/lib/store.ts:4-23`(toAppt)

**Step 1: migration作成**

```sql
-- 予約確認URLの手動送信記録（スタッフの「送信しました」申告時刻。送信成否の自動取得はしない）
alter table appointments
  add column if not exists line_sent_at  timestamptz,
  add column if not exists sms_sent_at   timestamptz,
  add column if not exists email_sent_at timestamptz;
```

**Step 2: `types.ts` の `Appointment` に追加**(`checkedInAt?` の下)

```ts
  lineSentAt?: string;
  smsSentAt?: string;
  emailSentAt?: string;
```

**Step 3: `store.ts` の `toAppt` に追加**(`checkedInAt` 行の下)

```ts
    lineSentAt:           row.line_sent_at as string | undefined,
    smsSentAt:            row.sms_sent_at as string | undefined,
    emailSentAt:          row.email_sent_at as string | undefined,
```

**Step 4: Supabase へ migration 適用**

Supabase MCP/CLI が未設定のため、SQLをユーザーに提示して Supabase ダッシュボード(SQL Editor)での実行を依頼する。適用前でも `add column if not exists` のため他タスクの実装は先行可能(未適用のままAPIを叩くと500になる点を報告に含める)。

**Step 5: typecheck**

Run: `npm run typecheck` — Expected: PASS

### Task 2: mark-sent API

**Files:**
- Create: `src/app/api/appointments/[token]/mark-sent/route.ts`

認証・所有権チェックは `src/app/api/clinic/notification/route.ts` のパターンに準拠。

**Step 1: route実装**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const CHANNEL_COLUMNS = {
  line: "line_sent_at",
  sms: "sms_sent_at",
  email: "email_sent_at",
} as const;

type Channel = keyof typeof CHANNEL_COLUMNS;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(authToken);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = body?.channel as Channel | undefined;
  if (channel !== "line" && channel !== "sms" && channel !== "email") {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  const { data: appt, error: apptErr } = await getSupabase()
    .from("appointments")
    .select("id, clinic_id")
    .eq("token", token)
    .maybeSingle();
  if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // service role での無条件更新はしない: 予約の clinic に所属するユーザーのみ許可
  if (!appt.clinic_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", appt.clinic_id)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sentAt = new Date().toISOString();
  const { error: updErr } = await getSupabase()
    .from("appointments")
    .update({ [CHANNEL_COLUMNS[channel]]: sentAt })
    .eq("id", appt.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sentAt });
}
```

**Step 2: typecheck**

Run: `npm run typecheck` — Expected: PASS

### Task 3: 送信画面(clinic/new)に確認モーダル・Toast・送信済み表示

**Files:**
- Modify: `src/app/clinic/new/page.tsx`

**Step 1: state追加**(既存stateの下、`:43` 付近)

```ts
  const [apptToken, setApptToken] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Record<MessageChannel, string | null>>({ sms: null, line: null, email: null });
  const [confirmChannel, setConfirmChannel] = useState<MessageChannel | null>(null); // 確認モーダル対象
  const [marking, setMarking] = useState(false); // mark-sent API処理中(二重クリック防止)
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
```

**Step 2: handleSubmit で token 保持 + 送信状態リセット**(`setConfirmUrl(url)` の直後)

```ts
    setApptToken(appt.token);
    setSentAt({ sms: null, line: null, email: null });
```

「新しい予約を作成」ボタンの onClick にも `setApptToken(null); setSentAt({ sms: null, line: null, email: null }); setToast(null); setConfirmChannel(null);` を追加。

**Step 3: showToast / markSent 関数追加**(`copyTemplate` の下)

```ts
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const markSent = async (channel: MessageChannel) => {
    if (!apptToken || marking) return;
    setMarking(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/appointments/${apptToken}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { sentAt: at } = await res.json();
      setSentAt(prev => ({ ...prev, [channel]: at }));
      setConfirmChannel(null);
      showToast("success", `✅ ${TAB_LABELS[channel]}送信済みとして記録しました`);
    } catch {
      // 失敗時: 送信済みUIへ変更しない。モーダルは開いたまま再試行可能
      showToast("error", "記録に失敗しました。通信環境を確認して再試行してください");
    } finally {
      setMarking(false);
    }
  };
```

**Step 4: ボタン動作変更**

- 「LINEで送る」: `window.open(...)` の直後に `setConfirmChannel("line")`
- 「文面をコピー」: `copyTemplate(copyText)` の後、`activeTab !== "line"` の場合のみ `setConfirmChannel(activeTab)`(LINEタブはLINEで送るボタン側でモーダル表示)

**Step 5: テンプレートカードの送信済み表示**

- カード(`:241` の div): activeTab が送信済みなら `bg-[#F0FFF6] border-emerald-200`、未送信なら現状の `bg-white border-gray-200`
- カード左上(「送信用テンプレート」ラベルの前)に activeTab 送信済み時のみバッジ:
  `<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓ {TAB_LABELS[activeTab]}送信済み</span>`
- タブボタン: 送信済みチャネルはラベルを `✓ LINE送信済み` に変え、非アクティブ時も緑系(`bg-emerald-50 text-emerald-700`)で表示
- LINE送信済み時、「LINEで送る」ボタンのラベルを「もう一度LINEで送る」に変更(disabled にはしない。再送可能・バッジ維持)

**Step 6: 確認モーダル + Toast のJSX**(確認URL発行後画面のルート div 内、先頭)

```tsx
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {toast.message}
          </div>
        )}
        {confirmChannel && (
          <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-20 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 text-center">
              <p className="font-bold text-gray-900 mb-4">{TAB_LABELS[confirmChannel]}で送信できましたか？</p>
              <div className="space-y-2">
                <button
                  onClick={() => markSent(confirmChannel)}
                  disabled={marking}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {marking ? "記録中..." : "送信しました"}
                </button>
                <button
                  onClick={() => setConfirmChannel(null)}
                  disabled={marking}
                  className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition disabled:opacity-50"
                >
                  まだです
                </button>
              </div>
            </div>
          </div>
        )}
```

**Step 7: typecheck**

Run: `npm run typecheck` — Expected: PASS

### Task 4: 予約一覧にLINE送信状態表示

**Files:**
- Modify: `src/app/clinic/page.tsx:214-220`(バッジ行)

**Step 1: 各行のバッジ行(status バッジの隣)に追加**

```tsx
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${a.lineSentAt ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                      {a.lineSentAt ? "🟢 LINE送信済み" : "○ LINE未送信"}
                    </span>
```

**Step 2: typecheck**

Run: `npm run typecheck` — Expected: PASS

### Task 5: 検証・報告

**Step 1:** `npm run typecheck` 全体PASS確認

**Step 2:** migration未適用ならSQLを提示して適用依頼。適用後 `npm run dev` で手動確認:
1. 予約作成 → LINEで送る → モーダル表示
2. 「送信しました」→ Toast(3秒)・カード緑・タブ「✓ LINE送信済み」
3. 「まだです」→ 変化なし
4. SMS/メールタブの文面コピー → モーダル表示
5. 一覧で 🟢 LINE送信済み / ○ LINE未送信 表示
6. DB: `line_sent_at` 更新確認
7. 未ログインで mark-sent → 401

**Step 3:** 報告(変更ファイル / 追加カラム / 変更画面 / 送信済み表示仕様 / typecheck結果 / commit可否)。UX変更のため6項目テンプレート(改善/犠牲/らしさ/競合/自己評価/次の提案)も併記。
