'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { processPaymentEvent } from '@/lib/payments/handler';
import { paymentConfigured } from '@/lib/env';

export interface MockPayState { error?: string; notice?: string }

/**
 * محاكاة حدث من البوابة. تمرّ بالمعالج نفسه الذي يستخدمه الـwebhook
 * الحقيقي، فسلوك التفعيل والـidempotency مطابق تماماً.
 */
export async function simulatePayment(_prev: MockPayState, formData: FormData): Promise<MockPayState> {
  const user = await requireUser();

  // المحاكاة تُعطَّل تماماً حين تُضبط بوابة حقيقية
  if (paymentConfigured) return { error: 'بوابة الدفع الحقيقية مفعّلة — المحاكاة معطّلة.' };

  const transactionId = String(formData.get('tx') ?? '');
  const action = String(formData.get('action') ?? '');
  const backUrl = String(formData.get('back') ?? '/app');

  if (!transactionId) return { error: 'العملية غير محدّدة.' };

  // لا يحاكي الدفع إلا صاحب المناسبة
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from('transactions').select('id, event_id, amount').eq('id', transactionId).maybeSingle();
  if (!tx) return { error: 'العملية غير موجودة أو لا تخصّك.' };

  const { data: event } = await supabase
    .from('events').select('owner_id').eq('id', tx.event_id).maybeSingle();
  if (!event || event.owner_id !== user.id) return { error: 'لا تملك هذه المناسبة.' };

  const status = action === 'fail' ? 'failed' : 'paid';
  const result = await processPaymentEvent({
    transactionId,
    status,
    gatewayRef: `mock_${transactionId.slice(0, 8)}`,
    amount: Number(tx.amount),
  });

  if (!result.ok) return { error: 'تعذّرت معالجة الحدث.' };

  revalidatePath('/app');
  revalidatePath(`/e/${tx.event_id}`);

  if (action === 'retry') {
    return {
      notice: result.idempotent
        ? 'أُعيد إرسال الحدث — ولم تتضاعف المقاعد (idempotent يعمل ✓).'
        : 'أُعيد الإرسال وعولج.',
    };
  }
  if (status === 'failed') {
    return { notice: 'سُجّل فشل السداد — المناسبة لم تُفعَّل.' };
  }

  redirect(backUrl.startsWith('/') ? backUrl : `/e/${tx.event_id}/info`);
}
