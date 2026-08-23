import { requireEventAccess } from '@/lib/auth';
import { PageHeader, EmptyState, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { addInviter, deleteInviter, updateInviterQuota } from '../actions';
import { appUrl } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import type { EventRow, Guest, Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InvitersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: invitersData }, { data: guestsData }] = await Promise.all([
    supabase.from('inviters').select('*').eq('event_id', id)
      .order('created_at', { ascending: true }).returns<Inviter[]>(),
    supabase.from('guests').select('*').eq('event_id', id).returns<Guest[]>(),
  ]);

  const inviters = invitersData ?? [];
  const guests = guestsData ?? [];

  const allocated = inviters.reduce((s, i) => s + i.seats_quota, 0);
  const unallocated = e.seats_quota - allocated;

  const statsFor = (inviterId: string) => {
    const list = guests.filter((g) => g.inviter_id === inviterId);
    const held = list.filter((g) => g.status === 'sent').reduce((s, g) => s + g.max_seats, 0);
    const confirmed = list
      .filter((g) => g.status === 'accepted' || g.status === 'attended')
      .reduce((s, g) => s + (g.confirmed_seats ?? 0), 0);
    const sent = list.filter((g) => g.status !== 'draft').length;
    const accepted = list.filter((g) => g.status === 'accepted' || g.status === 'attended').length;
    return {
      total: list.length, sent, accepted, held, confirmed,
      rate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    };
  };

  return (
    <>
      <PageHeader
        title="الدعاة"
        subtitle="وزّع حصص المقاعد. كل داعٍ يكتب نصّه ويختار قالبه بنفسه — ولا تملك تعديلها."
      />

      {/* شريط توزيع الحصص */}
      <div className="card card-pad mb-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sec-title">توزيع المقاعد</h2>
          <span className="text-[12.5px] text-muted">
            من أصل <b className="text-ink num">{formatNumber(e.seats_quota)}</b> مقعد
          </span>
        </div>

        <div className="flex h-3 overflow-hidden rounded-full border border-line bg-panel">
          {inviters.map((inv, i) => (
            <div
              key={inv.id}
              title={`${inv.name}: ${inv.seats_quota}`}
              className={i % 2 === 0 ? 'h-full bg-brand' : 'h-full bg-gold'}
              style={{ width: `${e.seats_quota ? (inv.seats_quota / e.seats_quota) * 100 : 0}%` }}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <div className="font-ui text-lg font-extrabold num">{formatNumber(allocated)}</div>
            <div className="text-[11.5px] text-muted">موزَّع على الدعاة</div>
          </div>
          <div>
            <div className={`font-ui text-lg font-extrabold num ${unallocated < 0 ? 'text-danger' : 'text-brand'}`}>
              {formatNumber(unallocated)}
            </div>
            <div className="text-[11.5px] text-muted">غير موزَّع (يبقى لك)</div>
          </div>
          <div>
            <div className="font-ui text-lg font-extrabold num">{formatNumber(inviters.length)}</div>
            <div className="text-[11.5px] text-muted">عدد الدعاة</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_330px] items-start">
        <div className="space-y-4">
          {inviters.length === 0 ? (
            <EmptyState title="لا يوجد دعاة" description="أضف الداعي الأول وخصّص له حصته." />
          ) : (
            inviters.map((inv) => {
              const s = statsFor(inv.id);
              const written = Boolean(inv.template_id && (inv.invite_vars as Record<string, string>)?.host);
              return (
                <div key={inv.id} className="card card-pad">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-ui font-bold">{inv.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="badge border border-line bg-panel text-muted">{inv.role_label}</span>
                        {inv.side_label ? (
                          <span className="badge bg-gold-soft/50 text-warn">{inv.side_label}</span>
                        ) : null}
                        <span className={`badge ${written ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                          {written ? 'كتب دعوته' : 'لم يكتب نصّه بعد'}
                        </span>
                      </div>
                      {inv.phone ? (
                        <div className="mt-1 text-[12px] text-muted num" dir="ltr">{inv.phone}</div>
                      ) : null}
                    </div>

                    {inv.role_label !== 'المالك' ? (
                      <form action={deleteInviter}>
                        <input type="hidden" name="event_id" value={id} />
                        <input type="hidden" name="inviter_id" value={inv.id} />
                        <button type="submit" className="btn-ghost btn-sm">إلغاء</button>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-5">
                    <Stat label="حصته" value={inv.seats_quota} />
                    <Stat label="مدعوون" value={s.total} />
                    <Stat label="أُرسلت" value={s.sent} />
                    <Stat label="مقاعد مؤكّدة" value={s.confirmed} />
                    <div>
                      <div className="font-ui text-lg font-extrabold leading-none num">{formatNumber(s.rate)}٪</div>
                      <div className="mt-1 text-[11.5px] text-muted">معدّل التأكيد</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <ActionForm action={updateInviterQuota} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="event_id" value={id} />
                      <input type="hidden" name="inviter_id" value={inv.id} />
                      <div>
                        <label className="label">الحصة</label>
                        <input name="seats_quota" type="number" min={0} className="field num w-28"
                          defaultValue={inv.seats_quota} />
                      </div>
                      <SubmitButton className="btn-ghost btn-sm" pendingLabel="…">تحديث</SubmitButton>
                    </ActionForm>

                    {!inv.profile_id ? (
                      <div className="min-w-[220px] flex-1">
                        <label className="label">رابط دخول الداعي</label>
                        <input
                          readOnly dir="ltr"
                          className="field text-left text-[11.5px]"
                          value={appUrl(`/join/${inv.invite_token}`)}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="sec-title mb-4">إضافة داعٍ</h2>
            <ActionForm action={addInviter} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <div>
                <label className="label" htmlFor="i-name">الاسم كما يظهر في الدعوة</label>
                <input id="i-name" name="name" className="field" placeholder="أم حمودي" required />
              </div>
              <div>
                <label className="label" htmlFor="i-phone">جوال الداعي</label>
                <input id="i-phone" name="phone" dir="ltr" className="field text-left num"
                  inputMode="tel" placeholder="0555123456" required />
                <p className="hint">به يدخل ليكتب دعوته ويدير مدعوّيه.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="i-side">الطرف</label>
                  <input id="i-side" name="side_label" className="field" placeholder="أهل العريس" />
                </div>
                <div>
                  <label className="label" htmlFor="i-quota">حصته</label>
                  <input id="i-quota" name="seats_quota" type="number" min={0}
                    className="field num" defaultValue={0} />
                </div>
              </div>
              <p className="hint">
                المتاح للتوزيع الآن: <b className="num">{formatNumber(Math.max(unallocated, 0))}</b> مقعداً.
              </p>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ…">إضافة الداعي</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <Alert tone="info" title="ما تملكه وما لا تملكه">
              تحدّد الاسم والجوال والصفة والحصة، وتستطيع تعديل الحصة أو إلغاء الحساب.
              أما نصّ الداعي وقالبه وصورته فيملكها هو وحده — تراها ولا تعدّلها.
            </Alert>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-ui text-lg font-extrabold leading-none num">{formatNumber(value)}</div>
      <div className="mt-1 text-[11.5px] text-muted">{label}</div>
    </div>
  );
}
