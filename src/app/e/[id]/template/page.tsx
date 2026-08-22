import { requireEventAccess } from '@/lib/auth';
import { PageHeader, TemplateStatusBadge, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { selectTemplate, requestCustomTemplate } from '../actions';
import { formatDate } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** معاينة نص القالب بعد تعبئة المتغيّرات ببيانات المناسبة. */
function preview(body: string, e: EventRow): string {
  return body
    .replace(/\{\{1\}\}/g, e.host_name)
    .replace(/\{\{2\}\}/g, e.buyer_name || e.host_name)
    .replace(/\{\{3\}\}/g, formatDate(e.event_date))
    .replace(/\{\{4\}\}/g, OCCASION_LABELS[e.occasion_type]);
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase, user } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: publicData }, { data: mineData }] = await Promise.all([
    supabase.from('templates').select('*').is('owner_id', null).eq('status', 'approved')
      .order('created_at', { ascending: true }).returns<Template[]>(),
    supabase.from('templates').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false }).returns<Template[]>(),
  ]);

  const approved = publicData ?? [];
  const mine = mineData ?? [];
  const usable = [...approved, ...mine.filter((t) => t.status === 'approved')];

  return (
    <>
      <PageHeader
        title="قالب الدعوة"
        subtitle="اختر قالباً معتمداً من المكتبة، أو قدّم طلب قالب خاص للمراجعة."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
        <div className="space-y-4">
          <ActionForm action={selectTemplate} className="space-y-4">
            <input type="hidden" name="event_id" value={id} />

            {usable.length === 0 ? (
              <Alert tone="warn">لا توجد قوالب معتمدة بعد. قدّم طلب قالب خاص أو انتظر اعتماد المكتبة.</Alert>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {usable.map((t) => (
                  <label
                    key={t.id}
                    className={`card card-pad cursor-pointer transition-shadow hover:shadow-pop ${
                      e.template_id === t.id ? 'ring-2 ring-brand' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio" name="template_id" value={t.id}
                          defaultChecked={e.template_id === t.id}
                          className="accent-brand"
                        />
                        <span className="font-display font-bold text-[15px]">{t.name}</span>
                      </div>
                      <span className={`badge ${t.owner_id ? 'bg-gold-soft/40 text-gold' : 'bg-panel text-muted border border-line'}`}>
                        {t.owner_id ? 'خاص بك' : 'عام'}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl bg-panel border border-line p-4">
                      <div className="text-center font-cerem text-gold text-lg mb-2">دعوة</div>
                      <p className="text-[13px] leading-7 text-ink">{preview(t.body_text, e)}</p>
                    </div>

                    {!t.meta_template_name ? (
                      <p className="hint text-warn">لم يُربط بعد باسم قالب معتمد في Meta.</p>
                    ) : null}
                  </label>
                ))}
              </div>
            )}

            {usable.length > 0 ? (
              <SubmitButton className="btn-primary">اعتماد القالب المختار</SubmitButton>
            ) : null}
          </ActionForm>

          {mine.length > 0 ? (
            <div className="card card-pad">
              <h2 className="sec-title mb-3">طلباتك للقوالب الخاصة</h2>
              <div className="space-y-3">
                {mine.map((t) => (
                  <div key={t.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[14px]">{t.name}</span>
                      <TemplateStatusBadge status={t.status} />
                    </div>
                    <p className="text-[12.5px] text-muted mt-1.5 leading-6">{t.body_text}</p>
                    {t.status === 'rejected' && t.rejection_reason ? (
                      <p className="mt-2 rounded-lg bg-danger-soft text-danger px-3 py-2 text-[12.5px]">
                        سبب الرفض: {t.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-2">طلب قالب خاص</h2>
          <p className="text-[12.5px] text-muted mb-4">
            يُراجَع من الإدارة ثم يُعتمد لدى Meta قبل الاستخدام.
          </p>
          <ActionForm action={requestCustomTemplate} onSuccessReset>
            <input type="hidden" name="event_id" value={id} />
            <div>
              <label className="label" htmlFor="rt-name">اسم القالب</label>
              <input id="rt-name" name="name" className="field" placeholder="قالب أسرة العبدالله" required />
            </div>
            <div>
              <label className="label" htmlFor="rt-body">نص الدعوة</label>
              <textarea
                id="rt-body" name="body_text" rows={6} className="field leading-7" required
                placeholder="يسرّ {{1}} دعوتكم لحضور حفل زواج {{2}} يوم {{3}}."
              />
              <p className="hint">
                {'{{1}}'} اسم المُضيف · {'{{2}}'} أصحاب المناسبة · {'{{3}}'} التاريخ · {'{{4}}'} نوع المناسبة
              </p>
            </div>
            <div>
              <label className="label" htmlFor="rt-img">رابط صورة الدعوة (اختياري)</label>
              <input id="rt-img" name="image_url" dir="ltr" className="field text-left" placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="rt-cat">تصنيف واتساب</label>
              <select id="rt-cat" name="whatsapp_category" className="field" defaultValue="utility">
                <option value="utility">خدمي (Utility)</option>
                <option value="marketing">تسويقي (Marketing)</option>
              </select>
              <p className="hint">التصنيف يؤثر على تسعير Meta لكل رسالة.</p>
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإرسال…">تقديم الطلب</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
