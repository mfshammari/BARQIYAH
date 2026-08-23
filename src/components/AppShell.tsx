import Link from 'next/link';
import { signOut } from '@/app/login/actions';
import { Logo } from '@/components/ui';
import { CommandSearch } from '@/components/CommandSearch';
import { formatNumber } from '@/lib/format';

export interface NavItem {
  href: string;
  label: string;
  /** رمز صغير يسبق الاسم في الشريط الجانبي */
  icon?: string;
  /** عدّاد صغير: مهام تنتظر (طلبات قوالب، تذاكر دعم…) */
  pill?: number;
  /** مجموعة القائمة — تُستخدم في لوحة الأدمن وحدها */
  group?: string;
}

/**
 * الهيكل العام للوحات (أدمن / صاحب مناسبة / داعٍ):
 * شريط علوي رفيع + شريط جانبي لاصق على الشاشات الواسعة،
 * ينهار إلى كتلة فوق المحتوى على الجوال — كما في النموذج.
 */
export function AppShell({
  nav, active, userName, userSub, children, backHref, backLabel,
  search = false, host, groupLabels,
}: {
  nav: NavItem[];
  active: string;
  userName: string;
  userSub?: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  /** بحث ⌘K — للوحات الأدمن */
  search?: boolean;
  /** بطاقة السياق أعلى الشريط الجانبي: الدعوة باسم / المناسبة */
  host?: { label: string; name: string; sub?: string };
  /** عناوين المجموعات — بوجودها تُعرض القائمة مقسّمة */
  groupLabels?: Record<string, string>;
}) {
  const groups = groupLabels
    ? Object.keys(groupLabels)
        .map((key) => ({ key, label: groupLabels[key], items: nav.filter((n) => n.group === key) }))
        .filter((g) => g.items.length > 0)
    : [{ key: 'all', label: '', items: nav }];

  const item = (it: NavItem) => (
    <Link key={it.href} href={it.href} className={active === it.href ? 'nav-i-on' : 'nav-i'}>
      {it.icon ? <span className="ic" aria-hidden>{it.icon}</span> : null}
      <span className="truncate">{it.label}</span>
      {it.pill ? <span className="nav-pill num">{formatNumber(it.pill)}</span> : null}
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg" data-layer="soft">
      <header className="sticky top-0 z-30 bg-brand text-white">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4">
          <Link href="/" className="shrink-0 font-cerem text-xl text-white">برقية</Link>
          <div className="flex items-center gap-3">
            {search ? <CommandSearch /> : null}
            <div className="hidden text-start sm:block">
              <div className="text-[13px] font-semibold leading-tight">{userName}</div>
              {userSub ? <div className="text-[11px] leading-tight text-white/60">{userSub}</div> : null}
            </div>
            <form action={signOut}>
              <button type="submit" className="text-[12.5px] text-white/70 hover:text-white">
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-start gap-5 px-4 py-6 lg:flex-row">
        <aside className="side-panel">
          {backHref ? (
            <Link href={backHref} className="back-acct">← {backLabel ?? 'رجوع'}</Link>
          ) : null}

          {host ? (
            <div className="side-host">
              <div className="l">{host.label}</div>
              <div className="h">{host.name}</div>
              {host.sub ? <div className="o">{host.sub}</div> : null}
            </div>
          ) : null}

          <nav className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <div key={g.key} className="contents">
                {g.label ? <div className="nav-group">{g.label}</div> : null}
                {g.items.map(item)}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-line py-4 text-center text-[12px] text-muted">
        <Logo size="sm" /> — إدارة دعوات المناسبات
      </footer>
    </div>
  );
}
