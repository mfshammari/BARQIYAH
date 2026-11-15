'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/exemptions/logic';
import { describeExemptionError } from '@/lib/exemptions/server';
import type { ExemptionReason } from '@/lib/exemptions/types';

export interface ExemptionActionResult { ok: boolean; error?: string }

/**
 * إجراءات الإعفاء من الدفع. التحقق الحاسم في القاعدة (is_super_admin داخل
 * الدوال)؛ الفحص هنا مجرّد رسالة أوضح قبل الاستدعاء.
 */
async function superAdminClient() {
  const user = await requireAdmin();
  if (!isSuperAdmin(user.profile.role)) {
    return { supabase: null, error: 'الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط.' };
  }
  return { supabase: await createClient(), error: null };
}

function done(): ExemptionActionResult {
  revalidatePath('/admin/clients');
  revalidatePath('/admin/clients/[id]', 'page');
  return { ok: true };
}

export async function grantExemptionAction(
  accountId: string,
  input: { cap: number; reason: ExemptionReason; note?: string; expiresAt?: string },
): Promise<ExemptionActionResult> {
  const { supabase, error } = await superAdminClient();
  if (!supabase) return { ok: false, error: error ?? undefined };

  const { error: rpcError } = await supabase.rpc('grant_exemption', {
    p_account_id: accountId,
    p_cap: Math.floor(Number(input.cap)),
    p_reason: input.reason,
    p_note: input.note?.trim() || null,
    p_expires_at: input.expiresAt || null,
  });
  if (rpcError) return { ok: false, error: describeExemptionError(rpcError.message) };
  return done();
}

export async function updateExemptionCapAction(accountId: string, cap: number): Promise<ExemptionActionResult> {
  const { supabase, error } = await superAdminClient();
  if (!supabase) return { ok: false, error: error ?? undefined };

  const { error: rpcError } = await supabase.rpc('update_exemption_cap', {
    p_account_id: accountId, p_cap: Math.floor(Number(cap)),
  });
  if (rpcError) return { ok: false, error: describeExemptionError(rpcError.message) };
  return done();
}

export async function revokeExemptionAction(accountId: string): Promise<ExemptionActionResult> {
  const { supabase, error } = await superAdminClient();
  if (!supabase) return { ok: false, error: error ?? undefined };

  const { error: rpcError } = await supabase.rpc('revoke_exemption', { p_account_id: accountId });
  if (rpcError) return { ok: false, error: describeExemptionError(rpcError.message) };
  return done();
}
