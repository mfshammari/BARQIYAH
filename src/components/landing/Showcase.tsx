import { formatNumber } from '@/lib/format';

/**
 * «داخل المنصة» — أربع لوحات تُري العميل ما سيراه فعلاً.
 * كل لوحة: عنوان ووصف ونقاط، ومعاينة مصغّرة للشاشة الحقيقية.
 */
export interface ShowcaseBlock {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
  /** لوحة الجوّال لا تُحاط بإطار لقطة الشاشة */
  bare?: boolean;
}

export function ShowcaseRow({ block }: { block: ShowcaseBlock }) {
  return (
    <div className={`sc-row ${block.flip ? 'lg:[direction:ltr]' : ''}`}>
      <div className={block.flip ? 'lg:[direction:rtl]' : ''}>
        <p className="text-[12px] font-semibold tracking-[3px] text-gold">{block.eyebrow}</p>
        <h3 className="mt-3 font-display text-[clamp(22px,3vw,30px)] font-bold leading-snug text-brand">
          {block.title}
        </h3>
        <p className="mt-3 text-[14.5px] leading-8 text-muted">{block.body}</p>
        <ul className="mt-5 space-y-2.5">
          {block.points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={block.flip ? 'lg:[direction:rtl]' : ''}>
        {block.bare ? (
          block.visual
        ) : (
          <div className="sc-shot" style={{ boxShadow: '0 24px 48px -28px rgba(21,58,43,.4)' }}>
            <div className="shot-bar" aria-hidden><i /><i /><i /></div>
            {block.visual}
          </div>
        )}
      </div>
    </div>
  );
}

/** معاينة لوحة الرصيد بثلاث حالات. */
export function BalanceVisual() {
  return (
    <div className="p-5">
      <div className="mb-4 text-[12px] font-semibold text-muted">لوحة المعلومات</div>
      <div className="grid grid-cols-3 gap-3">
        {[['متاح', 284, 'text-brand bg-brand-soft'], ['محجوز', 13, 'text-warn bg-warn-soft'], ['مؤكّد', 103, 'text-ok bg-ok-soft']]
          .map(([label, value, cls]) => (
            <div key={String(label)} className={`rounded-xl px-3 py-3 ${String(cls).split(' ')[1]}`}>
              <div className={`font-ui text-xl font-extrabold num leading-none ${String(cls).split(' ')[0]}`}>
                {formatNumber(Number(value))}
              </div>
              <div className="mt-1.5 text-[11px] text-muted">{label}</div>
            </div>
          ))}
      </div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full border border-line bg-panel">
        <div className="h-full w-[26%] bg-ok" />
        <div className="h-full w-[4%] bg-warn" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
        {[['مُرسل', 187], ['أكّد', 103], ['اعتذر', 21], ['حضر', 64]].map(([l, v]) => (
          <div key={String(l)}>
            <div className="font-ui text-[15px] font-bold num">{formatNumber(Number(v))}</div>
            <div className="text-[10.5px] text-muted">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** معاينة جدول المدعوين مع زر الإرسال الجماعي. */
export function GuestsVisual() {
  const rows = [
    ['تركي الدوسري', 5, 'مسودة', 'bg-panel text-muted border border-line'],
    ['منصور العنزي', 6, 'مسودة', 'bg-panel text-muted border border-line'],
    ['خالد الفهد', 2, 'أكّد', 'bg-ok-soft text-ok'],
    ['فيصل المطيري', 7, 'بانتظار', 'bg-info-soft text-info'],
  ] as const;

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted num">المدعوون · ١٨٧</span>
        <span className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white num">
          إرسال ٣ مسودات ➤
        </span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10.5px] text-muted">
            <th className="pb-2 text-right font-semibold">الاسم</th>
            <th className="pb-2 text-right font-semibold">المقاعد</th>
            <th className="pb-2 text-right font-semibold">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, seats, status, cls]) => (
            <tr key={name} className="border-t border-line">
              <td className="py-2 font-semibold">{name}</td>
              <td className="py-2 num">{formatNumber(seats)}</td>
              <td className="py-2"><span className={`badge ${cls}`}>{status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** معاينة رحلة المقعد: حجز ← رد ← عودة الفارق. */
export function SeatsVisual() {
  const steps = [
    { n: '٠١', t: 'أرسلت الدعوة', big: '٥ مقاعد', sub: 'محجوزة · بانتظار الرد', tone: 'text-warn bg-warn-soft' },
    { n: '٠٢', t: 'ردّ المدعو', big: 'سنحضر ٢', sub: 'اختار عدداً أقل من الحد الأقصى', tone: 'text-info bg-info-soft' },
    { n: '٠٣', t: 'عاد الفارق لرصيدك', big: '٣ عادت لك', sub: '٢ مؤكّدة', tone: 'text-ok bg-ok-soft' },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s) => (
        <div key={s.n} className={`rounded-xl border border-gold-line p-4 ${s.tone.split(' ')[1]}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="font-display text-[13px] font-bold text-gold num">{s.n}</span>
              <span className="ms-2 text-[13px] font-semibold text-ink">{s.t}</span>
            </div>
            <span className={`font-ui text-[15px] font-extrabold num ${s.tone.split(' ')[0]}`}>{s.big}</span>
          </div>
          <p className="mt-1 text-[11.5px] text-muted num">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** معاينة شاشة المسح عند الباب. */
export function ScanVisual() {
  return (
    <div className="ph">
      <div className="ph-in">
        <div className="ph-t">بوابة الرجال</div>
        <div className="ph-box" aria-hidden>✓</div>
        <div className="ph-res">
          خالد الفهد
          <span className="num">مسح ٢ من ٤ · حضر</span>
        </div>
      </div>
    </div>
  );
}
