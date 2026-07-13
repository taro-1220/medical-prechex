# LINE送信記録(送信申告フロー) 設計

日付: 2026-07-10
ステータス: 承認済み(追加修正反映)

## 目的

予約確認URLをLINE/SMS/メールで手動送信した後、送信済みかどうかが画面上で分からない不安を解消する。
送信成否は技術的に取得できないため、スタッフの「送信しました」申告を運用上の送信記録とする。
送信結果の自動取得機能は実装しない。

## DB

migration `supabase/migrations/009_add_sent_at_columns.sql`(006〜008は使用済み):

- `appointments.line_sent_at timestamptz null`
- `appointments.sms_sent_at timestamptz null`
- `appointments.email_sent_at timestamptz null`

「送信しました」押下のたびに現在時刻で上書き(再送時は最新申告日時が残る)。
`line_sent_by` 等の送信者(スタッフ)記録カラムは**今回対象外**(最小実装優先)。

`src/lib/types.ts` の `Appointment` 型に3フィールド追加。

## API

`POST /api/appointments/[token]/mark-sent` body: `{ channel: "line" | "sms" | "email" }`
(既存の予約APIが `[token]` 動的セグメントのため、同一階層に `[id]` は作れない。tokenで予約を特定する)

処理順:
1. `Authorization: Bearer <token>` から `getSupabase().auth.getUser(token)` でユーザー解決。失敗は 401
2. 予約を取得し、その `clinic_id` と `clinic_users`(user_id, clinic_id) を突合。予約が存在しない場合は 404、所属しない場合は 403
3. channel が3値以外は 400
4. 該当カラムに `now()` を保存

service role での無条件更新はしない(必ず所有権チェックを通す)。
既存パターン `src/app/api/clinic/notification/route.ts` の認証・所有権チェックに準拠。

## UI: 送信画面 `src/app/clinic/new/page.tsx`

- 「LINEで送る」押下 → LINE共有 `window.open` と同時に確認モーダル表示
  「LINEで送信できましたか？」 [送信しました] [まだです]
- SMS/メールタブは「文面をコピー」押下後に同モーダル(文言はチャネル名で変化)
- [送信しました] → mark-sent API 呼び出し
  - 成功: ①テンプレートカード左上に「✓ LINE送信済み」バッジ(緑) ②カード背景 `#F0FFF6` ③タブ表示「✓ LINE送信済み」 ④画面上部に Success Toast「✅ LINE送信済みとして記録しました」(3秒で消滅)
  - 失敗: 送信済みUIへは変更しない。エラーToastを表示し、再試行可能(モーダルは開いたまま or 再度開ける)
  - API処理中は [送信しました] ボタンを disabled(二重クリック防止)
- [まだです] → モーダルを閉じるのみ
- 送信済み後も再送ボタンは押せる。バッジは維持
- Toast/モーダルは共通コンポーネントが無いためページ内に軽量実装(Tailwind直書き)

## UI: 予約一覧 `src/app/clinic/page.tsx`

各行に LINE 送信状態を表示: `🟢 送信済み`(緑) / `○ 未送信`(グレー)。

## 表示しない画面(明示)

- 患者向け `checkin/[token]` / `confirm/[token]` には送信状態を**表示しない**
- クリニック向け予約詳細画面は現状存在しないため**新設しない**。一覧表示のみ

## 確認項目

- LINE送信後に確認モーダルが表示される
- 「送信しました」でDB更新(line_sent_at)
- Toast表示(3秒で消滅)
- カードが緑になる(バッジ+背景)
- 一覧画面で送信済み/未送信表示
- API失敗時: UI変更なし・エラーToast・再試行可能
- 未ログイン 401 / 他クリニック予約 403
- typecheck通過
