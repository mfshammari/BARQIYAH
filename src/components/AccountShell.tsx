import Link from 'next/link';
import { signOut } from '@/app/login/actions';

/**
 * هيكل مستوى الحساب (مناسباتي، دفتر العناوين، الفواتير، مساحة الداعي):
 * شريط علوي فاتح بقائمة منسدلة — بلا قائمة جانبية، كما في النموذج.
 * الشريط الجانبي يظهر داخل المناسبة وفي لوحة الإدارة وحدهما.
 */
export function AccountShell({
  userName, userSub, children, crumb,
}: {
  userName: string;
  userSub?: string;
  children: React.ReactNode;
  /** فتات المسار لصفحات المستوى الثاني */
  crumb?: React.ReactNode;
}) {
  const initial = userName.trim().charAt(0) || 'ب';

  return (
    <div className="flex min-h-screen flex-col bg-bg" data-layer="soft">
      <div className="mx-auto w-full max-w-[1120px] flex-1 px-4">
        <div className="acct-top">
          <Link href="/app" className="acct-brand">
            برقية<span className="dot">.</span>
          </Link>

          <div className="group acct-me">
            <div className="acct-av" aria-hidden>{initial}</div>
            <div>
              <div className="acct-n">{userName}</div>
              {userSub ? <div className="acct-s">{userSub}</div> : null}
            </div>
            <span className="text-[13px] text-muted" aria-hidden>⌄</span>

            <div className="acct-drop">
              <Link href="/app">مناسباتي</Link>
              <Link href="/app/settings">حسابي</Link>
              <Link href="/app/billing">المدفوعات والفواتير</Link>
              <Link href="/app/contacts">دفتر العناوين</Link>
              <hr />
              <form action={signOut}>
                <button type="submit">تسجيل الخروج</button>
              </form>
            </div>
          </div>
        </div>

        {crumb}
        <div className="pb-8">{children}</div>
      </div>

      <footer className="border-t border-line py-4 text-center text-[12px] text-muted">
        برقية — إدارة دعوات المناسبات
      </footer>
    </div>
  );
}
