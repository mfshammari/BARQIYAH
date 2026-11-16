/**
 * بناء رسالة واتساب ورابط click-to-chat — منطق خالص بلا شبكة ولا React
 * ليُختبر في Node مباشرة (tests/manual-whatsapp.test.mjs).
 */
import type { EventInfo, Guest, GuestStatus, MessageTemplate, SignBy } from './types';

/** متغيّرات القالب كما تظهر للمستخدم في رقائق المحرّر. */
export const TEMPLATE_VARIABLES = [
  '{الاسم}', '{المناسبة}', '{الداعي}', '{التاريخ}', '{المكان}', '{التوقيع}', '{الرابط}',
] as const;

export const LINK_VAR = '{الرابط}';

/** القوالب الثلاثة الافتراضية — نبرة هادئة وتبدأ دائماً بالسلام الكامل. */
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'formal',
    name: 'رسمي',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'المكرّم {الاسم}',
      'يسرّنا دعوتكم لحضور {المناسبة}',
      '{التاريخ}، {المكان}',
      '',
      'تفاصيل الدعوة وتأكيد الحضور:',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
  {
    id: 'friendly',
    name: 'ودّي',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'حيّاك الله {الاسم}',
      'يسعدنا حضورك {المناسبة}، {التاريخ}.',
      '',
      'التفاصيل وتأكيد الحضور:',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
  {
    id: 'brief',
    name: 'مختصر',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'المكرّم {الاسم}، يسرّنا دعوتكم لحضور {المناسبة}.',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
];

export function defaultTemplateText(id: string): string {
  return DEFAULT_TEMPLATES.find((t) => t.id === id)?.text ?? DEFAULT_TEMPLATES[0].text;
}

/**
 * أسماء الدعاة المختارة — بترتيب ثابت: صاحب المناسبة ثم الداعي الفرعي.
 * بلا داعٍ فرعي تعود الدعوة إلى صاحب المناسبة وحده أياً كان الاختيار.
 */
export function resolveInviterNames(event: EventInfo, signBy: SignBy): string[] {
  const sub = event.subInviterName?.trim() || null;
  if (!sub || signBy === 'owner') return [event.ownerName];
  if (signBy === 'sub') return [sub];
  return [event.ownerName, sub];
}

/** «A وB» — واو العطف تلتصق بالاسم الثاني كما في الكتابة العربية. */
export function joinNames(names: string[]): string {
  return names.join(' و');
}

/** «الداعي: A» أو «الداعيان: A وB» */
export function resolveSignature(event: EventInfo, signBy: SignBy): string {
  const names = resolveInviterNames(event, signBy);
  return names.length > 1 ? `الداعيان: ${joinNames(names)}` : `الداعي: ${names[0]}`;
}

/** يضمن أن النص يحوي {الرابط}؛ إن حُذف يُضاف سطراً أخيراً. */
export function ensureLinkVariable(text: string): string {
  if (text.includes(LINK_VAR)) return text;
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n${LINK_VAR}` : LINK_VAR;
}

/**
 * يملأ القالب بقيم المدعو والمناسبة. كل رسالة تحمل رابط المدعو الخاص:
 * إن غاب {الرابط} من النص أُضيف تلقائياً في آخر الرسالة.
 */
export function buildMessage(
  tpl: string,
  guest: Guest,
  event: EventInfo,
  signBy: SignBy,
  link: string,
): string {
  const vars: Record<string, string> = {
    '{الاسم}': guest.name,
    '{المناسبة}': event.occasion,
    '{الداعي}': joinNames(resolveInviterNames(event, signBy)),
    '{التاريخ}': event.dateText,
    '{المكان}': event.venue,
    '{التوقيع}': resolveSignature(event, signBy),
    [LINK_VAR]: link,
  };
  return ensureLinkVariable(tpl).replace(
    /\{(الاسم|المناسبة|الداعي|التاريخ|المكان|التوقيع|الرابط)\}/g,
    (m) => vars[m] ?? m,
  );
}

/** أرقام E.164 بلا علامة + كما يطلبها wa.me (٨ إلى ١٥ رقماً، لا يبدأ بصفر). */
export function e164Digits(phoneE164: string): string | null {
  const digits = (phoneE164 || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function isValidE164(phoneE164: string): boolean {
  return e164Digits(phoneE164) !== null;
}

/** رابط click-to-chat: https://wa.me/{digits}?text={encodeURIComponent(message)} */
export function buildWhatsAppUrl(phoneE164: string, message: string): string {
  const digits = e164Digits(phoneE164);
  if (!digits) throw new Error('رقم غير صحيح');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** رابط المدعو الخاص: {base}/i/{token} */
export function guestLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/i/${encodeURIComponent(token)}`;
}

/* ============================================================
   رصيد المقاعد
   متاح = مقاعد الباقة − المحجوز (بانتظار + فتح الدعوة) − الحضور المؤكّد
   ============================================================ */

export interface SeatBalance {
  packageSeats: number;
  reserved: number;
  confirmed: number;
  available: number;
  invited: number;
  sent: number;
  confirmedCount: number;
  declinedCount: number;
}

const RESERVING: GuestStatus[] = ['pending', 'opened'];
const CONFIRMING: GuestStatus[] = ['confirmed', 'attended'];

export function computeSeatBalance(guests: Guest[], packageSeats: number): SeatBalance {
  const reserved = guests
    .filter((g) => RESERVING.includes(g.status))
    .reduce((s, g) => s + g.maxSeats, 0);
  const confirmed = guests
    .filter((g) => CONFIRMING.includes(g.status))
    .reduce((s, g) => s + g.attendees, 0);
  return {
    packageSeats,
    reserved,
    confirmed,
    available: packageSeats - reserved - confirmed,
    invited: guests.length,
    sent: guests.filter((g) => g.status !== 'draft').length,
    confirmedCount: guests.filter((g) => CONFIRMING.includes(g.status)).length,
    declinedCount: guests.filter((g) => g.status === 'declined').length,
  };
}

/* ============================================================
   الرمز الخاص — ٨ محارف فأكثر من مصدر عشوائي آمن
   ============================================================ */

const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateToken(length = 12): string {
  // أعلى مضاعف للأبجدية دون ٢٥٦ — نرفض ما فوقه لتوزيع متساوٍ بلا انحياز
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const TOKEN_RE = /^[A-Za-z0-9]{8,}$/;
