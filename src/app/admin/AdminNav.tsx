'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

const NAV = [
  { href: '/admin', label: 'اللوحة' },
  { href: '/admin/events', label: 'المناسبات' },
  { href: '/admin/packages', label: 'الباقات' },
  { href: '/admin/templates', label: 'مكتبة القوالب' },
  { href: '/admin/template-requests', label: 'طلبات القوالب' },
  { href: '/admin/integration', label: 'إعدادات واتساب' },
];

export function AdminNav({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // أطول مسار مطابق (حتى لا يبقى "/admin" نشطاً في كل الصفحات)
  const active = NAV
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/admin';

  return (
    <AppShell nav={NAV} active={active} userName={userName} userSub="سوبر أدمن">
      {children}
    </AppShell>
  );
}
