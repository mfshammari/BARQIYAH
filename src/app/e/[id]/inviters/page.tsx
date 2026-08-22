import { requireEventAccess } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { addInviter, deleteInviter } from '../actions';
import { formatNumber } from '@/lib/format';
import type { Guest, Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InvitersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireEventAccess(id);

  const [{ data: invitersData }, { data: guestsData }] = await Promise.all([
    supabase.from('inviters').select('*').eq('event_id', id)
      .order('created_at', { ascending: true }).returns<Inviter[]>(),
    supabase.from('guests').select('*').eq('event_id', id).returns<Guest[]>(),
  ]);

  const inviters = invitersData ?? [];
  const guests = guestsData ?? [];

  const statsFor = (inviterId: string | null) => {
    const list = guests.filter((g) => g.inviter_id === inviterId);
    return {
      total: list.length,
      sent: list.filter((g) => g.status !== 'draft').length,
      accepted: list.filter((g) => g.status === 'accepted' || g.status === 'attended').length,
      seats: list
        .filter((g) => g.status === 'accepted' || g.status === 'attended')
        .reduce((s, g) => s + (g.confirmed_seats ?? 0), 0),
    };
  };

  const unassigned = statsFor(null);

  return (
    <>
      <PageHeader
        title="الدعاة"
        subtitle="وزّع الدعوات على الدعاة الفرعيين، وتابع نصيب كل واحد من التأكيدات."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-4">
          {inviters.length === 0 ? (
            <EmptyState title="لا يوجد دعاة" description="أضف الداعي الأول من النموذج المجاور." />
          ) : (
            inviters.map((inv) => {
              const s = statsFor(inv.id);
              return (
                <div key={inv.id} className="card card-pad">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-display font-bold">{inv.name}</div>
                      <span className="badge bg-panel border border-line text-muted mt-1">{inv.role_label}</span>
                    </div>
                    {inv.role_label !== 'المالك' ? (
                      <form action={deleteInviter}>
                        <input type="hidden" name="event_id" value={id} />
                        <input type="hidden" name="inviter_id" value={inv.id} />
                        <button type="submit" className="btn-ghost btn-sm">حذف</button>
                      </form>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-line">
                    <Stat label="مدعوون" value={s.total} />
                    <Stat label="أُرسلت" value={s.sent} />
                    <Stat label="أكّدوا" value={s.accepted} />
                    <Stat label="مقاعد مؤكّدة" value={s.seats} />
                  </div>
                </div>
              );
            })
          )}

          {unassigned.total > 0 ? (
            <div className="card card-pad border-dashed">
              <div className="font-display font-bold text-muted">بدون داعٍ محدّد</div>
              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-line">
                <Stat label="مدعوون" value={unassigned.total} />
                <Stat label="أُرسلت" value={unassigned.sent} />
                <Stat label="أكّدوا" value={unassigned.accepted} />
                <Stat label="مقاعد مؤكّدة" value={unassigned.seats} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-4">إضافة داعٍ</h2>
          <ActionForm action={addInviter} onSuccessReset>
            <input type="hidden" name="event_id" value={id} />
            <div>
              <label className="label" htmlFor="i-name">الاسم</label>
              <input id="i-name" name="name" className="field" placeholder="أحمد العبدالله" required />
            </div>
            <div>
              <label className="label" htmlFor="i-role">الصفة</label>
              <input id="i-role" name="role_label" className="field" defaultValue="داعٍ" />
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإضافة…">إضافة</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display font-extrabold text-lg num leading-none">{formatNumber(value)}</div>
      <div className="text-[11.5px] text-muted mt-1">{label}</div>
    </div>
  );
}
