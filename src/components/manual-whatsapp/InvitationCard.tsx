import { formatNumber } from '@/lib/format';
import type { EventInfo } from '@/lib/manual-whatsapp/types';

/**
 * بطاقة الدعوة كما يراها المدعو: أخضر غامق متدرّج، إطار ذهبي مزدوج رفيع،
 * حواف ٢ بكسل كبطاقة مطبوعة. الاسم (الأسماء) بخط Aref Ruqaa.
 */
export function InvitationCard({
  event, inviterNames, seats,
}: {
  event: EventInfo;
  inviterNames: string[];
  seats: number;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[2px] px-6 pb-5 pt-7 text-center text-white shadow-pop"
      style={{ background: 'linear-gradient(160deg, #1A4433 0%, #123528 100%)' }}
    >
      {/* إطار ذهبي مزدوج */}
      <div className="pointer-events-none absolute inset-2 rounded-[2px] border border-gold-soft/70" aria-hidden />
      <div className="pointer-events-none absolute inset-3.5 rounded-[2px] border border-gold-soft/35" aria-hidden />

      <div className="relative">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-gold-soft/80 font-cerem text-[22px] leading-none text-gold-soft">
          <span className="relative top-[2px]">ب</span>
        </div>
        <p className="mt-3 text-[11.5px] tracking-[2px] text-gold-soft/80">بمناسبة حفل الزفاف</p>

        <p className="mt-5 font-display text-[15px] text-white/80">يتشرّف</p>
        <div className="mt-1 space-y-0.5">
          {inviterNames.map((n) => (
            <p key={n} className="font-cerem text-[26px] leading-[1.5] text-white">{n}</p>
          ))}
        </div>
        <p className="mt-2 font-display text-[15px] text-white/80">بدعوتكم لحضور</p>
        <h1 className="mt-1.5 font-display text-[22px] font-bold leading-[1.5] text-gold-soft">{event.title}</h1>

        <div className="my-4 flex items-center justify-center gap-2.5" aria-hidden>
          <span className="h-px w-14 bg-gradient-to-l from-transparent to-gold-soft/70" />
          <span className="text-[9px] text-gold-soft">◆</span>
          <span className="h-px w-14 bg-gradient-to-r from-transparent to-gold-soft/70" />
        </div>

        <p className="text-[14.5px] text-white/90 num">{event.dateText}</p>
        <p className="mt-1 text-[14px] text-white/80 num">{event.timeText}</p>
        <p className="mt-1 text-[14px] text-white/80">{event.venue}</p>

        <div className="mt-6 flex items-center justify-between border-t border-gold-soft/25 pt-3 text-[12px] text-white/70">
          <span className="font-cerem text-[18px] text-gold-soft">برقية</span>
          <span>المقاعد: <b className="num text-white">{formatNumber(seats)}</b></span>
        </div>
      </div>
    </div>
  );
}
