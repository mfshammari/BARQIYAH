'use client';

import { useEffect, useState } from 'react';
import { AccountsExemptionAdmin } from '@/components/exemptions/AccountsExemptionAdmin';
import { ADMINS, resetMock, setActor } from '@/lib/exemptions/mock';

const ACTOR_KEY = 'barqiyah.exemptions.actor';

/** مفتاح تطوير فقط: من ينفّذ الطلبات (سوبر أدمن أو دعم) وإعادة البيانات. */
export function AdminPreview() {
  const [actorId, setActorId] = useState(ADMINS[0].id);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let id = ADMINS[0].id;
    try {
      const saved = window.localStorage.getItem(ACTOR_KEY);
      if (saved && ADMINS.some((a) => a.id === saved)) id = saved;
    } catch { /* بلا تخزين */ }
    setActor(ADMINS.find((a) => a.id === id) ?? ADMINS[0]);
    setActorId(id);
    setReady(true);
  }, []);

  function choose(id: string) {
    const a = ADMINS.find((x) => x.id === id) ?? ADMINS[0];
    setActor(a);
    setActorId(a.id);
    try { window.localStorage.setItem(ACTOR_KEY, a.id); } catch { /* بلا تخزين */ }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gold-line bg-paper px-3.5 py-2.5 text-[12.5px]">
        <span className="font-semibold text-muted">مفتاح تطوير · الجلسة الحالية</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="الجلسة الحالية">
          {ADMINS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={actorId === a.id}
              onClick={() => choose(a.id)} className={actorId === a.id ? 'tab-on' : 'tab'}>
              {a.name} · {a.role === 'admin_owner' ? 'سوبر أدمن' : 'دعم'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { void resetMock().then(() => setEpoch((n) => n + 1)); }}
          className="ms-auto text-[12px] text-muted hover:text-danger">
          إعادة البيانات التجريبية
        </button>
      </div>
      {ready ? <AccountsExemptionAdmin key={`${actorId}-${epoch}`} /> : null}
    </>
  );
}
