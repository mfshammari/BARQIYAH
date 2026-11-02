import { requireAdminPermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveDefaultTemplate, checkMetaTemplateStatus } from '../actions';
import { metaConfigured } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { UNIFIED_TEMPLATE_BODY, DEFAULT_META_TEMPLATE_NAME, fillTemplate } from '@/lib/inviteVars';
import type { Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

const META_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'معتمد لدى Meta', cls: 'bg-ok-soft text-ok' },
  PENDING: { label: 'قيد المراجعة لدى Meta', cls: 'bg-warn-soft text-warn' },
  REJECTED: { label: 'مرفوض لدى Meta', cls: 'bg-danger-soft text-danger' },
  PAUSED: { label: 'موقوف لدى Meta', cls: 'bg-danger-soft text-danger' },
  NOT_FOUND: { label: 'غير موجود لدى Meta', cls: 'bg-danger-soft text-danger' },
};

/**
 * القالب الموحّد — واحد للمنصة كلها. نصّه للقراءة؛ يحرّر الأدمن اسمه في
 * Meta وتصنيفه، ويتحقق من حالته لدى Meta إن كانت المفاتيح مضبوطة.
 */
export default async function AdminTemplatesPage() {
  await requireAdminPermission('whatsapp_settings');
  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from('templates').select('*').eq('is_default', true).maybeSingle<Template>();

  const status = tpl?.meta_status ? META_STATUS_LABELS[tpl.meta_status] : null;
  const sample = fillTemplate(UNIFIED_TEMPLATE_BODY, [
    'أم حمودي', 'زواج ابني حمودي', 'الجمعة ٢٦ شوال ١٤٤٨ هـ · قصر ٣٣ · ٠٩:٠٠ مساءً',
  ]);

  return (
    <>
      <PageHeader
        title="القالب الموحّد"
        subtitle="قالب واتساب واحد للمنصة كلها. {{1}} و{{2}} يكتبهما المالك والداعي، و{{3}} يُحقن من بيانات المناسبة."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
        <div className="space-y-4">
          <div className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display font-bold">{tpl?.name ?? 'قالب برقية الموحّد'}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  {status ? (
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                  ) : (
                    <span className="badge border border-line bg-panel text-muted">الحالة لدى Meta غير مقروءة بعد</span>
                  )}
                  <span className={`badge ${(tpl?.whatsapp_category ?? 'utility') === 'marketing' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info'}`}>
                    {(tpl?.whatsapp_category ?? 'utility') === 'marketing' ? 'تسويقي' : 'خدمي'}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 rounded-xl bg-panel border border-line px-3.5 py-3 text-[14px] leading-8" dir="rtl">
              {UNIFIED_TEMPLATE_BODY}
            </p>
            <p className="hint">النصّ ثابت لا يُعدَّل من هنا — تغييره يستلزم اعتماداً جديداً لدى Meta.</p>

            <div className="mt-4">
              <div className="text-[12.5px] font-semibold text-muted mb-1.5">مثال كما يصل المدعو</div>
              <p className="rounded-xl border border-line px-3.5 py-3 text-[13px] leading-7">{sample}</p>
            </div>
          </div>

          {!tpl ? (
            <Alert tone="warn" title="صف القالب الموحّد غير موجود">
              شغّل الترحيل 0015_unified_template.sql — حتى ذلك يُرسل باسم <code dir="ltr">{DEFAULT_META_TEMPLATE_NAME}</code>.
            </Alert>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h2 className="sec-title mb-4">إعدادات Meta</h2>
            <ActionForm action={saveDefaultTemplate}>
              <div>
                <label className="label" htmlFor="t-meta">اسم القالب في Meta</label>
                <input id="t-meta" name="meta_template_name" dir="ltr" className="field text-left"
                  defaultValue={tpl?.meta_template_name ?? DEFAULT_META_TEMPLATE_NAME}
                  placeholder={DEFAULT_META_TEMPLATE_NAME} required />
              </div>
              <div>
                <label className="label" htmlFor="t-cat">تصنيف واتساب</label>
                <select id="t-cat" name="whatsapp_category" className="field"
                  defaultValue={tpl?.whatsapp_category ?? 'utility'}>
                  <option value="utility">خدمي (Utility)</option>
                  <option value="marketing">تسويقي (Marketing)</option>
                </select>
                <p className="hint">التصنيف يؤثر على تسعير Meta لكل رسالة.</p>
              </div>
              <SubmitButton className="btn-primary w-full">حفظ</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">حالة القالب في Meta</h2>
            <p className="text-[12.5px] text-muted mb-3">
              {metaConfigured
                ? 'تُقرأ من حساب WABA المضبوط في إعدادات واتساب.'
                : 'وضع المحاكاة: لا اتصال بـ Meta حتى تُضبط المفاتيح من إعدادات واتساب.'}
            </p>
            <ActionForm action={checkMetaTemplateStatus}>
              <SubmitButton className="btn-ghost w-full" pendingLabel="جارٍ التحقق…">
                تحقّق من حالة القالب في Meta
              </SubmitButton>
            </ActionForm>
            {tpl?.meta_status ? (
              <p className="hint">آخر قراءة: {tpl.meta_status}</p>
            ) : null}
            {tpl?.created_at ? (
              <p className="hint">أُنشئ: <span className="num">{formatDateTime(tpl.created_at)}</span></p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
