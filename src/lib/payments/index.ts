/**
 * طبقة الدفع المجرّدة.
 * المرحلة الحالية: تفعيل يدوي من الأدمن.
 * لاحقاً: Moyasar / Tap — يُضاف مزوّد جديد يطبّق PaymentProvider دون إعادة هيكلة.
 */

export interface CheckoutParams {
  eventId: string;
  packageId: string;
  /** العملية المعلّقة التي يعود معرّفها في الـwebhook */
  transactionId: string;
  amount: number;
  description: string;
  callbackUrl: string;
}

export interface CheckoutResult {
  ok: boolean;
  /** رابط صفحة الدفع — فارغ في وضع التفعيل اليدوي */
  redirectUrl?: string;
  reference?: string;
  error?: string;
  requiresManualActivation?: boolean;
}

export interface PaymentProvider {
  id: 'manual' | 'mock' | 'moyasar' | 'tap';
  label: string;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  verify(reference: string): Promise<{ ok: boolean; paid: boolean; error?: string }>;
}

/** المزوّد الحالي: طلب يُسجَّل وينتظر تفعيل الأدمن. */
export class ManualPaymentProvider implements PaymentProvider {
  id = 'manual' as const;
  label = 'تفعيل يدوي من الإدارة';

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    return {
      ok: true,
      requiresManualActivation: true,
      reference: `manual-${params.eventId}`,
    };
  }

  async verify(): Promise<{ ok: boolean; paid: boolean }> {
    return { ok: true, paid: false };
  }
}

/**
 * المزوّد الفعّال:
 *   مفتاح Moyasar موجود      → البوابة الحقيقية
 *   غائب (الوضع الافتراضي)   → بوابة محاكاة تُشغّل المسار كاملاً
 *
 * المحاكاة أنفع من التفعيل اليدوي في التجربة: تختبر الدفع والتفعيل
 * التلقائي والـidempotency بلا انتظار اعتماد البوابة.
 */
export function getPaymentProvider(): PaymentProvider {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (key) {
    // استيراد كسول: كود البوابة لا يُحمَّل في وضع المحاكاة
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MoyasarPaymentProvider } = require('./moyasar') as typeof import('./moyasar');
    return new MoyasarPaymentProvider(key);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MockPaymentProvider } = require('./mock') as typeof import('./mock');
  return new MockPaymentProvider();
}

/** التفعيل اليدوي يبقى متاحاً للفريق مهما كان المزوّد. */
export { ManualPaymentProvider as _ManualPaymentProvider };

// TODO: أضف TapPaymentProvider عند الحاجة — يطبّق الواجهة نفسها.
