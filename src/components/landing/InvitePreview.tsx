/**
 * بطاقة الدعوة — العنصر المميّز للهوية (SPEC §2).
 * خلفية خضراء متدرّجة، إطاران ذهبيان متداخلان، مونوجرام «ب»،
 * وباركود مصغّر أسفلها.
 */
export function InvitePreview({
  kicker = 'بمناسبة حفل الزفاف',
  hostLine = 'تتشرّف',
  hostName = 'أسرة العبدالله',
  bodyLine = 'بدعوتكم لمشاركتهم فرحتهم',
  occasionLine = 'وليمة العُرس',
  dateLine = 'مساء الخميس · ١٤ شوال',
}: {
  kicker?: string;
  hostLine?: string;
  hostName?: string;
  bodyLine?: string;
  occasionLine?: string;
  dateLine?: string;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-sm px-8 py-10 text-center"
      style={{ background: 'linear-gradient(160deg,#1A4433,#123528)' }}
    >
      {/* إطاران ذهبيان متداخلان */}
      <div className="pointer-events-none absolute inset-3 border border-gold-soft/35" aria-hidden />
      <div className="pointer-events-none absolute inset-5 border border-gold-soft/20" aria-hidden />

      <div className="relative">
        <div className="mx-auto grid h-13 w-13 place-items-center rounded-full border border-gold-soft/70
                        font-cerem text-2xl text-gold-soft"
             style={{ width: 52, height: 52 }}>
          ب
        </div>

        <p className="mt-4 text-[11px] tracking-[3px] text-gold-soft">{kicker}</p>

        <h3 className="mt-4 font-display text-[15px] font-normal leading-[2] text-[#F5EEDC]">
          {hostLine}
          <br />
          <span className="font-cerem text-[26px] text-white">{hostName}</span>
          <br />
          {bodyLine}
        </h3>

        <p className="mt-3 font-display text-[17px] text-gold-soft">{occasionLine}</p>

        <div className="my-5 flex items-center justify-center gap-2.5" aria-hidden>
          <span className="h-px w-12" style={{ background: 'linear-gradient(90deg,transparent,#D8BE86)' }} />
          <span className="rotate-45 text-[7px] text-gold-soft">◆</span>
          <span className="h-px w-12" style={{ background: 'linear-gradient(90deg,#D8BE86,transparent)' }} />
        </div>

        <p className="text-[12.5px] leading-7 text-white/75 num">{dateLine}</p>

        {/* باركود مصغّر */}
        <div className="mx-auto mt-6 grid h-14 w-14 grid-cols-4 grid-rows-4 gap-[2px] bg-white/95 p-1.5"
             aria-label="رمز الدخول">
          {[1,0,1,1, 0,1,1,0, 1,1,0,1, 1,0,1,0].map((on, i) => (
            <span key={i} className={on ? 'bg-[#123528]' : 'bg-transparent'} />
          ))}
        </div>
        <p className="mt-2 text-[10px] tracking-[2px] text-gold-soft/80">بطاقة الدخول</p>
      </div>
    </div>
  );
}

/** المسطرة الذهبية — فاصل عناوين الأقسام. */
export function GoldRule() {
  return (
    <div className="rule" aria-hidden>
      <span>◆</span>
    </div>
  );
}
