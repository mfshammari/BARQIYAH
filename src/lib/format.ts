/** أدوات تنسيق عربية موحّدة. */

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('ar-SA').format(n ?? 0);
}

export function formatCurrency(n: number | null | undefined): string {
  return `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(n ?? 0)} ر.س`;
}

/**
 * توحيد رقم الجوال إلى صيغة E.164 بدون علامة + (كما تطلبها Meta).
 * 05xxxxxxxx → 9665xxxxxxxx | +9665… → 9665… | يترك الأرقام الدولية كما هي.
 */
export function normalizePhone(raw: string, defaultCountry = '966'): string {
  let p = (raw || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d+]/g, '');

  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = defaultCountry + p.slice(1);
  else if (p.length === 9 && p.startsWith('5')) p = defaultCountry + p;
  return p;
}

export function isValidPhone(raw: string): boolean {
  const p = normalizePhone(raw);
  return /^\d{10,15}$/.test(p);
}

/* ============================================================
   التاريخ الهجري والوقت (SPEC §3, §6)
   مواعيد الأعراس تُحدَّد هجرياً وتُعرض للضيوف باليوم والتاريخ.
   ============================================================ */

/** التاريخ الهجري بتقويم أم القرى: «٢٦ شوال ١٤٤٨ هـ» */
export function formatHijri(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

/** اسم اليوم: «الجمعة» */
export function formatWeekday(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { weekday: 'long' }).format(d);
}

/** الوقت من صيغة HH:MM إلى «٠٩:٠٠ مساءً» */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return value;
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
}

export interface EventDateParts {
  dateGregorian?: string | null;
  dateHijri?: string | null;
  weekday?: string | null;
  time?: string | null;
  venue?: string | null;
}

/**
 * سطر الموعد والمكان كما يصل المدعو — يُحقن في متغيّر {{3}} من القالب.
 * مصدره حقول المناسبة وحدها: الداعي لا يحرّره (SPEC §6).
 * مثال: «الجمعة ٢٦ شوال ١٤٤٨ هـ · قصر ٣٣ · ٠٩:٠٠ مساءً»
 */
export function formatEventLine(parts: EventDateParts): string {
  const weekday = parts.weekday || formatWeekday(parts.dateGregorian);
  const hijri = parts.dateHijri || formatHijri(parts.dateGregorian);
  const time = formatTime(parts.time);

  const day = [weekday, hijri].filter(Boolean).join(' ');
  return [day, parts.venue, time].filter(Boolean).join(' · ');
}
