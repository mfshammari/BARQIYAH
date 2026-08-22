import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, TemplateStatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveGlobalTemplate, deleteTemplate } from '../actions';
import { countPlaceholders } from '@/lib/invitations';
import type { Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('templates').select('*').is('owner_id', null)
    .order('created_at', { ascending: false }).returns<Template[]>();
  const templates = data ?? [];

  return (
    <>
      <PageHeader
        title="مكتبة القوالب المعتمدة"
        subtitle="قوالب عامة يستخدمها كل العملاء. المتغيّرات تُكتب هكذا: {{1}} {{2}} …"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {templates.length === 0 ? (
            <EmptyState title="لا توجد قوالب عامة" description="ابنِ أول قالب من النموذج المجاور." />
          ) : (
            templates.map((t) => (
              <div key={t.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-bold">{t.name}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <TemplateStatusBadge status={t.status} />
                      <span className={`badge ${t.whatsapp_category === 'marketing' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info'}`}>
                        {t.whatsapp_category === 'marketing' ? 'تسويقي' : 'خدمي'}
                      </span>
                      <span className="text-[11.5px] text-muted num">
                        {countPlaceholders(t.body_text)} متغيّر
                      </span>
                    </div>
                  </div>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="btn-danger btn-sm">حذف</button>
                  </form>
                </div>

                <p className="mt-3 rounded-xl bg-panel border border-line px-3.5 py-3 text-[13px] leading-7">
                  {t.body_text}
                </p>

                {t.meta_template_name ? (
                  <p className="hint">
                    اسم القالب في Meta: <code dir="ltr" className="text-ink">{t.meta_template_name}</code>
                  </p>
                ) : (
                  <p className="hint text-warn">لم يُربط باسم قالب معتمد في Meta بعد.</p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-4">بناء قالب عام</h2>
          <ActionForm action={saveGlobalTemplate} onSuccessReset>
            <div>
              <label className="label" htmlFor="t-name">اسم القالب</label>
              <input id="t-name" name="name" className="field" placeholder="كلاسيكي — ذهبي" required />
            </div>
            <div>
              <label className="label" htmlFor="t-body">نص الرسالة</label>
              <textarea
                id="t-body" name="body_text" rows={5} className="field leading-7" required
                placeholder="يسرّ {{1}} دعوتكم لحضور حفل زواج {{2}} يوم {{3}}."
              />
              <p className="hint">استخدم {'{{1}}'} لاسم المُضيف و{'{{2}}'} لأصحاب المناسبة.</p>
            </div>
            <div>
              <label className="label" htmlFor="t-image">رابط صورة الرأس (اختياري)</label>
              <input id="t-image" name="image_url" dir="ltr" className="field text-left" placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="t-meta">اسم القالب في Meta</label>
              <input id="t-meta" name="meta_template_name" dir="ltr" className="field text-left" placeholder="barqiyah_invite_classic" />
            </div>
            <div>
              <label className="label" htmlFor="t-cat">تصنيف واتساب</label>
              <select id="t-cat" name="whatsapp_category" className="field" defaultValue="utility">
                <option value="utility">خدمي (Utility)</option>
                <option value="marketing">تسويقي (Marketing)</option>
              </select>
              <p className="hint">التصنيف يؤثر على تسعير Meta لكل رسالة.</p>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="approved" defaultChecked className="accent-brand" />
              اعتماد القالب مباشرة
            </label>
            <SubmitButton className="btn-primary w-full">حفظ القالب</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
