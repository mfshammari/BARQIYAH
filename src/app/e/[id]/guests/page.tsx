import { requireEventAccess } from '@/lib/auth';
import { fetchEventBalance } from '@/lib/balance';
import { PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { BalancePanel } from '@/components/BalancePanel';
import { addGuest, importGuests } from '../actions';
import { GuestsTable } from './GuestsTable';
import { appUrl } from '@/lib/env';
import type { EventRow, Guest, Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: guestsData }, { data: invitersData }, balance] = await Promise.all([
    supabase.from('guests').select('*').eq('event_id', id)
      .order('created_at', { ascending: false }).returns<Guest[]>(),
    supabase.from('inviters').select('*').eq('event_id', id)
      .order('created_at', { ascending: true }).returns<Inviter[]>(),
    fetchEventBalance(supabase, id),
  ]);

  const guests = guestsData ?? [];
  const inviters = invitersData ?? [];
  const canSend = e.status === 'active';

  return (
    <>
      <PageHeader
        title="المدعوون"
        subtitle="كل مدعو = رسالة واتساب واحدة، بغضّ النظر عن عدد مقاعده."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="order-2 lg:order-1">
          <GuestsTable
            eventId={id}
            guests={guests}
            inviters={inviters}
            appUrl={appUrl()}
            canSend={canSend}
          />
        </div>

        <div className="order-1 lg:order-2 space-y-5">
          <BalancePanel balance={balance} />

          <div className="card card-pad">
            <h2 className="sec-title mb-4">إضافة مدعو</h2>
            <ActionForm action={addGuest} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <div>
                <label className="label" htmlFor="g-name">الاسم</label>
                <input id="g-name" name="name" className="field" placeholder="خالد الفهد" required />
              </div>
              <div>
                <label className="label" htmlFor="g-phone">الجوال</label>
                <input id="g-phone" name="phone" dir="ltr" className="field text-left num"
                  placeholder="0555123456" inputMode="tel" required />
              </div>
              <div>
                <label className="label" htmlFor="g-seats">عدد الأشخاص (الحد الأقصى)</label>
                <input id="g-seats" name="max_seats" type="number" min={1} max={50}
                  defaultValue={1} className="field num" required />
                <p className="hint">يُحجز هذا العدد من الرصيد حتى يرد المدعو بالعدد الفعلي.</p>
              </div>
              <div>
                <label className="label" htmlFor="g-inviter">الداعي</label>
                <select id="g-inviter" name="inviter_id" className="field" defaultValue={inviters[0]?.id ?? ''}>
                  <option value="">— بدون —</option>
                  {inviters.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.role_label})</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="send_now" className="accent-brand" disabled={!canSend} />
                أرسل الدعوة الآن {canSend ? '' : '(متاح بعد التفعيل)'}
              </label>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإضافة…">إضافة المدعو</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">رفع ملف Excel</h2>
            <p className="text-[12.5px] text-muted mb-3">
              الأعمدة المطلوبة: <b>الاسم</b> و<b>الجوال</b>، واختيارياً <b>عدد الأشخاص</b> و<b>الداعي</b>.
            </p>
            <ActionForm action={importGuests} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <input
                type="file" name="file" accept=".xlsx,.xls,.csv" required
                className="w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft
                           file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand"
              />
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="send_now" className="accent-brand" disabled={!canSend} />
                أرسل الدعوات فور الرفع
              </label>
              <SubmitButton className="btn-ghost w-full" pendingLabel="جارٍ الرفع…">رفع الملف</SubmitButton>
            </ActionForm>
          </div>
        </div>
      </div>
    </>
  );
}
