import type { CheckoutParams, CheckoutResult, PaymentProvider } from './index';

/**
 * بوابة دفع وهمية — تعمل بلا مفاتيح.
 *
 * تحوّل العميل إلى صفحة دفع داخلية يختار فيها: نجاح، فشل، أو إعادة
 * إرسال (لاختبار الـidempotency). الصفحة تُشغّل منطق الـwebhook نفسه،
 * فما يُختبر هنا هو ما سيعمل في الإنتاج عند ربط بوابة حقيقية.
 */
export class MockPaymentProvider implements PaymentProvider {
  id = 'mock' as const;
  label = 'بوابة محاكاة (للتجربة)';

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const url = new URL('/pay/mock', params.callbackUrl);
    url.searchParams.set('tx', params.transactionId);
    url.searchParams.set('amount', String(params.amount));
    url.searchParams.set('event', params.eventId);
    url.searchParams.set('back', params.callbackUrl);

    return {
      ok: true,
      redirectUrl: url.toString(),
      reference: `mock_${params.transactionId.slice(0, 8)}`,
    };
  }

  async verify(): Promise<{ ok: boolean; paid: boolean }> {
    return { ok: true, paid: false };
  }
}
