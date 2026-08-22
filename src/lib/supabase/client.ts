'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/** عميل Supabase في المتصفح (للعمليات الحية والاشتراكات). */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
