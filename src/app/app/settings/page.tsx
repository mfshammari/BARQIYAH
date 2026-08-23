import { requireUser } from '@/lib/auth';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { updateAccount } from './actions';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="الحساب" subtitle="حسابك دائم ويجمع كل مناسباتك — الحالية والقادمة." />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="card card-pad">
          <h2 className="sec-title mb-4">بياناتك</h2>
          <ActionForm action={updateAccount}>
            <div>
              <label className="label" htmlFor="name">الاسم الكامل</label>
              <input id="name" name="full_name" className="field"
                defaultValue={user.profile.full_name ?? ''} required />
            </div>
            <div>
              <label className="label" htmlFor="phone">رقم الجوال</label>
              <input id="phone" name="phone" dir="ltr" className="field text-left num"
                defaultValue={user.profile.phone ?? ''} placeholder="0555123456" />
              <p className="hint">يُستخدم للتواصل معك، ولربطك كداعٍ في مناسبات غيرك.</p>
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input className="field text-left" dir="ltr" defaultValue={user.email ?? ''} disabled />
              <p className="hint">لتغيير البريد تواصل مع الدعم.</p>
            </div>
            <SubmitButton className="btn-primary">حفظ</SubmitButton>
          </ActionForm>
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="sec-title mb-3">عن حسابك</h2>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">أُنشئ في</dt>
                <dd className="num">{formatDate(user.profile.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">الحالة</dt>
                <dd>
                  <span className={`badge ${user.profile.is_active ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
                    {user.profile.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-3">بياناتك وبيانات مدعوّيك</h2>
            <Alert tone="info">
              أرقام مدعوّيك تُستخدم لإيصال الدعوة فقط — لا تُصدَّر ولا تُستخدم للتسويق، التزاماً
              بنظام حماية البيانات الشخصية. ودفتر عناوينك خاص بك وحدك، ويمكنك حذفه كاملاً في أي وقت
              من صفحة دفتر العناوين.
            </Alert>
          </div>
        </div>
      </div>
    </>
  );
}
