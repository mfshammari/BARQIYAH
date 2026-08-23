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
  badge,
}: {
  kicker?: string;
  hostLine?: string;
  hostName?: string;
  bodyLine?: string;
  occasionLine?: string;
  dateLine?: string;
  /** وسم ذهبي معلّق على زاوية البطاقة */
  badge?: string;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[330px] px-7 py-9 text-center"
      style={{
        background: 'linear-gradient(160deg,#1A4433,#123528)',
        boxShadow: '0 30px 60px -20px rgba(21,58,43,.5)',
      }}
    >
      {badge ? <div className="invite-badge end-3">{badge}</div> : null}

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

        {/* الختم والباركود المصغّر على طرفَي السطر الأخير */}
        <div className="mt-6 flex items-center justify-between border-t border-gold-soft/20 pt-4">
          <span className="font-cerem text-[15px] text-gold-soft">برقية</span>
          <div className="grid h-11 w-11 grid-cols-4 grid-rows-4 gap-[2px] bg-white/95 p-1"
               aria-label="رمز الدخول">
            {[1,0,1,1, 0,1,1,0, 1,1,0,1, 1,0,1,0].map((on, i) => (
              <span key={i} className={on ? 'bg-[#123528]' : 'bg-transparent'} />
            ))}
          </div>
        </div>
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
