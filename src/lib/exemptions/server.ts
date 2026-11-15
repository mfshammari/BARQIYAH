import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExemptionLogRow, PaymentExemptionRow } from '@/lib/types';
import { exemptionStatus } from './logic';
import type { CanSendResult, Exemption, ExemptionLogEntry, SendBlockReason } from './types';

/**
 * طبقة Supabase للإعفاء — تقرأ الجداول وتستدعي الدوال التي تطبّق القواعد
 * على الخادم. لا منطق هنا يُوثق به وحده؛ القاعدة في 0021_payment_exemptions.sql.
 */

export function toExemption(row: PaymentExemptionRow): Exemption {
  return {
    accountId: row.account_id,
    cap: row.cap,
    used: row.used,
    reason: row.reason,
    note: row.note,
    expiresAt: row.expires_at,
    grantedBy: row.granted_by ?? '',
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
  };
}

export function toLogEntry(row: ExemptionLogRow): ExemptionLogEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    action: row.action,
    cap: row.cap,
    reason: row.reason,
    adminId: row.admin_id ?? 'system',
    at: row.at,
  };
}

/** إعفاء حساب واحد (أو null). RLS تسمح لصاحب الحساب والأدمن. */
export async function fetchExemption(supabase: SupabaseClient, accountId: string): Promise<Exemption | null> {
  const { data } = await supabase
    .from('payment_exemptions').select('*').eq('account_id', accountId)
    .maybeSingle<PaymentExemptionRow>();
  return data ? toExemption(data) : null;
}

/** إعفاء يسمح بالتفعيل والإرسال الآن */
export async function hasActiveExemption(supabase: SupabaseClient, accountId: string): Promise<boolean> {
  const ex = await fetchExemption(supabase, accountId);
  return Boolean(ex) && exemptionStatus(ex as Exemption) === 'active';
}

/** كل الإعفاءات مفهرسة بالحساب — للوحة الأدمن */
export async function fetchAllExemptions(supabase: SupabaseClient): Promise<Record<string, Exemption>> {
  const { data } = await supabase.from('payment_exemptions').select('*').returns<PaymentExemptionRow[]>();
  const out: Record<string, Exemption> = {};
  for (const row of data ?? []) out[row.account_id] = toExemption(row);
  return out;
}

/** سجل الإعفاءات — الأحدث أولاً (الأدمن وحده بحكم RLS) */
export async function fetchExemptionLog(supabase: SupabaseClient, accountId?: string): Promise<ExemptionLogEntry[]> {
  let q = supabase.from('exemption_log').select('*').order('at', { ascending: false }).limit(300);
  if (accountId) q = q.eq('account_id', accountId);
  const { data } = await q.returns<ExemptionLogRow[]>();
  return (data ?? []).map(toLogEntry);
}

/** فحص الإرسال على الخادم (للعرض؛ الحجز الفعلي داخل reserve_*) */
export async function canSendViaExemption(
  supabase: SupabaseClient,
  accountId: string,
  eventId: string,
  count: number,
): Promise<CanSendResult> {
  const { data, error } = await supabase.rpc('exemption_can_send', {
    p_account_id: accountId, p_event_id: eventId, p_count: count,
  });
  if (error || !data) return { ok: false, reason: 'no_package' };
  const r = data as { ok: boolean; reason?: SendBlockReason };
  return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'no_package' };
}

/** أخطاء الدوال → نصّ عربي */
export const EXEMPTION_ERRORS: Record<string, string> = {
  FORBIDDEN: 'الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط.',
  INVALID_CAP: 'عدد الدعوات المجانية رقم صحيح لا يقل عن ١.',
  INVALID_REASON: 'اختر السبب من القائمة.',
  INVALID_EXPIRY: 'تاريخ الانتهاء يجب أن يكون في المستقبل.',
  ACCOUNT_NOT_FOUND: 'الحساب غير موجود.',
  ALREADY_EXEMPT: 'الحساب معفى بالفعل — عدّل السقف بدل منح إعفاء جديد.',
  NOT_EXEMPT: 'لا إعفاء نشطًا لهذا الحساب.',
  CAP_BELOW_USED: 'لا يمكن أن يقلّ السقف عن المستخدم.',
};

export function describeExemptionError(message: string | undefined): string {
  for (const [code, text] of Object.entries(EXEMPTION_ERRORS)) {
    if (message?.includes(code)) return text;
  }
  return 'تعذّر تنفيذ الإجراء. حاول مرة أخرى.';
}
