import { requireEventAccess } from '@/lib/auth';
import { fetchEventBalance } from '@/lib/balance';
import { PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { BalancePanel } from '@/components/BalancePanel';
import { HospitalityBalanceCard } from '@/components/exemptions/HospitalityBalanceCard';
import { fetchExemption } from '@/lib/exemptions/server';
import { exemptionStatus } from '@/lib/exemptions/logic';
import { addGuest, importGuests } from '../actions';
import { OwnerGuestsSection, type OwnerManualSetup } from './OwnerGuestsSection';
import { appUrl } from '@/lib/env';
import { formatEventLine } from '@/lib/format';
import { hasInviteVars, type InviteVars } from '@/lib/inviteVars';
import { parseManualMessage } from '@/lib/manualMessage';
import { publicImageUrl, resolveHeaderImage } from '@/lib/inviteImage';
import type { EventRow, Guest, Inviter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, supabase, user } = await requireEventAccess(id);
  const e = event as EventRow;

  const [{ data: guestsData }, { data: invitersData }, balance] = await Promise.all([
    supabase.from('guests').select('*').eq('event_id', id)
      .order('created_at', { ascending: false }).returns<Guest[]>(),
    supabase.from('inviters').select('*').eq('event_id', id)
      .order('created_at', { ascending: true }).returns<Inviter[]>(),
    fetchEventBalance(supabase, id),
  ]);

  const guests = guestsData ?? [];
  const inviters = invitersData ?? [];
  // التقسيمات والفروع الموجودة — اقتراحات عند الإضافة حتى لا يتكرّر الاسم بإملاء مختلف
  const sectionNames = Array.from(new Set(guests.map((g) => g.section).filter(Boolean) as string[])).sort();
  const branchNames = Array.from(new Set(guests.map((g) => g.branch).filter(Boolean) as string[])).sort();
  const exemption = e.exemption_id ? await fetchExemption(supabase, e.owner_id) : null;
  // قبل الدفع: الدعوات التجريبية المتبقية في الحساب تسمح بالإرسال
  const trialLeft = user.profile.trial_invites_left ?? 0;
  const canSend = e.status === 'active' || ((e.status === 'unpaid' || e.status === 'pending') && trialLeft > 0);

  // الإرسال اليدوي عبر واتساب (الحل المؤقّت): من حساب صاحب المناسبة تصدر
  // الدعوة باسمه فقط (من الحساب لا من إدخال جديد)، ونصّ الرسالة من events.manual_message
  const ownerVars = (e.invite_vars ?? {}) as Partial<InviteVars>;
  const dateParts = {
    dateGregorian: e.event_date, dateHijri: e.event_date_hijri, weekday: e.event_weekday, time: e.event_time,
  };
  const manual: OwnerManualSetup | null = hasInviteVars(ownerVars)
    ? {
        occasion: ownerVars.occasion,
        date: formatEventLine({ ...dateParts, venue: null }),
        venue: e.venue ?? '',
        ownerName: user.profile.full_name?.trim() || e.host_name,
        config: parseManualMessage(e.manual_message),
        uid: user.id,
        attachment: {
          mode: e.image_mode ?? 'generated',
          path: e.image_url,
          publicUrl: e.image_url ? publicImageUrl(e.image_url) : null,
          generatedUrl: resolveHeaderImage({
            kind: 'event', id, imageMode: 'generated', imageUrl: null,
            version: [ownerVars.host, ownerVars.occasion, e.event_date, e.event_time, e.venue, e.host_name],
          }),
        },
      }
    : null;

  return (
    <>
      <PageHeader
        title="المدعوون"
        subtitle="كل مدعو = رسالة واتساب واحدة، بغضّ النظر عن عدد مقاعده. زر «واتساب» يفتح الرسالة جاهزة برابط المدعو لترسلها بنفسك."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        <div className="order-2 lg:order-1">
          <OwnerGuestsSection
            eventId={id}
            guests={guests}
            inviters={inviters}
            appUrl={appUrl()}
            canSend={canSend}
            manual={manual}
          />
        </div>

        <div className="order-1 lg:order-2 space-y-5">
          {exemption ? (
            <HospitalityBalanceCard
              exemption={exemption}
              blocked={exemptionStatus(exemption) !== 'active'}
              packagesHref={`/e/${id}/info`}
            />
          ) : (
            <BalancePanel balance={balance} />
          )}

          <div className="card card-pad">
            <h2 className="sec-title mb-4">إضافة مدعو</h2>
            <ActionForm action={addGuest} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <div>
                <label className="label" htmlFor="g-name">الاسم</label>
                <input id="g-name" name="name" className="field" placeholder="خالد الفهد" required />
              </div>
              <div>
                <label className="label" htmlFor="g-phone">الجوال</label>
                <input id="g-phone" name="phone" dir="ltr" className="field text-left num"
                  placeholder="0555123456" inputMode="tel" required />
              </div>
              <div>
                <label className="label" htmlFor="g-seats">عدد الأشخاص (الحد الأقصى)</label>
                <input id="g-seats" name="max_seats" type="number" min={1} max={50}
                  defaultValue={1} className="field num" required />
                <p className="hint">يُحجز هذا العدد من الرصيد حتى يرد المدعو بالعدد الفعلي.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="g-section">التقسيمة (اختياري)</label>
                  <input id="g-section" name="section" className="field" list="guest-sections"
                    placeholder="العائلة" maxLength={60} />
                  <datalist id="guest-sections">
                    {sectionNames.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label" htmlFor="g-branch">الفرع (اختياري)</label>
                  <input id="g-branch" name="branch" className="field" list="guest-branches"
                    placeholder="الرياض" maxLength={60} />
                  <datalist id="guest-branches">
                    {branchNames.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="g-inviter">الداعي</label>
                <select id="g-inviter" name="inviter_id" className="field" defaultValue={inviters[0]?.id ?? ''}>
                  <option value="">— بدون —</option>
                  {inviters.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.role_label})</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="send_now" className="accent-brand" disabled={!canSend} />
                أرسل الدعوة الآن {canSend ? '' : '(متاح بعد التفعيل)'}
              </label>
              <SubmitButton className="btn-primary w-full" pendingLabel="جارٍ الإضافة…">إضافة المدعو</SubmitButton>
            </ActionForm>
          </div>

          <div className="card card-pad">
            <h2 className="sec-title mb-2">رفع ملف Excel</h2>
            <p className="text-[12.5px] text-muted mb-3">
              الأعمدة المطلوبة: <b>الاسم</b> و<b>الجوال</b>، واختيارياً <b>عدد الأشخاص</b> و<b>الداعي</b> و<b>التقسيمة</b> و<b>الفرع</b>.
            </p>
            <ActionForm action={importGuests} onSuccessReset>
              <input type="hidden" name="event_id" value={id} />
              <input
                type="file" name="file" accept=".xlsx,.xls,.csv" required
                className="w-full text-[13px] file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft
                           file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand"
              />
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="send_now" className="accent-brand" disabled={!canSend} />
                أرسل الدعوات فور الرفع
              </label>
              <SubmitButton className="btn-ghost w-full" pendingLabel="جارٍ الرفع…">رفع الملف</SubmitButton>
            </ActionForm>
          </div>
        </div>
      </div>
    </>
  );
}
