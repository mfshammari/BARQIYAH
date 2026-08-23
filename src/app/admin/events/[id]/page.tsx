import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EventStatusBadge, GuestStatusBadge, EmptyState, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { activateEvent } from '../../actions';
import { can } from '@/lib/permissions';
import { fetchEventBalance } from '@/lib/balance';
import { BalancePanel } from '@/components/BalancePanel';
import { formatCurrency, formatDate, formatHijri, formatNumber, formatTime } from '@/lib/format';
import { OCCASION_LABELS, TRANSACTION_TYPE_LABELS, type EventRow, type Guest, type Inviter, type Package, type Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminEventDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events').select('*, profiles:owner_id (full_name, phone)').eq('id', id)
    .maybeSingle<EventRow & { profiles: { full_name: string | null; phone: string | null } | null }>();

  if (!event) redirect('/admin/events');

  const [{ data: guestsData }, { data: invitersData }, { data: txData }, { data: packagesData }, balance] =
    await Promise.all([
      supabase.from('guests').select('*').eq('event_id', id)
        .order('created_at', { ascending: false }).returns<Guest[]>(),
      supabase.from('inviters').select('*').eq('event_id', id).returns<Inviter[]>(),
      supabase.from('transactions').select('*').eq('event_id', id)
        .order('created_at', { ascending: false }).returns<Transaction[]>(),
      supabase.from('packages').select('*').eq('active', true)
        .order('seats', { ascending: true }).returns<Package[]>(),
      fetchEventBalance(supabase, id),
    ]);

  const guests = guestsData ?? [];
  const inviters = invitersData ?? [];

  const inviterStats = inviters.map((inv) => {
    const list = guests.filter((g) => g.inviter_id === inv.id);
    const sent = list.filter((g) => g.status !== 'draft').length;
    const accepted = list.filter((g) => g.status === 'accepted' || g.status === 'attended').length;
    return {
      inv, sent, accepted,
      seats: list.filter((g) => g.status === 'accepted' || g.status === 'attended')
        .reduce((s, g) => s + (g.confirmed_seats ?? 0), 0),
      rate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    };
  });

  const failed = guests.filter((g) => g.status === 'failed').length;

  return (
    <>
      {/* مسار التنقّل */}
      <nav className="mb-3 flex items-center gap-1.5 text-[12.5px] text-muted">
        <Link href="/admin" className="hover:text-brand">اليوم</Link>
        <span>/</span>
        <Link href="/admin/events" className="hover:text-brand">المناسبات</Link>
        <span>/</span>
        <span className="text-ink">{event.internal_name || event.host_name}</span>
      </nav>

      <PageHeader
        title={event.internal_name || event.host_name}
        subtitle={`${OCCASION_LABELS[event.occasion_type]} · العميل: ${event.profiles?.full_name ?? event.buyer_name ?? '—'}`}
        action={<EventStatusBadge status={event.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-5">
          {/* بيانات المناسبة */}
          <div className="card card-pad">
            <h2 className="sec-title mb-3">التفاصيل</h2>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
              {[
                ['الدعوة باسم', event.host_name],
                ['أصحاب المناسبة', [event.celebrant_primary, event.celebrant_secondary].filter(Boolean).join(' و') || '—'],
                ['هجري', event.event_date_hijri || formatHijri(event.event_date)],
                ['ميلادي', formatDate(event.event_date)],
                ['الوقت', formatTime(event.event_time) || '—'],
                ['المكان', event.venue || '—'],
                ['جوال المشتري', event.buyer_phone || event.profiles?.phone || '—'],
                ['التفعيل', event.activated_at ? (event.activated_by ? 'يدوي' : 'تلقائي بعد السداد') : 'لم يُفعَّل'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3 border-b border-line/60 py-1.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num text-left">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* أداء الدعاة */}
          <div className="card">
            <div className="border-b border-line px-4 py-3.5 sm:px-5">
              <h2 className="sec-title">أداء الدعاة</h2>
            </div>
            {inviterStats.length === 0 ? (
              <p className="card-pad text-[13px] text-muted">لا دعاة في هذه المناسبة.</p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>الداعي</th><th>الطرف</th><th>حصته</th><th>أُرسل</th><th>أكّد</th><th>معدّل التأكيد</th></tr>
                  </thead>
                  <tbody>
                    {inviterStats.map(({ inv, sent, accepted, rate }) => (
                      <tr key={inv.id}>
                        <td className="font-semibold">{inv.name}</td>
                        <td className="text-[12.5px] text-muted">{inv.side_label ?? inv.role_label}</td>
                        <td className="num">{formatNumber(inv.seats_quota)}</td>
                        <td className="num">{formatNumber(sent)}</td>
                        <td className="num">{formatNumber(accepted)}</td>
                        <td>
                          <span className={`badge ${rate >= 60 ? 'bg-ok-soft text-ok' : rate >= 30 ? 'bg-warn-soft text-warn' : 'bg-panel text-muted border border-line'}`}>
                            <span className="num">{formatNumber(rate)}٪</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* المدعوون */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5">
              <h2 className="sec-title">المدعوون <span className="font-normal text-muted num">({formatNumber(guests.length)})</span></h2>
              {failed > 0 ? (
                <span className="badge bg-danger-soft text-danger num">{formatNumber(failed)} فشل إرسال</span>
              ) : null}
            </div>
            {guests.length === 0 ? (
              <div className="p-5"><EmptyState title="لا مدعوين بعد" /></div>
            ) : (
              <div className="table-wrap max-h-[420px] overflow-y-auto">
                <table className="tbl">
                  <thead><tr><th>الاسم</th><th>الجوال</th><th>المقاعد</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {guests.slice(0, 100).map((g) => (
                      <tr key={g.id}>
                        <td className="font-semibold">{g.name}</td>
                        <td className="num text-muted" dir="ltr">{g.phone}</td>
                        <td className="num">{g.confirmed_seats ?? g.max_seats}</td>
                        <td><GuestStatusBadge status={g.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {guests.length > 100 ? (
                  <p className="p-3 text-center text-[12px] text-muted num">
                    تُعرض أول ١٠٠ من {formatNumber(guests.length)}
                  </p>
                ) : null}
              </div>
            )}
            <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-muted sm:px-5">
              الاطلاع على بيانات المدعوين للدعم التشغيلي فقط — ولا تُصدَّر ولا تُستخدم للتسويق.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <BalancePanel balance={balance} />

          {/* التفعيل اليدوي */}
          {can(user.profile.role, 'manual_activation') ? (
            <div className="card card-pad">
              <h2 className="sec-title mb-3">تفعيل يدوي</h2>
              <ActionForm action={activateEvent}>
                <input type="hidden" name="event_id" value={id} />
                <div>
                  <label className="label">الباقة</label>
                  <select name="package_id" className="field" defaultValue={event.package_id ?? ''} required>
                    <option value="" disabled>اختر باقة…</option>
                    {(packagesData ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {formatNumber(p.seats)} مقعد</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">نوع العملية</label>
                  <select name="type" className="field" defaultValue="manual_activation">
                    <option value="manual_activation">تفعيل يدوي</option>
                    <option value="upgrade">ترقية (إضافة مقاعد)</option>
                  </select>
                </div>
                <div>
                  <label className="label">ملاحظة</label>
                  <input name="note" className="field" placeholder="تحويل بنكي بتاريخ…" />
                </div>
                <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ…">
                  {event.status === 'active' ? 'إضافة مقاعد' : 'تفعيل المناسبة'}
                </SubmitButton>
                <p className="hint">يُسجَّل باسمك في سجل النشاط.</p>
              </ActionForm>
            </div>
          ) : (
            <div className="card card-pad">
              <Alert tone="info">التفعيل اليدوي من صلاحية المدير والدعم.</Alert>
            </div>
          )}

          {/* العمليات */}
          <div className="card">
            <div className="border-b border-line px-4 py-3.5 sm:px-5">
              <h2 className="sec-title">العمليات</h2>
            </div>
            {(txData ?? []).length === 0 ? (
              <p className="card-pad text-[13px] text-muted">لا عمليات.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(txData ?? []).map((t) => (
                  <li key={t.id} className="px-4 py-3 text-[12.5px] sm:px-5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{TRANSACTION_TYPE_LABELS[t.type]}</span>
                      <span className="num">{formatCurrency(t.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex justify-between gap-2 text-muted">
                      <span>{t.method === 'gateway' ? 'بوابة دفع' : t.method === 'bank_transfer' ? 'تحويل' : 'يدوي'}</span>
                      <span className={t.status === 'paid' ? 'text-ok' : 'text-warn'}>
                        {t.status === 'paid' ? 'مدفوعة' : t.status === 'pending' ? 'معلّقة' : 'فاشلة'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
