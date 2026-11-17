import { env, metaConfigured } from '@/lib/env';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { MockWhatsAppProvider } from './mock';
import { MetaWhatsAppProvider } from './meta';
import type { WhatsAppProvider } from './types';

export * from './types';

/**
 * يبني مزوّد واتساب:
 *  - مفاتيح Meta موجودة (بيئة أو جدول integration_settings) → الوضع الحقيقي
 *  - غير موجودة → وضع المحاكاة، فلا يتوقف البناء والاختبار
 */
export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  if (metaConfigured) {
    return new MetaWhatsAppProvider({
      phoneNumberId: env.metaPhoneNumberId,
      accessToken: env.metaAccessToken,
    });
  }

  // احتياطياً: مفاتيح مخزّنة من لوحة الأدمن
  if (adminClientAvailable) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('integration_settings')
        .select('phone_number_id, access_token')
        .limit(1)
        .maybeSingle();
      if (data?.phone_number_id && data?.access_token) {
        return new MetaWhatsAppProvider({
          phoneNumberId: data.phone_number_id,
          accessToken: data.access_token,
        });
      }
    } catch {
      // نتجاهل ونكمل بوضع المحاكاة
    }
  }

  return new MockWhatsAppProvider();
}

/**
 * هل يُسمح بالإرسال من المنصة (القالب، الإرسال الجماعي، التذكير)؟
 *
 * بلا ربط حقيقي مع Meta يعود المزوّد إلى المحاكاة، وهي تُرجع «نجاحاً» بلا رسالة:
 * على الإنتاج كانت تحوّل المدعوين إلى «أُرسلت» وتحجز مقاعدهم ولم يصلهم شيء.
 * فالإرسال من المنصة على الإنتاج يتطلّب ربطاً حقيقياً؛ المحاكاة تبقى للتطوير،
 * أو صراحةً بـ ALLOW_MOCK_SEND=1. الإرسال اليدوي (زر واتساب) لا يمرّ من هنا.
 */
export async function platformSendAvailable(): Promise<boolean> {
  const provider = await getWhatsAppProvider();
  if (provider.mode !== 'mock') return true;
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_SEND === '1';
}

/** توكن التحقق لـ webhook: من البيئة أولاً ثم من إعدادات الأدمن. */
export async function getWebhookVerifyToken(): Promise<string> {
  if (env.metaVerifyToken) return env.metaVerifyToken;
  if (adminClientAvailable) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('integration_settings')
        .select('verify_token')
        .limit(1)
        .maybeSingle();
      if (data?.verify_token) return data.verify_token;
    } catch {
      /* تجاهل */
    }
  }
  return '';
}

/** اسم قالب التذكير المعتمد: من إعدادات الأدمن وإلا الافتراضي. */
export const DEFAULT_REMINDER_TEMPLATE = 'barqiyah_reminder';

export async function getReminderTemplateName(): Promise<string> {
  if (adminClientAvailable) {
    try {
      const { data } = await createAdminClient()
        .from('integration_settings').select('reminder_template').limit(1).maybeSingle();
      if (data?.reminder_template) return data.reminder_template;
    } catch { /* تجاهل */ }
  }
  return DEFAULT_REMINDER_TEMPLATE;
}

export * from './parse';
