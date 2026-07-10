import type { MessageChannel } from "./types";

// デフォルト文言の一元管理場所。医院が一度もカスタマイズしていない場合の
// 表示・「初期文に戻す」の復元先・GET /api/clinic/templates のフォールバックに使う。
export const DEFAULT_TEMPLATES: Record<MessageChannel, { subject: string | null; body: string }> = {
  sms: {
    subject: null,
    body: "【{{clinicName}}】{{patientName}} 様\n予約確認をお願いします。\n{{confirmUrl}}",
  },
  line: {
    subject: null,
    body:
      "【{{clinicName}}】\n\n{{patientName}}様\n\nご予約ありがとうございます。\n\nご来院前に予約内容の確認と同意のお手続きをお願いいたします。\n\n▼確認はこちら\n{{confirmUrl}}\n\n確認完了後、受付用QRチケットが表示されます。\nご来院時に受付スタッフへご提示ください。\n\n――――――\nmedipre（メディプリ）",
  },
  email: {
    subject: "【予約確認】ご確認のお願い",
    body: "{{patientName}} 様\n\nご予約の確認をお願いします。\n以下のURLからご確認ください。\n\n{{confirmUrl}}\n\n{{clinicName}}",
  },
};

// 最低限対応するプレースホルダー。テンプレート編集画面の凡例表示に使う。
export const PLACEHOLDER_KEYS = ["patientName", "clinicName", "confirmUrl"] as const;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

// 置換後の文字列に {{...}} が残っていれば、変数が渡されなかった/未知のプレースホルダー。
export function findUnresolvedPlaceholders(rendered: string): string[] {
  const matches = rendered.match(/\{\{\w+\}\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}
