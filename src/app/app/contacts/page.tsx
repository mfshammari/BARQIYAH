import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Alert } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { addContact, importContacts, deleteAllContacts } from './actions';
import { ContactsTable, type ResponseRecord } from './ContactsTable';
import type { Contact, Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: contactsData }, { data: eventIds }] = await Promise.all([
    supabase.from('contacts').select('*').eq('owner_id', user.id)
      .order('name', { ascending: true }).returns<Contact[]>(),
    supabase.from('events').select('id').eq('owner_id', user.id),
  ]);

  const contacts = contactsData ?? [];

  // سجل الاستجابة: من مدعوي مناسبات هذا العميل وحدها
  const responses: Record<string, ResponseRecord> = {};
  if ((eventIds ?? []).length > 0) {
    const { data: past } = await supabase
      .from('guests').select('phone, status')
      .in('event_id', (eventIds ?? []).map((e) => e.id))
      .returns<Pick<Guest, 'phone' | 'status'>[]>();

    for (const g of past ?? []) {
      if (g.status === 'draft') continue;
      const rec = responses[g.phone] ?? { invited: 0, accepted: 0 };
      rec.invited += 1;
      if (g.status === 'accepted' || g.status === 'attended') rec.accepted += 1;
      responses[g.phone] = rec;
    }
  }

  const groups = Array.from(
    new Set(contacts.map((c) => c.group_label).filter(Boolean) as string[]),
  ).sort();

  return (
    <>
      <PageHeader
        title="دفتر العناوين"
        subtitle="جهاتك محفوظة لمناسباتك القادمة. لا يُستورد تلقائياً — تختار منه يدوياً لكل مناسبة."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <div className="order-2 lg:order-1">
          <ContactsTable contacts={contacts} groups={groups} responses={responses} />
        </div>

        <div className="order-1 lg:order-2 space-y-5">
          <div className="card card-pad">
            <h2 className="sec-title mb-4">إضافة جهة</h2>
            <ActionForm action={addContact} onSuccessReset>
              <div>
                <label className="label" htmlFor="c-name">الاسم</label>
                <input id="c-name" name="name" className="field" placeholder="خالد الفهد" required />
              </div>
              <div>
                <label className="label" htmlFor="c-phone">الجوال</label>
                <input id="c-phone" name="phone" dir="ltr" className="field text-left num"
                  placeholder="0555123456" inputMode="tel" required />
              </div>
              <div>
                <label className="label" htmlFor="c-group">المجموعة</label>
                <input id="c-group" name="group_label" className="field" list="groups" placeholder="العائلة" />
                <datalist id="groups">
                  {groups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإضافة…">إضافة</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">رفع ملف</h2>
            <p className="mb-3 text-[12.5px] text-muted">
              الأعمدة: <b>الاسم</b> و<b>الجوال</b>، واختيارياً <b>المجموعة</b>.
            </p>
            <ActionForm action={importContacts} onSuccessReset>
              <input type="file" name="file" accept=".xlsx,.xls,.csv" required
                className="w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft
                           file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand" />
              <SubmitButton className="btn-ghost w-full" pendingLabel="جارٍ الرفع…">رفع الملف</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">خصوصية دفترك</h2>
            <div className="mb-4">
              <Alert tone="info">
                دفترك خاص بك وحدك — لا يراه أي عميل آخر، ولا فريق المنصة، ولا يُستخدم للتسويق.
              </Alert>
            </div>
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-danger">
                حذف الدفتر بالكامل
              </summary>
              <div className="mt-3">
                <ActionForm action={deleteAllContacts}>
                  <p className="text-[12.5px] text-muted">
                    يحذف كل جهاتك نهائياً ولا يمكن التراجع. اكتب «حذف» للتأكيد.
                  </p>
                  <input name="confirm" className="field" placeholder="حذف" />
                  <SubmitButton className="btn-danger w-full" pendingLabel="جارٍ الحذف…">
                    حذف الدفتر نهائياً
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}
