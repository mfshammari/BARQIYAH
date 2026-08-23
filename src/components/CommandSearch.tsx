'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { globalSearch, type SearchHit } from '@/app/admin/searchActions';

const KIND_LABELS: Record<SearchHit['kind'], string> = {
  client: 'عميل',
  event: 'مناسبة',
  guest: 'مدعو',
};

/** بحث عام يفتح بـ ⌘K أو Ctrl+K (SPEC §9.6). */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQuery(''); setHits([]); }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      startTransition(async () => setHits(await globalSearch(query)));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5
                   text-[12px] text-white/70 hover:text-white sm:flex"
      >
        بحث
        <kbd className="rounded border border-white/25 px-1 text-[10px]">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن عميل أو مناسبة أو مدعو…"
              className="w-full border-b border-line bg-surface px-4 py-3.5 text-[14px] outline-none"
            />

            <div className="max-h-80 overflow-y-auto">
              {pending ? (
                <p className="p-4 text-center text-[13px] text-muted">جارٍ البحث…</p>
              ) : query.trim().length < 2 ? (
                <p className="p-4 text-center text-[12.5px] text-muted">اكتب حرفين على الأقل.</p>
              ) : hits.length === 0 ? (
                <p className="p-4 text-center text-[13px] text-muted">لا نتائج.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {hits.map((h) => (
                    <li key={`${h.kind}-${h.id}`}>
                      <button
                        type="button"
                        onClick={() => { setOpen(false); router.push(h.href); }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-right hover:bg-panel"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold">{h.title}</span>
                          <span className="block truncate text-[11.5px] text-muted num">{h.subtitle}</span>
                        </span>
                        <span className="badge shrink-0 border border-line bg-panel text-muted">
                          {KIND_LABELS[h.kind]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-t border-line bg-panel px-4 py-2 text-[11px] text-muted">
              بيانات المدعوين للدعم التشغيلي فقط — لا تُصدَّر ولا تُستخدم للتسويق.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
