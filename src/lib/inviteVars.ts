/**
 * القالب الموحّد ومتغيّراته والتحقق منها.
 *
 * قالب واتساب **واحد** للمنصة كلها (قرار محسوم):
 *   تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}
 *   {{1}} و{{2}} يكتبهما المالك والداعي كلٌّ لنفسه
 *   {{3}} يُحقن آلياً من بيانات المناسبة ولا يحرّره أحد
 *
 * Meta ترفض متغيّرات فيها روابط أو أسطر جديدة أو مسافات متتالية،
 * والرفض المتكرر يضرّ تقييم الرقم المشترك — فالتحقق هنا إلزامي قبل الحفظ.
 */

export const MAX_VAR_LENGTH = 60;

/** نص القالب الموحّد حرفاً بحرف كما اعتُمد لدى Meta. */
export const UNIFIED_TEMPLATE_BODY = 'تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}';

/** اسم القالب في Meta افتراضياً (يحرّره الأدمن من /admin/templates). */
export const DEFAULT_META_TEMPLATE_NAME = 'barqiyah_invite';

export interface InviteVars {
  /** {{1}} — الجهة الداعية كما يكتبها: «أم عبدالله الفالح» */
  host: string;
  /** {{2}} — المناسبة وصلته بها: «زواج ابني محمد» */
  occasion: string;
}

export interface VarIssue {
  field: keyof InviteVars;
  message: string;
}

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|sa|io|co)\b)/i;
/** رموز تكسر عرض القالب أو ترفضها Meta */
const FORBIDDEN_RE = /[<>{}\\|~^`]/;

function checkOne(field: keyof InviteVars, label: string, value: string): VarIssue[] {
  const issues: VarIssue[] = [];
  const v = value ?? '';

  if (!v.trim()) {
    issues.push({ field, message: `${label} مطلوب.` });
    return issues;   // بقية الفحوص بلا معنى على قيمة فارغة
  }
  if (v.length > MAX_VAR_LENGTH) {
    issues.push({ field, message: `${label} أطول من ${MAX_VAR_LENGTH} حرفاً.` });
  }
  if (/[\n\r\t]/.test(v)) {
    issues.push({ field, message: `${label}: لا يُسمح بأسطر جديدة — واتساب يرفض القالب.` });
  }
  if (/ {2,}/.test(v)) {
    issues.push({ field, message: `${label}: لا يُسمح بمسافات متتالية.` });
  }
  if (v !== v.trim()) {
    issues.push({ field, message: `${label}: احذف المسافات في البداية أو النهاية.` });
  }
  if (URL_RE.test(v)) {
    issues.push({ field, message: `${label}: لا يُسمح بالروابط في متغيّرات القالب.` });
  }
  if (FORBIDDEN_RE.test(v)) {
    issues.push({ field, message: `${label}: يحتوي رموزاً غير مدعومة.` });
  }
  return issues;
}

/** يتحقق من المتغيّرات قبل الحفظ. قائمة فارغة = صالحة. */
export function validateInviteVars(vars: Partial<InviteVars>): VarIssue[] {
  return [
    ...checkOne('host', 'اسم الداعي', vars.host ?? ''),
    ...checkOne('occasion', 'وصف المناسبة', vars.occasion ?? ''),
  ];
}

/** هل كُتب المتغيّران؟ بدونهما لا يُرسل المالك ولا الداعي. */
export function hasInviteVars(vars: Partial<InviteVars> | null | undefined): vars is InviteVars {
  return Boolean(vars?.host?.trim() && vars?.occasion?.trim());
}

/** يملأ {{n}} في نص القالب بالقيم بالترتيب — كما تفعل Meta. */
export function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');
}

/**
 * متغيّرات القالب الثلاثة كما تُرسل: [{{1}}, {{2}}, {{3}}].
 * واحدة للمالك والداعي والمحاكاة وMeta — دائماً ثلاثة.
 */
export function buildInviteParams(vars: InviteVars, eventLine: string): [string, string, string] {
  return [vars.host.trim(), vars.occasion.trim(), eventLine];
}

/** نص الدعوة كما يصل المدعو — للمعاينة الحيّة وللإرسال، من القالب الموحّد حرفاً بحرف. */
export function renderInvite(vars: Partial<InviteVars>, eventLine: string): string {
  const host = vars.host?.trim() || '…';
  const occasion = vars.occasion?.trim() || '…';
  return fillTemplate(UNIFIED_TEMPLATE_BODY, [host, occasion, eventLine]);
}

/** قيمة {{2}} الابتدائية للمالك: «زواج محمد وعريب» من نوع المناسبة وأصحابها. */
export function defaultOccasionText(occasionLabel: string, celebrants: (string | null | undefined)[]): string {
  const names = celebrants.map((c) => c?.trim()).filter(Boolean).join(' و');
  return [occasionLabel, names].filter(Boolean).join(' ').replace(/ {2,}/g, ' ').trim();
}
