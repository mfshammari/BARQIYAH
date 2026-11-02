'use client';

import { useState } from 'react';
import { CELEBRANT_LABELS, OCCASION_LABELS, hasTwoCelebrants, type OccasionType } from '@/lib/types';

/** نوع المناسبة وأصحابها — خانتان للزواج وخانة واحدة بعنوان متبدّل لغيره (SPEC §3). */
export function OccasionFields({
  initialOccasion, celebrantPrimary, celebrantSecondary,
}: {
  initialOccasion: OccasionType;
  celebrantPrimary: string;
  celebrantSecondary: string;
}) {
  const [occasion, setOccasion] = useState<OccasionType>(initialOccasion);
  const two = hasTwoCelebrants(occasion);

  return (
    <>
      <div>
        <label className="label" htmlFor="occ">نوع المناسبة</label>
        <select id="occ" name="occasion_type" className="field" value={occasion}
          onChange={(e) => setOccasion(e.target.value as OccasionType)}>
          {(Object.keys(OCCASION_LABELS) as OccasionType[]).map((k) => (
            <option key={k} value={k}>{OCCASION_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className={`grid gap-4 ${two ? 'sm:grid-cols-2' : ''}`}>
        <div>
          <label className="label" htmlFor="c1">{two ? 'العريس' : CELEBRANT_LABELS[occasion]}</label>
          <input id="c1" name="celebrant_primary" className="field" defaultValue={celebrantPrimary} required />
        </div>
        {two ? (
          <div>
            <label className="label" htmlFor="c2">العروس <span className="font-normal text-muted">(اختياري)</span></label>
            <input id="c2" name="celebrant_secondary" className="field" defaultValue={celebrantSecondary} />
          </div>
        ) : null}
      </div>
    </>
  );
}
