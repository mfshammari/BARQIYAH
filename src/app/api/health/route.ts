import { NextResponse } from 'next/server';
import { env, supabaseConfigured, metaConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { adminClientAvailable } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** يحذف أي رابط أو سلسلة طويلة قد تكون مفتاحاً من رسائل الخطأ. */
function sanitize(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')
    .slice(0, 200);
}

/**
 * فحص صحة الإعداد — يجيب على سؤال واحد: هل التطبيق موصول بقاعدة البيانات فعلاً؟
 * لا يكتفي بوجود المفاتيح، بل ينفّذ استعلاماً حقيقياً.
 * لا يكشف أي قيمة سرّية — حالات منطقية فقط.
 */
export async function GET() {
  const config = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.supabaseUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(env.supabaseAnonKey),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.supabaseServiceKey),
    APP_URL: Boolean(process.env.APP_URL),
  };

  let database: {
    connected: boolean;
    schema_ready: boolean;
    reason?: string;
    detail?: string;
  } = { connected: false, schema_ready: false, reason: 'MISSING_KEYS' };

  if (supabaseConfigured) {
    try {
      const supabase = await createClient();
      // جدول packages مقروء لأي مستخدم مصادَق، ووجوده يثبت تطبيق المخطط.
      // الاستعلام ينجح ويعيد 0 صفوف للزائر — المهم أن الاتصال يتم بلا خطأ.
      const { error } = await supabase.from('packages').select('id', { head: true, count: 'exact' });

      if (!error) {
        database = { connected: true, schema_ready: true };
      } else if (error.code === '42P01') {
        database = {
          connected: true,
          schema_ready: false,
          reason: 'SCHEMA_MISSING',
          detail: 'الاتصال ناجح لكن الجداول غير موجودة — شغّل supabase/setup.sql',
        };
      } else {
        database = {
          connected: false,
          schema_ready: false,
          reason: error.code || 'UNREACHABLE',
          detail: sanitize(error.message ?? ''),
        };
      }
    } catch (err) {
      database = {
        connected: false,
        schema_ready: false,
        reason: 'UNREACHABLE',
        detail: sanitize(err instanceof Error ? err.message : 'خطأ غير متوقع'),
      };
    }
  }

  const ok = database.connected && database.schema_ready && adminClientAvailable;

  // تشخيص الأسماء عند نقص الإعداد فقط: يكشف الأخطاء الإملائية في أسماء
  // المتغيّرات (السبب الأشيع). أسماء فقط — لا تُعرض أي قيمة إطلاقاً.
  const expected = new Set([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_URL',
  ]);
  /**
   * تقنيع القيم السرّية: طول ومقدّمة قصيرة فقط، ورصد المسافات الزائدة
   * (سطر جديد في آخر القيمة سبب شائع لا يُرى بالعين في لوحة Vercel).
   */
  const mask = (value: string | undefined) => {
    if (!value) return null;
    return {
      length: value.length,
      prefix: `${value.slice(0, 4)}…`,
      has_whitespace: value !== value.trim(),
    };
  };

  // رابط المشروع علني بطبيعته — يُدمج في كود المتصفح لكل زائر — فعرضه
  // هنا لا يكشف شيئاً، ويُنهي التخمين عند الأخطاء الإملائية في القيمة.
  const values = ok
    ? undefined
    : {
        NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl || null,
        NEXT_PUBLIC_SUPABASE_URL_has_whitespace: env.supabaseUrl !== env.supabaseUrl.trim(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(env.supabaseAnonKey),
        SUPABASE_SERVICE_ROLE_KEY: mask(env.supabaseServiceKey),
        APP_URL: process.env.APP_URL || null,
      };

  const found_names = ok
    ? undefined
    : Object.keys(process.env)
        .filter((k) => /SUPABASE|^NEXT_PUBLIC_|^APP_URL$/i.test(k))
        .sort()
        .map((k) => (expected.has(k) ? k : `${k}  ← اسم غير متوقَّع`));

  return NextResponse.json(
    {
      ok,
      database,
      config,
      values,
      found_names,
      whatsapp: metaConfigured ? 'meta' : 'mock',
      checked_at: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
