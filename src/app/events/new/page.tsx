import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { AppShell } from '@/components/AppShell';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createEvent } from '../actions';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Package, Template } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  if (!supabaseConfigured) return <SetupNotice />;
  const user = await requireRole(['owner', 'admin']);
  const supabase = await createClient();

  const [{ data: packagesData }, { data: templatesData }] = await Promise.all([
    supabase.from('packages').select('*').eq('active', true)
      .order('seats', { ascending: true }).returns<Package[]>(),
    supabase.from('templates').select('*').is('owner_id', null).eq('status', 'approved')
      .order('created_at', { ascending: true }).returns<Template[]>(),
  ]);

  const packages = packagesData ?? [];
  const templates = templatesData ?? [];

  return (
    <AppShell
      nav={[{ href: '/events', label: 'مناسباتي' }, { href: '/events/new', label: 'مناسبة جديدة' }]}
      active="/events/new"
      userName={user.profile.full_name ?? user.email ?? 'صاحب المناسبة'}
      userSub="صاحب مناسبة"
    >
      <PageHeader title="مناسبة جديدة" subtitle="بيانات المناسبة والباقة والقالب — تُفعَّل بعد اعتماد الإدارة." />

      <div className="max-w-2xl">
        <div className="card card-pad">
          <ActionForm action={createEvent}>
            <Alert tone="info">
              بعد الإنشاء تكون المناسبة <b>بانتظار التفعيل</b>. يفعّلها الأدمن فيُضاف رصيد المقاعد، ثم يبدأ الإرسال.
            </Alert>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="occ">نوع المناسبة</label>
                <select id="occ" name="occasion_type" className="field" defaultValue="wedding">
                  <option value="wedding">حفل زواج</option>
                  <option value="engagement">حفل خطوبة</option>
                  <option value="graduation">حفل تخرّج</option>
                  <option value="other">مناسبة أخرى</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="date">تاريخ المناسبة</label>
                <input id="date" name="event_date" type="date" className="field num" required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="host">الدعوة باسم</label>
              <input id="host" name="host_name" className="field" placeholder="أسرة العبدالله" required />
              <p className="hint">هذا الاسم يظهر في نص الدعوة التي تصل المدعوين.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="bn">اسم المشتري</label>
                <input id="bn" name="buyer_name" className="field"
                  defaultValue={user.profile.full_name ?? ''} placeholder="محمد العبدالله" />
              </div>
              <div>
                <label className="label" htmlFor="bp">جوال المشتري</label>
                <input id="bp" name="buyer_phone" dir="ltr" className="field text-left num"
                  defaultValue={user.profile.phone ?? ''} placeholder="0555123456" />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="pkg">الباقة المطلوبة</label>
              <select id="pkg" name="package_id" className="field" defaultValue="">
                <option value="">— اختر لاحقاً —</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatNumber(p.seats)} مقعد — {formatCurrency(p.price)}
                  </option>
                ))}
              </select>
              <p className="hint">الرصيد بالمقاعد (عدد الأشخاص)، لا بعدد الدعوات.</p>
            </div>

            <div>
              <label className="label" htmlFor="tpl">قالب الدعوة</label>
              <select id="tpl" name="template_id" className="field" defaultValue="">
                <option value="">— اختر لاحقاً —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="img">رابط صورة الدعوة (اختياري)</label>
              <input id="img" name="image_url" dir="ltr" className="field text-left" placeholder="https://…" />
              <p className="hint">تظهر في رأس رسالة واتساب. يمكن رفعها لاحقاً إلى Supabase Storage.</p>
            </div>

            <div className="flex gap-3 pt-1">
              <SubmitButton className="btn-primary" pendingLabel="جارٍ الإنشاء…">إنشاء المناسبة</SubmitButton>
              <Link href="/events" className="btn-ghost">إلغاء</Link>
            </div>
          </ActionForm>
        </div>
      </div>
    </AppShell>
  );
}
