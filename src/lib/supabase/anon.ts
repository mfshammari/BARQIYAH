import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * عميل anon بلا جلسة — للصفحات العامة التي يقرأها الزائر غير المسجّل
 * (الصفحة الرئيسية تقرأ الباقات). يحترم RLS بصفة anon ولا يلمس الكوكيز.
 */
export function createAnonClient(): SupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
