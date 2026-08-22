'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

export function EventNav({
  eventId, userName, userSub, children,
}: {
  eventId: string; userName: string; userSub: string; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/e/${eventId}`;
  const nav = [
    { href: base, label: 'لوحة المعلومات' },
    { href: `${base}/guests`, label: 'المدعوون' },
    { href: `${base}/inviters`, label: 'الدعاة' },
    { href: `${base}/template`, label: 'قالب الدعوة' },
    { href: `${base}/scanners`, label: 'حسابات المسح' },
    { href: `${base}/info`, label: 'بيانات المناسبة' },
  ];
  const active = nav
    .filter((n) => pathname === n.href)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
    ?? nav.filter((n) => pathname.startsWith(n.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href
    ?? base;

  return (
    <AppShell
      nav={nav} active={active} userName={userName} userSub={userSub}
      backHref="/events" backLabel="كل المناسبات"
    >
      {children}
    </AppShell>
  );
}
