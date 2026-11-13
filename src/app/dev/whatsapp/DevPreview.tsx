'use client';

import { useEffect, useState } from 'react';
import { ManualWhatsAppDashboard } from '@/components/manual-whatsapp/ManualWhatsAppDashboard';
import { MOCK_EVENT_ID, resetMock, setViewer } from '@/lib/manual-whatsapp/mock';
import type { Viewer } from '@/lib/manual-whatsapp/types';

const VIEWER_KEY = 'barqiyah.manual-whatsapp.viewer';

/** مفتاح تطوير فقط: عرض اللوحة كصاحب المناسبة أو كالداعي الفرعي، وإعادة البيانات. */
export function DevPreview() {
  const [viewer, setViewerState] = useState<Viewer>('owner');
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let v: Viewer = 'owner';
    try {
      const saved = window.localStorage.getItem(VIEWER_KEY);
      if (saved === 'sub' || saved === 'owner') v = saved;
    } catch { /* بلا تخزين */ }
    setViewer(v);
    setViewerState(v);
    setReady(true);
  }, []);

  function choose(v: Viewer) {
    setViewer(v);
    setViewerState(v);
    try { window.localStorage.setItem(VIEWER_KEY, v); } catch { /* بلا تخزين */ }
  }

  async function reset() {
    await resetMock();
    setEpoch((n) => n + 1);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gold-line bg-paper px-3.5 py-2.5 text-[12.5px]">
        <span className="font-semibold text-muted">مفتاح تطوير · عرض اللوحة كـ</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="عرض اللوحة كـ">
          <button type="button" role="radio" aria-checked={viewer === 'owner'} onClick={() => choose('owner')}
            className={viewer === 'owner' ? 'tab-on' : 'tab'}>صاحب المناسبة</button>
          <button type="button" role="radio" aria-checked={viewer === 'sub'} onClick={() => choose('sub')}
            className={viewer === 'sub' ? 'tab-on' : 'tab'}>الداعي الفرعي</button>
        </div>
        <button type="button" onClick={() => { void reset(); }} className="ms-auto text-[12px] text-muted hover:text-danger">
          إعادة البيانات التجريبية
        </button>
      </div>
      {ready ? <ManualWhatsAppDashboard key={`${viewer}-${epoch}`} eventId={MOCK_EVENT_ID} viewer={viewer} /> : null}
    </>
  );
}
