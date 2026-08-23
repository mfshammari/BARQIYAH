import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/moyasar';
import { processPaymentEvent } from '@/lib/payments/handler';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Webhook بوابة الدفع — مصدر الحقيقة للتفعيل (SPEC §5).
 *
 * لا نعتمد على رجوع المستخدم للصفحة لأنه قد يغلق المتصفح بعد الدفع.
 * العملية idempotent: البوابات تعيد الإرسال، ودالة القاعدة تتجاهل
 * التكرار. ونرد دائماً 200 على ما عالجناه حتى لا تعيد البوابة بلا نهاية.
 */
export async function POST(request: NextRequest) {
  // نقرأ الجسم خاماً: التوقيع يُحسب على النص الأصلي حرفاً بحرف
  const rawBody = await request.text();

  const signature =
    request.headers.get('x-moyasar-signature') ??
    request.headers.get('x-signature');

  if (!verifyWebhookSignature(rawBody, signature, env.moyasarWebhookSecret)) {
    console.error('[payments:webhook] توقيع غير صالح — طلب مرفوض');
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let body: {
    id?: string;
    data?: {
      id?: string;
      status?: string;
      amount?: number;
      metadata?: { transaction_id?: string };
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' });
  }

  const data = body.data ?? {};
  const result = await processPaymentEvent({
    transactionId: data.metadata?.transaction_id ?? '',
    status: data.status ?? '',
    gatewayRef: data.id ?? body.id ?? null,
    amount: typeof data.amount === 'number' ? data.amount / 100 : null,   // هللات → ريالات
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
