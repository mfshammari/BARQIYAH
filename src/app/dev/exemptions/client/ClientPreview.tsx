'use client';

import { useEffect, useState } from 'react';
import { ExemptClientDemo } from '@/components/exemptions/ExemptClientDemo';
import { listAccounts, type MockAccount } from '@/lib/exemptions/mock';

const ACCOUNT_KEY = 'barqiyah.exemptions.account';

/** مفتاح تطوير فقط: أي حساب عميل نعرض. */
export function ClientPreview() {
  const [accounts, setAccounts] = useState<MockAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    void listAccounts().then((list) => {
      setAccounts(list);
      let id = list[0]?.id ?? null;
      try {
        const saved = window.localStorage.getItem(ACCOUNT_KEY);
        if (saved && list.some((a) => a.id === saved)) id = saved;
      } catch { /* بلا تخزين */ }
      setAccountId(id);
    });
  }, []);

  function choose(id: string) {
    setAccountId(id);
    try { window.localStorage.setItem(ACCOUNT_KEY, id); } catch { /* بلا تخزين */ }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gold-line bg-paper px-3.5 py-2.5 text-[12.5px]">
        <span className="font-semibold text-muted">مفتاح تطوير · الحساب</span>
        <select value={accountId ?? ''} onChange={(e) => choose(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]" aria-label="الحساب">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <a href="/dev/exemptions" className="ms-auto text-[12px] text-brand hover:underline">لوحة الأدمن ←</a>
      </div>
      {accountId ? <ExemptClientDemo key={accountId} accountId={accountId} /> : null}
    </>
  );
}
