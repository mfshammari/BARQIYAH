import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { setTeamRole } from '../adminActions';
import { can, permissionsOf, PERMISSION_LABELS, ROLE_LABELS, type Permission } from '@/lib/permissions';
import { formatDate } from '@/lib/format';
import type { Profile, UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TEAM_ROLES: UserRole[] = ['admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance'];
const ALL_PERMISSIONS: Permission[] = [
  'manual_activation', 'review_templates', 'impersonate', 'finance', 'whatsapp_settings', 'manage_team',
];

export default async function TeamPage() {
  const user = await requireUser();
  if (!can(user.profile.role, 'manage_team')) redirect('/admin');

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles').select('*')
    .in('role', ['admin', ...TEAM_ROLES])
    .order('created_at', { ascending: true }).returns<Profile[]>();

  const team = data ?? [];

  return (
    <>
      <PageHeader
        title="الفريق"
        subtitle="الأدوار وصلاحياتها. عناصر القائمة تُبنى من صلاحيات كل عضو — لا يرى ما لا يملكه."
      />

      {/* مصفوفة الصلاحيات */}
      <div className="card mb-6">
        <div className="border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="sec-title">مصفوفة الصلاحيات</h2>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الصلاحية</th>
                {TEAM_ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="font-semibold">{PERMISSION_LABELS[p]}</td>
                  {TEAM_ROLES.map((r) => (
                    <td key={r} className="text-center">
                      {can(r, p) ? (
                        <span className="text-ok" aria-label="مسموح">✓</span>
                      ) : (
                        <span className="text-muted/50" aria-label="غير مسموح">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <div className="card">
          <div className="border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="sec-title">الأعضاء</h2>
          </div>
          {team.length === 0 ? (
            <div className="p-5"><EmptyState title="لا أعضاء" /></div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>الاسم</th><th>الدور</th><th>صلاحياته</th><th>أُضيف</th></tr></thead>
                <tbody>
                  {team.map((m) => (
                    <tr key={m.id}>
                      <td className="font-semibold">
                        {m.full_name ?? m.id.slice(0, 8)}
                        {m.id === user.id ? <span className="ms-2 text-[11px] text-muted">(أنت)</span> : null}
                      </td>
                      <td><span className="badge bg-brand-soft text-brand">{ROLE_LABELS[m.role]}</span></td>
                      <td className="num text-[12.5px] text-muted">{permissionsOf(m.role).length} صلاحية</td>
                      <td className="num text-[12px] text-muted">{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h2 className="sec-title mb-4">تغيير دور عضو</h2>
          <ActionForm action={setTeamRole}>
            <div>
              <label className="label">العضو</label>
              <select name="profile_id" className="field" required defaultValue="">
                <option value="" disabled>اختر…</option>
                {team.filter((m) => m.id !== user.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الدور الجديد</label>
              <select name="role" className="field" required defaultValue="">
                <option value="" disabled>اختر…</option>
                {TEAM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                <option value="user">إزالة من الفريق (عميل)</option>
              </select>
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel="…">حفظ</SubmitButton>
            <p className="hint">يُسجَّل التغيير باسمك في سجل النشاط.</p>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
