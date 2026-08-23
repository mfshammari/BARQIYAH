import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/payments/moyasar';
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

  if (!adminClientAvailable) {
    console.error('[payments:webhook] SUPABASE_SERVICE_ROLE_KEY غير مضبوط');
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let body: {
    type?: string;
    id?: string;
    data?: {
      id?: string;
      status?: string;
      amount?: number;
      metadata?: { transaction_id?: string; event_id?: string };
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' });
  }

  const data = body.data ?? {};
  const transactionId = data.metadata?.transaction_id;
  const gatewayRef = data.id ?? body.id ?? null;
  const status = (data.status ?? '').toLowerCase();

  if (!transactionId) {
    return NextResponse.json({ ok: true, ignored: 'no_transaction_id' });
  }

  const admin = createAdminClient();

  try {
    if (status === 'paid') {
      const { data: result, error } = await admin.rpc('activate_event_from_payment', {
        p_transaction_id: transactionId,
        p_gateway_ref: gatewayRef,
        p_amount: typeof data.amount === 'number' ? data.amount / 100 : null,  // هللات → ريالات
      });

      if (error) {
        console.error('[payments:webhook] فشل التفعيل:', error.message);
        return NextResponse.json({ ok: false }, { status: 500 });
      }

      const res = result as { ok: boolean; idempotent?: boolean; seats_quota?: number };
      return NextResponse.json({ ok: true, activated: res?.ok, idempotent: res?.idempotent ?? false });
    }

    if (['failed', 'voided', 'refunded'].includes(status)) {
      await admin.rpc('fail_payment', {
        p_transaction_id: transactionId,
        p_reason: `حالة البوابة: ${status}`,
      });
      return NextResponse.json({ ok: true, failed: true });
    }

    // حالات وسيطة (initiated, authorized…) تُتجاهل بهدوء
    return NextResponse.json({ ok: true, ignored: status || 'unknown_status' });
  } catch (err) {
    console.error('[payments:webhook] خطأ غير متوقع:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
