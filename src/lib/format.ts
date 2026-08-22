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
