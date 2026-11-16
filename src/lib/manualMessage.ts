/**
 * نصّ رسالة واتساب اليدوية — قوالب ثلاثة ومتغيّرات وتوقيع. منطق خالص بلا
 * شبكة ولا React ليُختبر في Node (tests/manual-message.test.mjs).
 *
 * الحل المؤقّت إلى أن يكتمل ربط WhatsApp Cloud API: الداعي يرسل كل دعوة من
 * واتساب جواله برابط click-to-chat، وكل رسالة تحمل رابط المدعو /rsvp/{token}.
 * النصّ يُحفظ لكل مناسبة (events.manual_message) ولكل داعٍ
 * (inviters.manual_message) — النصوص المعدَّلة فقط، والباقي من الافتراضي.
 */

export const TEMPLATE_IDS = ['formal', 'friendly', 'brief'] as const;
export type MessageTemplateId = (typeof TEMPLATE_IDS)[number];

/** المتغيّرات كما تظهر في رقائق المحرّر. */
export const TEMPLATE_VARIABLES = ['{الاسم}', '{المناسبة}', '{التاريخ}', '{المكان}', '{الرابط}', '{التوقيع}'] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export const LINK_VAR: TemplateVariable = '{الرابط}';

/** حدّ طول النصّ — رابط wa.me يحمل الرسالة كاملة في العنوان. */
export const MAX_TEMPLATE_CHARS = 1200;

/** القوالب الثلاثة الافتراضية — نبرة هادئة وتبدأ دائماً بالسلام الكامل. */
export const DEFAULT_TEMPLATES: Record<MessageTemplateId, { name: string; text: string }> = {
  formal: {
    name: 'رسمي',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'المكرّم {الاسم}',
      'يسرّنا دعوتكم لحضور {المناسبة}',
      '{التاريخ}',
      '{المكان}',
      '',
      'تفاصيل الدعوة وتأكيد الحضور:',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
  friendly: {
    name: 'ودّي',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'حيّاك الله {الاسم}',
      'يسعدنا حضورك {المناسبة}، {التاريخ}.',
      '{المكان}',
      '',
      'التفاصيل وتأكيد الحضور:',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
  brief: {
    name: 'مختصر',
    text: [
      'السلام عليكم ورحمة الله وبركاته',
      'المكرّم {الاسم}، يسرّنا دعوتكم لحضور {المناسبة}.',
      '{الرابط}',
      '',
      '{التوقيع}',
    ].join('\n'),
  },
};

/** ما يُحفظ في العمود manual_message. */
export interface ManualMessageConfig {
  template: MessageTemplateId;
  /** النصوص التي عدّلها المستخدم فقط — ما لم يُعدَّل يُقرأ من الافتراضي */
  texts: Partial<Record<MessageTemplateId, string>>;
}

export const DEFAULT_CONFIG: ManualMessageConfig = { template: 'formal', texts: {} };

export function isTemplateId(v: unknown): v is MessageTemplateId {
  return typeof v === 'string' && (TEMPLATE_IDS as readonly string[]).includes(v);
}

/** يقرأ jsonb القاعدة بأمان — أي قيمة غير صالحة تعود إلى الافتراضي. */
export function parseManualMessage(raw: unknown): ManualMessageConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG, texts: {} };
  const r = raw as Record<string, unknown>;
  const template = isTemplateId(r.template) ? r.template : 'formal';
  const texts: ManualMessageConfig['texts'] = {};
  const rawTexts = (r.texts && typeof r.texts === 'object' ? r.texts : {}) as Record<string, unknown>;
  for (const id of TEMPLATE_IDS) {
    const t = rawTexts[id];
    if (typeof t === 'string' && t.trim() && t !== DEFAULT_TEMPLATES[id].text) texts[id] = t;
  }
  return { template, texts };
}

/** نصّ القالب المختار (أو قالب معيّن) — المعدَّل إن وُجد وإلا الافتراضي. */
export function templateText(config: ManualMessageConfig, id: MessageTemplateId = config.template): string {
  return config.texts[id] ?? DEFAULT_TEMPLATES[id].text;
}

/** يحدّث نصّ قالب في الإعدادات؛ النصّ المطابق للافتراضي يُحذف من المعدَّلات. */
export function withTemplateText(
  config: ManualMessageConfig, id: MessageTemplateId, text: string,
): ManualMessageConfig {
  const texts = { ...config.texts };
  if (text === DEFAULT_TEMPLATES[id].text) delete texts[id]; else texts[id] = text;
  return { ...config, texts };
}

