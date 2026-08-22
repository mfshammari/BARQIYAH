// دوال خالصة لبناء وتحليل حمولات واتساب — بلا أي اعتماد على البيئة أو قاعدة البيانات
// (تُختبر مستقلة: npm run test:whatsapp)

import type { InboundReply } from './types';

/** payload أزرار الرد السريع: يحمل نوع الرد وتوكن الدعوة. */
export function buildButtonPayloads(inviteToken: string) {
  return {
    accept: `ACCEPT:${inviteToken}`,
    decline: `DECLINE:${inviteToken}`,
  };
}

/** payload صفوف قائمة اختيار عدد الحاضرين. */
export function buildSeatsPayload(inviteToken: string, seats: number) {
  return `SEATS:${inviteToken}:${seats}`;
}

export function parseButtonPayload(
  payload: string,
): { kind: 'accept' | 'decline' | 'seats'; token: string; seats?: number } | null {
  const raw = payload.trim();

  const seatsMatch = /^SEATS:([0-9a-f-]{36}):(\d{1,2})$/i.exec(raw);
  if (seatsMatch) {
    return { kind: 'seats', token: seatsMatch[1], seats: Number(seatsMatch[2]) };
  }

  const m = /^(ACCEPT|DECLINE):([0-9a-f-]{36})$/i.exec(raw);
  if (!m) return null;
  return { kind: m[1].toUpperCase() === 'ACCEPT' ? 'accept' : 'decline', token: m[2] };
}

/** استخراج ردود الأزرار من جسم webhook الوارد من Meta. */
export function parseWebhookPayload(body: unknown): InboundReply[] {
  const replies: InboundReply[] = [];
  const root = body as {
    entry?: {
      changes?: {
        value?: {
          messages?: {
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            button?: { payload?: string; text?: string };
            interactive?: {
              type?: string;
              button_reply?: { id?: string; title?: string };
              list_reply?: { id?: string; title?: string };
            };
          }[];
        };
      }[];
    }[];
  };

  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const from = msg.from ?? '';
        const messageId = msg.id ?? '';
        if (!from) continue;

        // زر قالب (quick reply) → button.payload
        const rawPayload =
          msg.button?.payload ??
          msg.interactive?.button_reply?.id ??
          msg.interactive?.list_reply?.id ??
          '';

        const parsed = rawPayload ? parseButtonPayload(rawPayload) : null;
        if (parsed) {
          replies.push({
            from, messageId, kind: parsed.kind,
            buttonPayload: rawPayload, seats: parsed.seats,
          });
          continue;
        }

        // احتياطي: نص الزر أو رسالة حرّة
        const text = (msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.text?.body ?? '').trim();
        if (text) {
          replies.push({ from, messageId, kind: classifyText(text), text });
        }
      }
    }
  }
  return replies;
}

/**
 * تطبيع النص العربي قبل المطابقة: إزالة التشكيل والتطويل،
 * وتوحيد الهمزات (أ إ آ → ا) والتاء المربوطة والألف المقصورة.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const AR = 'ء-ي';

/**
 * مطابقة كلمة كاملة تعمل مع العربية.
 * `\b` في JS مبنيّ على [A-Za-z0-9_] فقط، فلا يصلح حداً للكلمة العربية.
 */
function word(w: string): RegExp {
  return new RegExp(`(?:^|[^${AR}a-z0-9])${w}(?:$|[^${AR}a-z0-9])`, 'i');
}

/** اعتذار صريح — يُفحص أولاً لأن «لن أحضر» تحوي كلمة «أحضر». */
const STRONG_DECLINE = [
  /اعتذر/, /اعتذار/, /معتذر/,
  word('لن احضر'), word('ما احضر'), word('ما اقدر'), word('لا اقدر'),
  word('لا استطيع'), word('ما راح احضر'),
  /can'?t/i, /won'?t/i, /not attend/i,
];

const ACCEPT = [
  word('تاكيد'), /اؤكد/, word('احضر'), /ساحضر/, /بحضر/, word('حاضر'),
  word('نعم'), word('اكيد'), word('ابشر'), word('موجود'), word('ان شاء الله'),
  /confirm/i, word('yes'), /accept/i, /attend/i,
];

/** اعتذار ضعيف — كلمات قصيرة تُفحص أخيراً. */
const WEAK_DECLINE = [word('لا'), word('no'), word('sorry'), word('nope')];

/** تصنيف رسالة حرّة: تأكيد أم اعتذار أم نص عادي. */
export function classifyText(raw: string): 'accept' | 'decline' | 'text' {
  const text = normalizeArabic(raw);
  if (STRONG_DECLINE.some((re) => re.test(text))) return 'decline';
  if (ACCEPT.some((re) => re.test(text))) return 'accept';
  if (WEAK_DECLINE.some((re) => re.test(text))) return 'decline';
  return 'text';
}
