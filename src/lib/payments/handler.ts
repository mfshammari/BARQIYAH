import 'server-only';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';

/**
 * معالجة حدث دفع — المنطق الوحيد المشترك بين الـwebhook الحقيقي
 * ووضع المحاكاة، فما نختبره في المحاكاة هو ما يعمل في الإنتاج.
 */
export interface PaymentEvent {
  transactionId: string;
  status: string;
  gatewayRef: string | null;
  /** بالريالات (البوابات ترسل هللات — يُحوَّل قبل الوصول هنا) */
  amount: number | null;
}

export interface PaymentEventResult {
  ok: boolean;
  activated?: boolean;
  idempotent?: boolean;
  failed?: boolean;
  ignored?: string;
  error?: string;
}

const PAID = ['paid', 'captured', 'succeeded'];
const FAILED = ['failed', 'voided', 'refunded', 'canceled', 'cancelled'];

export async function processPaymentEvent(event: PaymentEvent): Promise<PaymentEventResult> {
  if (!adminClientAvailable) {
    return { ok: false, error: 'service_role_missing' };
  }
  if (!event.transactionId) {
    return { ok: true, ignored: 'no_transaction_id' };
  }

  const admin = createAdminClient();
  const status = event.status.toLowerCase();

  if (PAID.includes(status)) {
    const { data, error } = await admin.rpc('activate_event_from_payment', {
      p_transaction_id: event.transactionId,
      p_gateway_ref: event.gatewayRef,
      p_amount: event.amount,
    });
    if (error) {
      console.error('[payments] فشل التفعيل:', error.message);
      return { ok: false, error: 'activation_failed' };
    }
    const res = data as { ok: boolean; idempotent?: boolean } | null;
    return { ok: true, activated: res?.ok ?? false, idempotent: res?.idempotent ?? false };
  }

  if (FAILED.includes(status)) {
    await admin.rpc('fail_payment', {
      p_transaction_id: event.transactionId,
      p_reason: `حالة البوابة: ${status}`,
    });
    return { ok: true, failed: true };
  }

  // حالات وسيطة (initiated, authorized…) تُتجاهل بهدوء
  return { ok: true, ignored: status || 'unknown_status' };
}
