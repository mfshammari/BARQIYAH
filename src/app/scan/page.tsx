import Link from 'next/link';
import { requireUser, isAdminRole, isClientRole, isScannerRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/env';
import { SetupNotice } from '@/components/SetupNotice';
import { ScannerScreen } from './ScannerScreen';
import { scannerSignOut } from './logout';
import { formatHijri } from '@/lib/format';
import { OCCASION_LABELS, type EventRow, type Scanner } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventLite = Pick<EventRow, 'id' | 'host_name' | 'internal_name' | 'occasion_type' | 'event_date' | 'status'>;

interface ScannerAssignment extends Scanner {
  events: EventLite | null;
}

function eventLabel(e: EventLite): string {
  return `${e.internal_name || e.host_name} — ${OCCASION_LABELS[e.occasion_type]}`;
}

function DarkShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand text-white grid place-items-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="font-cerem text-2xl mb-3">برقية</div>
        {children}
        <form action={scannerSignOut} className="mt-5">
          <button type="submit" className="text-[12.5px] text-white/70 hover:text-white">تسجيل الخروج</button>
        </form>
      </div>
    </main>
  );
}

/** قائمة اختيار المناسبة — للعميل متعدّد المناسبات وللأدمن بعد البحث. */
function EventPicker({ events, title, hint }: { events: EventLite[]; title: string; hint?: string }) {
  return (
    <div className="text-right">
      <p className="text-[14px] font-semibold text-center">{title}</p>
      {hint ? <p className="text-[12.5px] text-white/70 mt-1 text-center">{hint}</p> : null}
      <div className="mt-4 space-y-2">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/scan?event=${e.id}`}
            className="block rounded-xl bg-white/10 border border-white/15 px-4 py-3 hover:bg-white/15"
          >
            <div className="text-[13.5px] font-semibold">{e.internal_name || e.host_name}</div>
            <div className="text-[11.5px] text-white/60 num">
              {OCCASION_LABELS[e.occasion_type]} · {formatHijri(e.event_date)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * شاشة المسح:
 *   الماسح   ← مناسبته من صفّ `scanners`.
 *   العميل   ← يمسح مناسباته التي يملكها (قائمة اختيار إن تعدّدت).
 *   الأدمن   ← أي مناسبة: معرّف أو بحث بالاسم.
 * التحقق الفعلي من الصلاحية يقع في دالة scan_qr داخل القاعدة.
 */
export default async function ScanPage({
  searchParams,
}: { searchParams: Promise<{ event?: string; q?: string }> }) {
  if (!supabaseConfigured) return <SetupNotice />;

  const { event: eventParam, q } = await searchParams;
  const user = await requireUser('/scan/login');
  const supabase = await createClient();
  const role = user.profile.role;
  const scannerLabel = user.profile.full_name ?? 'ماسح';

  // ————— الماسح: صفّ scanners —————
  if (isScannerRole(role)) {
    const { data } = await supabase
      .from('scanners')
      .select('*, events:event_id (id, host_name, internal_name, occasion_type, event_date, status)')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .returns<ScannerAssignment[]>();

    const assignments = (data ?? []).filter((a) => a.events);
    if (assignments.length === 0) {
      return (
        <DarkShell>
          <p className="text-[14px] font-semibold">لا توجد مناسبة مرتبطة بحسابك</p>
          <p className="text-[13px] text-white/70 mt-2">
            تواصل مع صاحب المناسبة ليربط حسابك بالبوابة المطلوبة.
          </p>
        </DarkShell>
      );
    }

    const chosen = assignments.find((a) => a.events?.id === eventParam) ?? assignments[0];
    return (
      <ScannerScreen
        eventLabel={eventLabel(chosen.events!)}
        scannerLabel={chosen.label ?? scannerLabel}
        logoutAction={scannerSignOut}
      />
    );
  }

  // ————— العميل: مناسباته التي يملكها —————
  if (isClientRole(role)) {
    const { data } = await supabase
      .from('events')
      .select('id, host_name, internal_name, occasion_type, event_date, status')
      .eq('owner_id', user.id)
      .order('event_date', { ascending: true })
      .returns<EventLite[]>();
    const owned = data ?? [];

    if (owned.length === 0) {
      return (
        <DarkShell>
          <p className="text-[14px] font-semibold">لا مناسبات تملكها بعد</p>
          <p className="text-[13px] text-white/70 mt-2">أنشئ مناسبتك من «مناسباتي» ثم عد إلى المسح.</p>
          <Link href="/app" className="btn-gold mt-4 inline-flex">إلى مناسباتي</Link>
        </DarkShell>
      );
    }

    const chosen = owned.find((e) => e.id === eventParam) ?? (owned.length === 1 ? owned[0] : null);
    if (!chosen) {
      return (
        <DarkShell>
          <EventPicker events={owned} title="اختر المناسبة التي تمسح لها" />
        </DarkShell>
      );
    }
    return (
      <ScannerScreen
        eventLabel={eventLabel(chosen)}
        scannerLabel={scannerLabel}
        logoutAction={scannerSignOut}
      />
    );
  }

  // ————— الأدمن: أي مناسبة —————
  if (isAdminRole(role)) {
    if (eventParam && UUID_RE.test(eventParam)) {
      const { data: ev } = await supabase
        .from('events')
        .select('id, host_name, internal_name, occasion_type, event_date, status')
        .eq('id', eventParam)
        .maybeSingle<EventLite>();
      if (ev) {
        return (
          <ScannerScreen
            eventLabel={eventLabel(ev)}
            scannerLabel={`${scannerLabel} · الإدارة`}
            logoutAction={scannerSignOut}
          />
        );
      }
    }

    let results: EventLite[] = [];
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      const { data } = await supabase
        .from('events')
        .select('id, host_name, internal_name, occasion_type, event_date, status')
        .or(`host_name.ilike.${term},internal_name.ilike.${term}`)
        .order('event_date', { ascending: true })
        .limit(20)
        .returns<EventLite[]>();
      results = data ?? [];
    }

    return (
      <DarkShell>
        <p className="text-[14px] font-semibold">المسح لأي مناسبة</p>
        <form method="get" action="/scan" className="mt-4 flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="معرّف المناسبة أو اسمها"
            className="flex-1 rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5
                       text-[13px] text-white placeholder:text-white/40 outline-none focus:border-gold-soft"
          />
          <button type="submit" className="btn-gold">بحث</button>
        </form>
        {eventParam && !UUID_RE.test(eventParam) ? (
          <p className="mt-3 text-[12.5px] text-danger-soft">المعرّف غير صالح.</p>
        ) : null}
        {q && UUID_RE.test(q.trim()) ? (
          <Link href={`/scan?event=${q.trim()}`} className="btn-gold mt-4 inline-flex">افتح بالمعرّف</Link>
        ) : null}
        {results.length > 0 ? (
          <div className="mt-5">
            <EventPicker events={results} title="نتائج البحث" />
          </div>
        ) : q ? (
          <p className="mt-4 text-[12.5px] text-white/60">لا نتائج.</p>
        ) : null}
      </DarkShell>
    );
  }

  return (
    <DarkShell>
      <p className="text-[14px] font-semibold">هذا الحساب لا يملك صلاحية المسح.</p>
    </DarkShell>
  );
}
