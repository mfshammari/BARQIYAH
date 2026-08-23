'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

export function EventNav({
  eventId, userName, userSub, hostName, eventLine, children,
}: {
  eventId: string;
  userName: string;
  userSub: string;
  /** الجهة الداعية كما تظهر في نص الدعوة */
  hostName: string;
  /** سطر تعريفي قصير: اسم المناسبة وموعدها */
  eventLine: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/e/${eventId}`;
  const nav = [
    { href: base, label: 'لوحة المعلومات', icon: '▤' },
    { href: `${base}/guests`, label: 'المدعوون', icon: '☰' },
    { href: `${base}/inviters`, label: 'الدعاة', icon: '◑' },
    { href: `${base}/template`, label: 'قالب الدعوة', icon: '▧' },
    { href: `${base}/scanners`, label: 'حسابات المسح', icon: '▦' },
    { href: `${base}/info`, label: 'بيانات المناسبة', icon: '✎' },
  ];
  const active = nav
    .filter((n) => pathname === n.href)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
    ?? nav.filter((n) => pathname.startsWith(n.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href
    ?? base;

  return (
    <AppShell
      nav={nav} active={active} userName={userName} userSub={userSub}
      host={{ label: 'الدعوة باسم', name: hostName, sub: eventLine }}
      backHref="/app" backLabel="كل مناسباتي"
    >
      {children}
    </AppShell>
  );
}
