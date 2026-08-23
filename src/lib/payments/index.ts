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
  id: 'manual' | 'moyasar' | 'tap';
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
 * المزوّد الفعّال: Moyasar عند توفّر مفتاحها، وإلا التفعيل اليدوي.
 * غياب المفاتيح لا يوقف المنصة — يبقى الطلب معلّقاً ينفّذه الفريق.
 */
export function getPaymentProvider(): PaymentProvider {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (key) {
    // استيراد كسول: كود البوابة لا يُحمَّل في وضع التفعيل اليدوي
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MoyasarPaymentProvider } = require('./moyasar') as typeof import('./moyasar');
    return new MoyasarPaymentProvider(key);
  }
  return new ManualPaymentProvider();
}

// TODO: أضف TapPaymentProvider عند الحاجة — يطبّق الواجهة نفسها.
