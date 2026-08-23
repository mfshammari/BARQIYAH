'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

const NAV = [
  { href: '/app', label: 'مناسباتي', icon: '☰' },
  { href: '/app/contacts', label: 'دفتر العناوين', icon: '◑' },
  { href: '/app/billing', label: 'المدفوعات والفواتير', icon: '₪' },
  { href: '/app/settings', label: 'حسابي', icon: '⚙' },
];

export function AccountNav({
  userName, userSub, children,
}: { userName: string; userSub?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/app';

  return (
    <AppShell
      nav={NAV}
      active={active}
      userName={userName}
      userSub={userSub}
      host={{ label: 'حسابي', name: userName, sub: userSub ?? 'حساب شخصي' }}
    >
      {children}
    </AppShell>
  );
}
