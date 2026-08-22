import { OCCASION_LABELS, type OccasionType } from '@/lib/types';
import { formatDate } from '@/lib/format';

/** بطاقة الدعوة كما يراها المدعو — عربية، هادئة، ذهبية. */
export function InviteCard({
  hostName, occasion, eventDate, guestName, imageUrl, children,
}: {
  hostName: string;
  occasion: OccasionType;
  eventDate: string;
  guestName?: string;
  imageUrl?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <div className="card overflow-hidden">
        <div className="bg-brand text-center px-6 py-8 relative">
          <div
            className="absolute inset-3 rounded-xl border border-gold-soft/30 pointer-events-none"
            aria-hidden
          />
          <div className="relative">
            <div className="font-cerem text-gold-soft text-2xl">دعوة</div>
            <div className="mx-auto mt-3 h-px w-16 bg-gold-soft/40" />
            <p className="text-white/80 text-[13px] mt-4">يسرّنا دعوتكم لحضور</p>
            <h1 className="font-cerem text-white text-2xl mt-1.5">{OCCASION_LABELS[occasion]}</h1>
            <p className="text-gold-soft text-[15px] mt-3 font-semibold">{hostName}</p>
            <p className="text-white/70 text-[13px] mt-3 num">{formatDate(eventDate)}</p>
          </div>
        </div>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="صورة الدعوة" className="w-full object-cover max-h-72" />
        ) : null}

        <div className="card-pad">
          {guestName ? (
            <p className="text-center text-[14px] text-muted mb-4">
              الدعوة الخاصة بـ <b className="text-ink">{guestName}</b>
            </p>
          ) : null}
          {children}
        </div>
      </div>

      <p className="text-center text-[11.5px] text-muted mt-4">
        أُرسلت عبر <span className="font-cerem text-brand">برقية</span>
      </p>
    </div>
  );
}
