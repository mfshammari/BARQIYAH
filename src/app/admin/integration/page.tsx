import { createClient } from '@/lib/supabase/server';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveIntegration } from '../actions';
import { appUrl, metaConfigured } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import type { IntegrationSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function IntegrationPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('integration_settings').select('*').limit(1).maybeSingle<IntegrationSettings>();

  const webhookUrl = appUrl('/api/whatsapp/webhook');

  return (
    <>
      <PageHeader
        title="إعدادات واتساب المركزية"
        subtitle="رقم واحد للمنصة، اتصال مباشر بـ Meta Cloud API (بدون BSP)."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="card card-pad">
          <ActionForm action={saveIntegration}>
            {!metaConfigured ? (
              <Alert tone="warn" title="وضع المحاكاة مفعّل">
                لا توجد مفاتيح Meta في متغيّرات البيئة. الرسائل تُسجَّل في سجل الرسائل ولا تُرسل فعلياً.
                بمجرد إضافة المفاتيح يتحوّل النظام تلقائياً للإرسال الحقيقي.
              </Alert>
            ) : (
              <Alert tone="ok" title="الاتصال الحقيقي مفعّل">
                مفاتيح Meta مقروءة من متغيّرات البيئة، وهي التي تُستخدم للإرسال.
              </Alert>
            )}

            <div>
              <label className="label" htmlFor="pn">Phone Number ID</label>
              <input id="pn" name="phone_number_id" dir="ltr" className="field text-left"
                defaultValue={data?.phone_number_id ?? ''} placeholder="1029384756…" />
            </div>
            <div>
              <label className="label" htmlFor="waba">WABA ID</label>
              <input id="waba" name="waba_id" dir="ltr" className="field text-left"
                defaultValue={data?.waba_id ?? ''} placeholder="1122334455…" />
            </div>
            <div>
              <label className="label" htmlFor="tok">Access Token (System User — دائم)</label>
              <input id="tok" name="access_token" type="password" dir="ltr" className="field text-left"
                placeholder={data?.access_token ? '•••••••• (محفوظ — اتركه فارغاً للإبقاء عليه)' : 'EAAG…'} />
              <p className="hint">لا يُعرض التوكن المحفوظ مطلقاً. اتركه فارغاً إن لم ترغب بتغييره.</p>
            </div>
            <div>
              <label className="label" htmlFor="vt">Webhook Verify Token</label>
              <input id="vt" name="verify_token" dir="ltr" className="field text-left"
                defaultValue={data?.verify_token ?? ''} placeholder="barqiyah-verify-token" />
            </div>

            <SubmitButton className="btn-primary">حفظ الإعدادات</SubmitButton>
            {data?.updated_at ? (
              <p className="hint">آخر تحديث: <span className="num">{formatDateTime(data.updated_at)}</span></p>
            ) : null}
          </ActionForm>
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-3">رابط الـ Webhook</h2>
          <p className="text-[13px] text-muted mb-2">
            ضع هذا الرابط في إعدادات Webhooks داخل تطبيق Meta، واشترك في حقل <code dir="ltr">messages</code>.
          </p>
          <code dir="ltr" className="block rounded-xl bg-panel border border-line px-3 py-2.5 text-[12px] text-left break-all">
            {webhookUrl}
          </code>

          <h3 className="sec-title mt-5 mb-2">متطلبات التشغيل</h3>
          <ul className="text-[12.5px] text-muted space-y-1.5 list-disc ps-5">
            <li>حساب WABA + توثيق النشاط التجاري (Business Verification).</li>
            <li>System User بتوكن دائم بصلاحيات whatsapp_business_messaging.</li>
            <li>اعتماد الاسم المعروض (Display Name) للرقم.</li>
            <li>قوالب معتمدة من Meta مربوطة بأسمائها في مكتبة القوالب.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
