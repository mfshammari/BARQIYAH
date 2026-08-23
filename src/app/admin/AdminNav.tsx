'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { GROUP_LABELS, type AdminNavItem } from '@/lib/permissions';

/**
 * قائمة الأدمن مجمّعة ثلاثياً (SPEC §9.8)، وعناصرها مبنيّة من صلاحيات
 * المستخدم لا ثابتة — المحاسب لا يرى «مراقبة واتساب» أصلاً.
 */
export function AdminNav({
  userName, roleLabel, nav, children,
}: {
  userName: string;
  roleLabel: string;
  nav: AdminNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = nav
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/admin';

  const groups = (['daily', 'management', 'system'] as const)
    .map((g) => ({ key: g, items: nav.filter((n) => n.group === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <AppShell nav={nav} active={active} userName={userName} userSub={roleLabel} search>
      {/* القائمة المجمّعة — تظهر على الشاشات الواسعة */}
      <nav className="mb-5 hidden flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 lg:flex">
        {groups.map((g) => (
          <div key={g.key} className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-muted">
              {GROUP_LABELS[g.key]}
            </span>
            <span className="text-line">·</span>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`text-[12.5px] ${
                  active === it.href ? 'font-bold text-brand' : 'text-muted hover:text-ink'
                }`}
              >
                {it.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
