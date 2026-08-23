import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, EmptyState, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { toggleClientSending } from '../adminActions';
import { can } from '@/lib/permissions';
import { metaConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import type { MessageLog, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function WhatsAppMonitor() {
  const user = await requireUser();
  if (!can(user.profile.role, 'whatsapp_settings')) redirect('/admin');

  const supabase = await createClient();
  const [{ data: logsData }, { data: clientsData }] = await Promise.all([
    supabase.from('message_logs').select('*')
      .order('created_at', { ascending: false }).limit(2000).returns<MessageLog[]>(),
    supabase.from('profiles').select('*').in('role', ['user', 'owner']).returns<Profile[]>(),
  ]);

  const logs = logsData ?? [];
  const sent = logs.filter((l) => l.status === 'sent').length;
  const failed = logs.filter((l) => l.status === 'failed').length;
  const rate = logs.length > 0 ? Math.round((failed / logs.length) * 100) : 0;

  // أسباب الفشل مرتّبة
  const reasons = new Map<string, number>();
  for (const l of logs.filter((x) => x.status === 'failed')) {
    const key = l.error_code || l.error || 'سبب غير معروف';
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const topReasons = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const paused = (clientsData ?? []).filter((c) => c.sending_paused);

  return (
    <>
      <PageHeader
        title="مراقبة واتساب"
        subtitle="الرقم مشترك بين كل العملاء — انخفاض جودته يوقفهم جميعاً، فعامله كخطر تشغيلي أول."
      />

      {!metaConfigured ? (
        <div className="mb-5">
          <Alert tone="warn" title="وضع المحاكاة">
            مفاتيح Meta غير مضبوطة — الأرقام أدناه من سجل المحاكاة لا من واتساب الفعلي.
          </Alert>
        </div>
      ) : null}

      {rate >= 10 ? (
        <div className="mb-5">
          <Alert tone="danger" title="تحذير: معدّل الفشل مرتفع">
            <span className="num">{formatNumber(rate)}٪</span> من الرسائل تفشل. راجع أسباب الفشل أدناه،
            وأوقف العميل المتسبّب قبل أن ينخفض تقييم الرقم ويتعطّل الجميع.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="رسائل مرسلة" value={formatNumber(sent)} tone="ok" />
        <StatCard label="فشل" value={formatNumber(failed)} tone={failed > 0 ? 'danger' : 'default'} />
        <StatCard label="معدّل الفشل" value={`${formatNumber(rate)}٪`} tone={rate >= 10 ? 'danger' : 'ok'} />
        <StatCard label="عملاء موقوفون" value={formatNumber(paused.length)} tone={paused.length ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card">
          <div className="border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="sec-title">أسباب الفشل</h2>
          </div>
          {topReasons.length === 0 ? (
            <p className="card-pad text-[13px] text-ok">لا حالات فشل ✓</p>
          ) : (
            <ul className="divide-y divide-line">
              {topReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between gap-3 px-4 py-3 text-[12.5px] sm:px-5">
                  <span className="truncate text-muted">{reason}</span>
                  <span className="num shrink-0 font-semibold">{formatNumber(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="sec-title">إيقاف إرسال عميل</h2>
          </div>
          <div className="card-pad space-y-4">
            <Alert tone="warn">
              الإيقاف يمنع العميل من إرسال أي دعوة فوراً. الإيقاف الخاطئ قبل حفل بيوم يعطّله بالكامل —
              تأكّد قبل التنفيذ.
            </Alert>

            {(clientsData ?? []).length === 0 ? (
              <EmptyState title="لا عملاء بعد" />
            ) : (
              <ActionForm action={toggleClientSending}>
                <div>
                  <label className="label">العميل</label>
                  <select name="profile_id" className="field" required defaultValue="">
                    <option value="" disabled>اختر عميلاً…</option>
                    {(clientsData ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name ?? c.phone ?? c.id.slice(0, 8)}
                        {c.sending_paused ? ' — موقوف' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">السبب</label>
                  <input name="reason" className="field" placeholder="شكاوى متكررة من مدعويه" />
                </div>
                <div className="flex gap-2">
                  <SubmitButton className="btn-danger" name="pause" value="true" pendingLabel="…">
                    إيقاف الإرسال
                  </SubmitButton>
                  <SubmitButton className="btn-ghost" name="pause" value="false" pendingLabel="…">
                    استئناف
                  </SubmitButton>
                </div>
              </ActionForm>
            )}

            {paused.length > 0 ? (
              <div className="border-t border-line pt-3">
                <h3 className="mb-2 text-[12.5px] font-semibold">الموقوفون حالياً</h3>
                <ul className="space-y-1.5">
                  {paused.map((c) => (
                    <li key={c.id} className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                      <b>{c.full_name ?? c.id.slice(0, 8)}</b>
                      {c.paused_reason ? ` — ${c.paused_reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
