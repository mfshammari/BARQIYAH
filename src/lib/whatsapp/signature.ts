import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * توقيع webhook واتساب: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw, APP_SECRET).
 * المقارنة ثابتة الزمن. بلا توقيع أو بسرّ فارغ → مرفوض.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !header) return false;
  const given = header.trim();
  if (!/^sha256=[0-9a-f]{64}$/i.test(given)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected.toLowerCase(), 'utf8');
  const b = Buffer.from(given.slice('sha256='.length).toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** يبني الترويسة كما ترسلها Meta — للاختبار والمحاكاة. */
export function signMetaPayload(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * هل يُقبل طلب بلا توقيع؟ فقط في وضع المحاكاة (لا META_APP_SECRET) وخارج الإنتاج.
 */
export function allowUnsignedWebhook(appSecret: string, nodeEnv: string | undefined): boolean {
  return !appSecret && nodeEnv !== 'production';
}
