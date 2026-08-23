/**
 * متغيّرات دعوة الداعي والتحقق منها.
 *
 * قالب واحد معتمد بمتغيّرات — لا قالب لكل داعٍ (SPEC §6):
 *   تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}
 *   {{1}} و{{2}} يكتبهما الداعي بحرية
 *   {{3}} يُحقن آلياً من بيانات المناسبة ولا يحرّره أحد
 *
 * Meta ترفض متغيّرات فيها روابط أو أسطر جديدة أو مسافات متتالية،
 * والرفض المتكرر يضرّ تقييم الرقم المشترك — فالتحقق هنا إلزامي قبل الحفظ.
 */

export const MAX_VAR_LENGTH = 60;

export interface InviteVars {
  /** {{1}} — الجهة الداعية كما يكتبها الداعي: «أم عبدالله الفالح» */
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

/** يتحقق من متغيّرات الداعي قبل الحفظ. قائمة فارغة = صالحة. */
export function validateInviteVars(vars: Partial<InviteVars>): VarIssue[] {
  return [
    ...checkOne('host', 'اسم الداعي', vars.host ?? ''),
    ...checkOne('occasion', 'وصف المناسبة', vars.occasion ?? ''),
  ];
}

/** نص الدعوة كما يصل المدعو — للمعاينة الحيّة وللإرسال. */
export function renderInvite(vars: Partial<InviteVars>, eventLine: string): string {
  const host = vars.host?.trim() || '…';
  const occasion = vars.occasion?.trim() || '…';
  return `تتشرّف ${host} بدعوتكم لحضور ${occasion} — ${eventLine}`;
}
