import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * عميل service role — يتجاوز RLS.
 * يُستخدم فقط في المسارات التي لا يملك فيها الطرف حساباً:
 * صفحات RSVP العامة، صفحة الباركود، وWebhook واتساب، وإنشاء حسابات الماسحين.
 * لا يُستورد أبداً في كود العميل.
 */
export function createAdminClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط — العمليات الإدارية معطّلة.');
  }
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const adminClientAvailable = Boolean(env.supabaseUrl && env.supabaseServiceKey);
