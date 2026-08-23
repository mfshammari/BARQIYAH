import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured, paymentConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { MockPayForm } from './MockPayForm';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { EventRow, Package, Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * بوابة دفع وهمية. تحاكي شاشة البوابة وتُشغّل مسار الـwebhook نفسه،
 * فيُختبر التفعيل التلقائي كاملاً قبل ربط بوابة حقيقية.
 */
export default async function MockPayPage({
  searchParams,
}: { searchParams: Promise<{ tx?: string; back?: string }> }) {
  if (!supabaseConfigured) return <SetupNotice />;
  if (paymentConfigured) redirect('/app');   // بوابة حقيقية مفعّلة

  await requireUser();
  const { tx, back } = await searchParams;
  if (!tx) redirect('/app');

  const supabase = await createClient();
  const { data: transaction } = await supabase
    .from('transactions').select('*').eq('id', tx).maybeSingle<Transaction>();
  if (!transaction) redirect('/app');

  const [{ data: event }, { data: pkg }] = await Promise.all([
    supabase.from('events').select('*').eq('id', transaction.event_id).maybeSingle<EventRow>(),
    transaction.package_id
      ? supabase.from('packages').select('*').eq('id', transaction.package_id).maybeSingle<Package>()
      : Promise.resolve({ data: null as Package | null }),
  ]);

  const alreadyPaid = transaction.status === 'paid';

  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-center text-[12.5px] text-warn">
          <b>بوابة محاكاة</b> — لا يُخصم أي مبلغ فعلي.
          <br />
          تُستبدل تلقائياً ببوابة Moyasar عند إضافة مفاتيحها.
        </div>

        <div className="card overflow-hidden">
          <div className="bg-brand px-6 py-5 text-center text-white">
            <div className="font-cerem text-2xl text-gold-soft">برقية</div>
            <p className="mt-1 text-[12px] text-white/70">صفحة الدفع</p>
          </div>

          <div className="card-pad space-y-4">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">المناسبة</dt>
                <dd className="font-semibold">{event?.internal_name || event?.host_name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">الباقة</dt>
                <dd className="font-semibold">{pkg?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-muted">المقاعد</dt>
                <dd className="num font-semibold">+{formatNumber(transaction.seats_added)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">المبلغ</dt>
                <dd className="num text-lg font-extrabold text-brand">{formatCurrency(transaction.amount)}</dd>
              </div>
            </dl>

            {alreadyPaid ? (
              <div className="rounded-xl bg-ok-soft px-4 py-3 text-center text-[13px] text-ok">
                سُدّدت هذه العملية وفُعّلت المناسبة.
              </div>
            ) : null}

            <MockPayForm tx={tx} back={back ?? `/e/${transaction.event_id}/info`} />

            <Link href={`/e/${transaction.event_id}/info`} className="btn-ghost w-full">
              رجوع دون دفع
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