/** تحقّق قبل الحفظ: نصّ غير فارغ وضمن الحدّ. */
export function validateTemplateText(text: string): string | null {
  if (!text.trim()) return 'نصّ الرسالة فارغ.';
  if (text.length > MAX_TEMPLATE_CHARS) return `نصّ الرسالة أطول من ${MAX_TEMPLATE_CHARS} حرفاً.`;
  return null;
}

/** يضمن أن النص يحوي {الرابط}؛ إن حُذف يُضاف سطراً أخيراً. */
export function ensureLinkVariable(text: string): string {
  if (text.includes(LINK_VAR)) return text;
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n${LINK_VAR}` : LINK_VAR;
}

/* ============================================================
   التوقيع
   من حساب صاحب المناسبة تصدر الدعوة باسمه فقط بلا خيار؛ من حساب الداعي
   الفرعي خيار: الاثنين / صاحب المناسبة / الداعي الفرعي. الأسماء من الحسابات.
   ============================================================ */

export const SIGN_BY = ['both', 'owner', 'sub'] as const;
export type SignBy = (typeof SIGN_BY)[number];

export const SIGN_BY_LABELS: Record<SignBy, string> = {
  both: 'الاثنين',
  owner: 'صاحب المناسبة',
  sub: 'الداعي الفرعي',
};

export function parseSignBy(v: unknown, fallback: SignBy = 'both'): SignBy {
  return typeof v === 'string' && (SIGN_BY as readonly string[]).includes(v) ? (v as SignBy) : fallback;
}

export interface SignatureNames {
  /** اسم حساب صاحب المناسبة */
  ownerName: string;
  /** اسم حساب الداعي الفرعي — null من حساب صاحب المناسبة */
  subName?: string | null;
}

/**
 * أسماء الموقّعين بترتيب ثابت: صاحب المناسبة ثم الداعي الفرعي.
 * بلا داعٍ فرعي تعود الدعوة إلى صاحب المناسبة وحده أياً كان الاختيار.
 */
export function resolveSignerNames(names: SignatureNames, signBy: SignBy): string[] {
  const owner = names.ownerName.trim();
  const sub = names.subName?.trim() || null;
  if (!sub || signBy === 'owner') return [owner];
  if (signBy === 'sub') return [sub];
  return [owner, sub];
}

/** «A وB» — واو العطف تلتصق بالاسم الثاني كما في الكتابة العربية. */
export function joinNames(names: string[]): string {
  return names.join(' و');
}

/** «الداعي: A» أو «الداعيان: A وB» */
export function resolveSignature(names: SignatureNames, signBy: SignBy): string {
  const signers = resolveSignerNames(names, signBy);
  return signers.length > 1 ? `الداعيان: ${joinNames(signers)}` : `الداعي: ${signers[0]}`;
}

/* ============================================================
   بناء الرسالة
   ============================================================ */

export interface MessageVars {
  /** {الاسم} */
  guestName: string;
  /** {المناسبة} — وصف المناسبة كما كتبه الداعي */
  occasion: string;
  /** {التاريخ} — اليوم والتاريخ الهجري والوقت */
  date: string;
  /** {المكان} */
  venue: string;
  /** {الرابط} — رابط المدعو الخاص */
  link: string;
  /** {التوقيع} — من resolveSignature */
  signature: string;
}

const VAR_RE = /\{(الاسم|المناسبة|التاريخ|المكان|الرابط|التوقيع)\}/g;

/**
 * يملأ القالب بقيم المدعو والمناسبة. كل رسالة تحمل رابط المدعو الخاص: إن غاب
 * {الرابط} من النص أُضيف تلقائياً آخر الرسالة. السطر الذي يصبح فارغاً بعد
 * التعويض (مكان غير محدّد مثلاً) يُحذف، ولا أسطر فارغة متتالية.
 */
export function buildMessage(template: string, vars: MessageVars): string {
  const values: Record<string, string> = {
    '{الاسم}': vars.guestName.trim(),
    '{المناسبة}': vars.occasion.trim(),
    '{التاريخ}': vars.date.trim(),
    '{المكان}': vars.venue.trim(),
    '{الرابط}': vars.link.trim(),
    '{التوقيع}': vars.signature.trim(),
  };
  const filled = ensureLinkVariable(template).replace(VAR_RE, (m) => values[m] ?? m);
  const lines = filled.split('\n').map((l) => l.replace(/\s+$/, ''));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hadVar = /\{(الاسم|المناسبة|التاريخ|المكان|الرابط|التوقيع)\}/.test(template.split('\n')[i] ?? '');
    // سطر كان متغيّراً وحده وصار فارغاً → يُحذف؛ السطر الفارغ المقصود يبقى واحداً
    if (line === '' && hadVar) continue;
    if (line === '' && (out.at(-1) ?? '') === '') continue;
    out.push(line);
  }
  return out.join('\n').trim();
}
