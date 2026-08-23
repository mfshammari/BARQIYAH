import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutParams, CheckoutResult, PaymentProvider } from './index';

const API = 'https://api.moyasar.com/v1';

/**
 * بوابة Moyasar. المبالغ عندها بالهللات (أصغر وحدة) — لا بالريالات.
 */
export class MoyasarPaymentProvider implements PaymentProvider {
  id = 'moyasar' as const;
  label = 'الدفع الإلكتروني (Moyasar)';

  constructor(private secretKey: string) {}

  private auth(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    try {
      const res = await fetch(`${API}/invoices`, {
        method: 'POST',
        headers: { Authorization: this.auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100),   // هللات
          currency: 'SAR',
          description: params.description,
          callback_url: params.callbackUrl,
          // يعود إلينا في الـwebhook فنعرف أي عملية سُدّدت
          metadata: { transaction_id: params.transactionId, event_id: params.eventId },
        }),
      });

      const json = (await res.json()) as { id?: string; url?: string; message?: string };
      if (!res.ok || !json.url) {
        return { ok: false, error: json.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, redirectUrl: json.url, reference: json.id };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'تعذّر الاتصال ببوابة الدفع',
      };
    }
  }

  async verify(reference: string): Promise<{ ok: boolean; paid: boolean; error?: string }> {
    try {
      const res = await fetch(`${API}/invoices/${reference}`, { headers: { Authorization: this.auth() } });
      const json = (await res.json()) as { status?: string; message?: string };
      if (!res.ok) return { ok: false, paid: false, error: json.message ?? `HTTP ${res.status}` };
      return { ok: true, paid: json.status === 'paid' };
    } catch (err) {
      return { ok: false, paid: false, error: err instanceof Error ? err.message : 'خطأ' };
    }
  }
}

/**
 * التحقق من توقيع الـwebhook (SPEC §5).
 * بلا هذا التحقق يستطيع أي طرف تفعيل مناسبة مجاناً بطلب مزوَّر.
 * المقارنة ثابتة الزمن لتفادي تسريب التوقيع عبر قياس زمن الرد.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const given = signature.trim().replace(/^sha256=/i, '');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
