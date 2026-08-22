import { env, metaConfigured } from '@/lib/env';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { MockWhatsAppProvider } from './mock';
import { MetaWhatsAppProvider } from './meta';
import type { InboundReply, WhatsAppProvider } from './types';

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

/** payload أزرار الرد السريع: يحمل نوع الرد وتوكن الدعوة. */
export function buildButtonPayloads(inviteToken: string) {
  return {
    accept: `ACCEPT:${inviteToken}`,
    decline: `DECLINE:${inviteToken}`,
  };
}

export function parseButtonPayload(payload: string): { kind: 'accept' | 'decline'; token: string } | null {
  const m = /^(ACCEPT|DECLINE):([0-9a-f-]{36})$/i.exec(payload.trim());
  if (!m) return null;
  return { kind: m[1].toUpperCase() === 'ACCEPT' ? 'accept' : 'decline', token: m[2] };
}

/** استخراج ردود الأزرار من جسم webhook الوارد من Meta. */
export function parseWebhookPayload(body: unknown): InboundReply[] {
  const replies: InboundReply[] = [];
  const root = body as {
    entry?: {
      changes?: {
        value?: {
          messages?: {
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            button?: { payload?: string; text?: string };
            interactive?: {
              type?: string;
              button_reply?: { id?: string; title?: string };
              list_reply?: { id?: string; title?: string };
            };
          }[];
        };
      }[];
    }[];
  };

  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const from = msg.from ?? '';
        const messageId = msg.id ?? '';
        if (!from) continue;

        // زر قالب (quick reply) → button.payload
        const rawPayload =
          msg.button?.payload ??
          msg.interactive?.button_reply?.id ??
          msg.interactive?.list_reply?.id ??
          '';

        const parsed = rawPayload ? parseButtonPayload(rawPayload) : null;
        if (parsed) {
          replies.push({ from, messageId, kind: parsed.kind, buttonPayload: rawPayload });
          continue;
        }

        // احتياطي: نص الزر أو رسالة حرّة
        const text = (msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.text?.body ?? '').trim();
        if (text) {
          const lowered = text.toLowerCase();
          const isAccept = /تأكيد|أؤكد|احضر|سأحضر|نعم|confirm|yes|accept/.test(lowered);
          const isDecline = /اعتذار|اعتذر|لن أحضر|لا أستطيع|لا|decline|no|sorry/.test(lowered);
          replies.push({
            from, messageId,
            kind: isAccept ? 'accept' : isDecline ? 'decline' : 'text',
            text,
          });
        }
      }
    }
  }
  return replies;
}
