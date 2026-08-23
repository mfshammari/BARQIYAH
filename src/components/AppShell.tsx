import Link from 'next/link';
import { signOut } from '@/app/login/actions';
import { Logo } from '@/components/ui';
import { CommandSearch } from '@/components/CommandSearch';

export interface NavItem { href: string; label: string }

/** الهيكل العام للوحات (أدمن / صاحب مناسبة) — موبايل أولاً. */
export function AppShell({
  nav, active, userName, userSub, children, backHref, backLabel, search = false,
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
}) {
  return (
    <div className="min-h-screen flex flex-col" data-layer="soft">
      <header className="bg-brand text-white sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="font-cerem text-xl text-white shrink-0">برقية</Link>
            {backHref ? (
              <Link href={backHref} className="text-[12.5px] text-white/70 hover:text-white truncate">
                ← {backLabel ?? 'رجوع'}
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {search ? <CommandSearch /> : null}
            <div className="text-left hidden sm:block">
              <div className="text-[13px] font-semibold leading-tight">{userName}</div>
              {userSub ? <div className="text-[11px] text-white/60 leading-tight">{userSub}</div> : null}
            </div>
            <form action={signOut}>
              <button type="submit" className="text-[12.5px] text-white/70 hover:text-white">
                خروج
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-white/10">
          <nav className="mx-auto max-w-6xl px-4 flex gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                  active === item.href
                    ? 'border-gold-soft text-white'
                    : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>

      <footer className="border-t border-line py-4 text-center text-[12px] text-muted">
        <Logo size="sm" /> — إدارة دعوات المناسبات
      </footer>
    </div>
  );
}
