import { requireEventAccess } from '@/lib/auth';
import { PageHeader, EmptyState, Alert, QuotaBar } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { addInviter, deleteInviter, updateInviterQuota } from '../actions';
import { appUrl } from '@/lib/env';
import { formatEventLine, formatNumber } from '@/lib/format';
import { renderInvite } from '@/lib/inviteVars';
import type { EventRow, Guest, Inviter, Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** ألوان شرائح الحصص — تدور على الدعاة بالترتيب. */
const SEGMENT_COLORS = ['rgb(var(--brand))', 'rgb(var(--gold))', 'rgb(var(--ok))', 'rgb(var(--warn))', 'rgb(var(--info))'];

export default async function InvitersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: invitersData }, { data: guestsData }, { data: templatesData }] = await Promise.all([
    supabase.from('inviters').select('*').eq('event_id', id)
      .order('created_at', { ascending: true }).returns<Inviter[]>(),
    supabase.from('guests').select('*').eq('event_id', id).returns<Guest[]>(),
    supabase.from('templates').select('id, name').returns<Template[]>(),
  ]);

  const inviters = invitersData ?? [];
  const guests = guestsData ?? [];
  const templateName = new Map((templatesData ?? []).map((t) => [t.id, t.name]));

  // سطر الموعد والمكان يُحقن في نص كل داعٍ — من بيانات المناسبة وحدها
  const eventLine = formatEventLine({
    dateGregorian: e.event_date,
    dateHijri: e.event_date_hijri,
    weekday: e.event_weekday,
    time: e.event_time,
    venue: e.venue,
  });

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

      {/* شريط توزيع الحصص — لكل داعٍ لونه في المفتاح */}
      <QuotaBar
        total={formatNumber(e.seats_quota)}
        totalLabel="مقعداً في الباقة"
        segments={[
          ...inviters.map((inv, i) => ({
            label: `${inv.name} ${formatNumber(inv.seats_quota)}`,
            value: inv.seats_quota,
            pct: e.seats_quota ? (inv.seats_quota / e.seats_quota) * 100 : 0,
            color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
          })),
          {
            label: `غير موزّع ${formatNumber(Math.max(unallocated, 0))}`,
            value: Math.max(unallocated, 0),
            pct: e.seats_quota ? (Math.max(unallocated, 0) / e.seats_quota) * 100 : 0,
            color: 'rgb(var(--line))',
          },
        ]}
      />

      {unallocated < 0 ? (
        <div className="mb-4">
          <Alert tone="danger" title="مجموع الحصص يتجاوز الباقة">
            راجع الحصص — لا يمكن أن يتجاوز مجموعها عدد مقاعد الباقة.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_330px] items-start">
        <div className="space-y-4">
          {inviters.length === 0 ? (
            <EmptyState title="لا يوجد دعاة" description="أضف الداعي الأول وخصّص له حصته." />
          ) : (
            inviters.map((inv) => {
              const s = statsFor(inv.id);
              const written = Boolean(inv.template_id && (inv.invite_vars as Record<string, string>)?.host);
              return (
                <div key={inv.id} className="inv-card">
                  <div className="inv-top">
                    <div className="min-w-0">
                      <div className="inv-name">
                        {inv.name}
                        <span className="badge border border-line bg-panel text-muted">{inv.role_label}</span>
                        <span className={`badge ${written ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                          {written ? 'كتب دعوته' : 'لم يكتب نصّه بعد'}
                        </span>
                      </div>
                      <div className="inv-sub">
                        {inv.side_label ? `${inv.side_label} · ` : ''}
                        {inv.phone ? <span dir="ltr" className="num">{inv.phone}</span> : 'بلا جوال'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="inv-seats">
                        <b className="num">{formatNumber(inv.seats_quota)}</b>
                        <span>مقعداً</span>
                      </div>
                      {inv.role_label !== 'المالك' ? (
                        <form action={deleteInviter}>
                          <input type="hidden" name="event_id" value={id} />
                          <input type="hidden" name="inviter_id" value={inv.id} />
                          <button type="submit" className="btn-ghost btn-sm">إلغاء</button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <div className="inv-body">
                    <div className="inv-lbl">
                      نصّه كما كتبه{' '}
                      <span className="badge border border-line bg-panel text-muted">للاطلاع فقط</span>
                    </div>
                    {written ? (
                      <>
                        <div className="inv-text">
                          {renderInvite(
                            (inv.invite_vars ?? {}) as Record<string, string>,
                            eventLine,
                          )}
                        </div>
                        <div className="inv-row">
                          <span>
                            اختار قالب:{' '}
                            <b>{templateName.get(inv.template_id ?? '') ?? 'قالب معتمد'}</b>
                          </span>
                          <span>صورته: <b>{inv.image_url ? 'مرفوعة' : 'لم تُرفع'}</b></span>
                        </div>
                      </>
                    ) : (
                      <div className="inv-pending">
                        لم يكتب نصّه بعد — سيكتبه عند أول دخول له.
                      </div>
                    )}

                    <div className="inv-stats num">
                      <span>مدعوون {formatNumber(s.total)}</span>
                      <span>أُرسل {formatNumber(s.sent)}</span>
                      <span>أكّد {formatNumber(s.accepted)}</span>
                      <span>مقاعد مؤكّدة {formatNumber(s.confirmed)}</span>
                      <span>معدّل التأكيد {formatNumber(s.rate)}٪</span>
                    </div>
                  </div>

                  <div className="inv-acts items-end">
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
                <input id="i-name" name="name" className="field" placeholder="أم عبدالله الفالح" required />
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
