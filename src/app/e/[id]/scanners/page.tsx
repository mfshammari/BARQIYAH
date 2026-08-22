import { requireEventAccess } from '@/lib/auth';
import { PageHeader, EmptyState, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createScannerAccount, deleteScanner } from '../actions';
import { adminClientAvailable } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import type { Scanner } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ScannerRow extends Scanner {
  profiles: { full_name: string | null } | null;
}

export default async function ScannersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireEventAccess(id);

  const { data } = await supabase
    .from('scanners').select('*, profiles:profile_id (full_name)').eq('event_id', id)
    .order('created_at', { ascending: true }).returns<ScannerRow[]>();
  const scanners = data ?? [];

  return (
    <>
      <PageHeader
        title="حسابات المسح"
        subtitle="حساب لكل بوابة. الماسح يرى شاشة المسح فقط، ولا يصل لبيانات المناسبة."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-4">
          {scanners.length === 0 ? (
            <EmptyState
              title="لا توجد حسابات مسح"
              description="أنشئ حساباً واحداً على الأقل قبل يوم الحفل."
            />
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>البوابة / الاسم</th><th>أُنشئ</th><th></th></tr>
                </thead>
                <tbody>
                  {scanners.map((s) => (
                    <tr key={s.id}>
                      <td className="font-semibold">{s.label}</td>
                      <td className="text-muted num text-[12.5px]">{formatDateTime(s.created_at)}</td>
                      <td>
                        <form action={deleteScanner} className="flex justify-end">
                          <input type="hidden" name="event_id" value={id} />
                          <input type="hidden" name="scanner_id" value={s.id} />
                          <button type="submit" className="btn-ghost btn-sm">إلغاء الوصول</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Alert tone="info" title="كيف يعمل الماسح؟">
            يدخل الماسح من <code dir="ltr" className="mx-1">{appUrl('/scan/login')}</code> ببريده وكلمة مروره،
            فتفتح له شاشة الكاميرا مباشرة. كل مسح يتحقق أونلاين من قاعدة البيانات،
            ويسجّل الحضور بعدد المقاعد المؤكّدة فقط.
          </Alert>
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-4">إنشاء حساب ماسح</h2>
          {!adminClientAvailable ? (
            <Alert tone="warn">
              إنشاء الحسابات يتطلب ضبط <code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code> في متغيّرات البيئة.
            </Alert>
          ) : (
            <ActionForm action={createScannerAccount} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <div>
                <label className="label" htmlFor="s-label">اسم البوابة</label>
                <input id="s-label" name="label" className="field" placeholder="البوابة الرئيسية" required />
              </div>
              <div>
                <label className="label" htmlFor="s-email">البريد الإلكتروني</label>
                <input id="s-email" name="email" type="email" dir="ltr" className="field text-left"
                  placeholder="gate1@example.com" required />
              </div>
              <div>
                <label className="label" htmlFor="s-pass">كلمة المرور</label>
                <input id="s-pass" name="password" type="text" dir="ltr" className="field text-left"
                  placeholder="٨ أحرف على الأقل" minLength={8} required />
                <p className="hint">اكتبها ثم شاركها مع الماسح — لن تُعرض مرة أخرى.</p>
              </div>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإنشاء…">إنشاء الحساب</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
