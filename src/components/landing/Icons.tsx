/** أيقونات صفحة الهبوط — خطّية بحدّ ١٫٥، مطابقة للنموذج. */

const P: Record<string, string[]> = {
  plus: ['M12 5v14M5 12h14'],
  doc: ['M8 8h8M8 12h8M8 16h5'],
  chat: ['M21 11.5a8.4 8.4 0 01-11.9 7.6L3 21l1.9-6A8.5 8.5 0 1121 11.5z'],
  qr: ['M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3'],
  check: ['M20 6L9 17l-5-5'],
  people: ['M3 20a6 6 0 0112 0M16 6a3 3 0 010 6M18 20a6 6 0 00-3-5'],
  chart: ['M3 3v18h18', 'M7 14l4-4 3 3 5-6'],
  star: ['M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.5 5.7 21l2.3-7.1-6-4.5h7.6z'],
};

export type IconName = keyof typeof P | 'docRect' | 'seats' | 'qrBox' | 'peopleFull';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {name === 'peopleFull' ? (
        <>
          <circle cx="9" cy="8" r="3" />
          {P.people.map((d) => <path key={d} d={d} />)}
        </>
      ) : name === 'docRect' ? (
        <>
          <rect x="4" y="3" width="16" height="18" />
          {P.doc.map((d) => <path key={d} d={d} />)}
        </>
      ) : name === 'seats' ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <path d="M3 9h18" />
        </>
      ) : name === 'qrBox' ? (
        <>
          {P.qr.map((d) => <path key={d} d={d} />)}
          <rect x="9" y="9" width="6" height="6" />
        </>
      ) : (
        P[name].map((d) => <path key={d} d={d} />)
      )}
    </svg>
  );
}
