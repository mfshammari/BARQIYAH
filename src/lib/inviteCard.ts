/**
 * بطاقة الدعوة المولَّدة — SVG خالص بلا اعتماد على البيئة (يُختبر مستقلاً).
 *
 * التصميم من SPEC §2 (signature): خلفية خضراء متدرّجة
 * linear-gradient(160deg,#1A4433,#123528)، إطاران ذهبيان متداخلان، مونوجرام
 * «ب» في دائرة، النصّان {{1}}/{{2}} بخط Amiri، سطر الموعد والمكان بخط
 * IBM Plex Sans Arabic، والمسطرة الذهبية ◆. الأبعاد ١٠٨٠×١٣٥٠ (نسبة ٤:٥
 * تناسب رأس واتساب).
 *
 * التحويل إلى PNG يتم في المسار بـ resvg (تشكيل عربي صحيح عبر rustybuzz).
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export const FONT_AMIRI = 'Amiri';
export const FONT_PLEX = 'IBM Plex Sans Arabic';

export interface InviteCardInput {
  /** {{1}} الجهة الداعية */
  host: string;
  /** {{2}} وصف المناسبة */
  occasion: string;
  /** «الجمعة ٢٦ شوال ١٤٤٨ هـ» */
  dateLine: string;
  venue?: string | null;
  /** «٠٩:٠٠ مساءً» */
  time?: string | null;
}

/** فواصل ليست في مجموعة الحروف العربية للخطوط المقسّمة (— · •) → شرطة عربية. */
export function normalizeSeparators(s: string): string {
  return s.replace(/[\u2012-\u2015\u00B7\u2022\u2027]/g, '\u2010');
}

/** هروب XML — النصوص من المستخدم. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * لفّ النص على الكلمات بحدّ أقصى من الأحرف للسطر (تقدير عرض العربية).
 * أقصى سطرين: ما زاد يُدمج في الأخير.
 */
export function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(' '));
    return head;
  }
  return lines;
}

/** حجم الخط يتناسب عكسياً مع أطول سطر كي لا يخرج عن الإطار. */
function fitFontSize(lines: string[], base: number, min: number, usableWidth: number, avgEm: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const fitted = Math.floor(usableWidth / (longest * avgEm));
  return Math.max(min, Math.min(base, fitted));
}

function textLines(
  lines: string[], y: number, size: number, family: string, fill: string, weight = 700, lineHeight = 1.5,
): { svg: string; bottom: number } {
  const parts: string[] = [];
  let cy = y;
  for (const line of lines) {
    parts.push(
      `<text x="${CARD_WIDTH / 2}" y="${cy}" font-family="${family}" font-weight="${weight}" ` +
      `font-size="${size}" fill="${fill}" text-anchor="middle" direction="rtl" ` +
      `xml:lang="ar">${escapeXml(line)}</text>`,
    );
    cy += Math.round(size * lineHeight);
  }
  return { svg: parts.join('\n'), bottom: cy - Math.round(size * lineHeight) };
}

/** المسطرة الذهبية: خط رفيع متلاشٍ الطرفين بمعيّن ◆ في وسطه (مرسوم لا نصّ). */
function goldRule(y: number): string {
  const cx = CARD_WIDTH / 2;
  return `
    <line x1="${cx - 220}" y1="${y}" x2="${cx - 22}" y2="${y}" stroke="url(#ruleR)" stroke-width="2"/>
    <line x1="${cx + 22}" y1="${y}" x2="${cx + 220}" y2="${y}" stroke="url(#ruleL)" stroke-width="2"/>
    <polygon points="${cx},${y - 9} ${cx + 9},${y} ${cx},${y + 9} ${cx - 9},${y}" fill="#D8BE86"/>`;
}

/** يبني SVG البطاقة كاملاً. */
export function buildInviteCardSvg(input: InviteCardInput): string {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const usable = W - 2 * 130;

  const hostLines = wrapText(normalizeSeparators(input.host) || '…', 22);
  const hostSize = fitFontSize(hostLines, 72, 44, usable, 0.55);

  const occLines = wrapText(normalizeSeparators(input.occasion) || '…', 24);
  const occSize = fitFontSize(occLines, 64, 40, usable, 0.55);

  const dateLines = wrapText(normalizeSeparators(input.dateLine || ''), 30);
  const venueLines = input.venue ? wrapText(normalizeSeparators(input.venue), 32) : [];
  const timeLines = input.time ? [normalizeSeparators(input.time)] : [];

  // الترتيب العمودي
  let y = 300;
  const monogramY = 215;
  const kicker = `<text x="${W / 2}" y="${y}" font-family="${FONT_PLEX}" font-size="26" fill="#D8BE86" ` +
    `letter-spacing="10" text-anchor="middle" direction="rtl">دعوة</text>`;
  y += 92;

  const intro1 = textLines(['تتشرّف'], y, 40, FONT_AMIRI, '#D8BE86', 400);
  y = intro1.bottom + 90;
  const host = textLines(hostLines, y, hostSize, FONT_AMIRI, '#F5EEDC');
  y = host.bottom + 84;
  const intro2 = textLines(['بدعوتكم لحضور'], y, 40, FONT_AMIRI, '#D8BE86', 400);
  y = intro2.bottom + 86;
  const occ = textLines(occLines, y, occSize, FONT_AMIRI, '#F5EEDC');
  y = occ.bottom + 70;
  const rule = goldRule(y);
  y += 78;
  const date = textLines(dateLines, y, 34, FONT_PLEX, '#F5EEDC', 400, 1.5);
  y = date.bottom + (dateLines.length ? 58 : 0);
  const venue = textLines(venueLines, y, 32, FONT_PLEX, 'rgba(245,238,220,0.85)', 400, 1.5);
  y = venue.bottom + (venueLines.length ? 56 : 0);
  const time = textLines(timeLines, y, 32, FONT_PLEX, 'rgba(245,238,220,0.85)', 400, 1.5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(160 .5 .5)">
      <stop offset="0" stop-color="#1A4433"/>
      <stop offset="1" stop-color="#123528"/>
    </linearGradient>
    <linearGradient id="ruleR" x1="0" x2="1">
      <stop offset="0" stop-color="#D8BE86" stop-opacity="0"/>
      <stop offset="1" stop-color="#D8BE86"/>
    </linearGradient>
    <linearGradient id="ruleL" x1="0" x2="1">
      <stop offset="0" stop-color="#D8BE86"/>
      <stop offset="1" stop-color="#D8BE86" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- إطاران ذهبيان متداخلان -->
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="#B08A47" stroke-width="3"/>
  <rect x="66" y="66" width="${W - 132}" height="${H - 132}" fill="none" stroke="#D8BE86" stroke-opacity="0.55" stroke-width="1.5"/>
  <!-- مونوجرام «ب» في دائرة -->
  <circle cx="${W / 2}" cy="${monogramY}" r="54" fill="none" stroke="#D8BE86" stroke-width="2"/>
  <text x="${W / 2}" y="${monogramY + 26}" font-family="${FONT_AMIRI}" font-weight="700" font-size="68" fill="#D8BE86" text-anchor="middle" direction="rtl">ب</text>
  ${kicker}
  ${intro1.svg}
  ${host.svg}
  ${intro2.svg}
  ${occ.svg}
  ${rule}
  ${date.svg}
  ${venue.svg}
  ${time.svg}
  <!-- توقيع برقية -->
  <text x="${W / 2}" y="${H - 96}" font-family="${FONT_AMIRI}" font-size="30" fill="#B08A47" text-anchor="middle" direction="rtl">برقية</text>
</svg>`;
}
