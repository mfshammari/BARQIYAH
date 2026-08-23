'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { GROUP_LABELS, type AdminNavItem } from '@/lib/permissions';

/** رمز كل وجهة في الشريط الجانبي — مطابق لترتيب النموذج. */
const ICONS: Record<string, string> = {
  '/admin': '▤',
  '/admin/whatsapp': '◉',
  '/admin/events': '☰',
  '/admin/template-requests': '✉',
  '/admin/support': '☎',
  '/admin/clients': '◑',
  '/admin/finance': '₪',
  '/admin/insights': '◈',
  '/admin/team': '◇',
  '/admin/activity': '⟳',
  '/admin/settings': '⚙',
};

/**
 * قائمة الأدمن مجمّعة ثلاثياً (SPEC §9.8)، وعناصرها مبنيّة من صلاحيات
 * المستخدم لا ثابتة — المحاسب لا يرى «مراقبة واتساب» أصلاً.
 */
export function AdminNav({
  userName, roleLabel, nav, pills, children,
}: {
  userName: string;
  roleLabel: string;
  nav: AdminNavItem[];
  /** عدّاد ما ينتظر التدخّل لكل وجهة — يظهر كحبّة صغيرة */
  pills?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = nav
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/admin';

  return (
    <AppShell
      nav={nav.map((n) => ({ ...n, icon: ICONS[n.href], pill: pills?.[n.href] || undefined }))}
      active={active}
      userName={userName}
      userSub={roleLabel}
      host={{ label: 'لوحة الإدارة', name: userName, sub: roleLabel }}
      groupLabels={GROUP_LABELS}
      search
    >
      {children}
    </AppShell>
  );
}
