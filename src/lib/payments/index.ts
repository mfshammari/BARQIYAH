/**
 * طبقة الدفع المجرّدة.
 * المرحلة الحالية: تفعيل يدوي من الأدمن.
 * لاحقاً: Moyasar / Tap — يُضاف مزوّد جديد يطبّق PaymentProvider دون إعادة هيكلة.
 */

export interface CheckoutParams {
  eventId: string;
  packageId: string;
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

// TODO: أضف MoyasarPaymentProvider / TapPaymentProvider عند اعتماد بوابة الدفع.
export function getPaymentProvider(): PaymentProvider {
  return new ManualPaymentProvider();
}
