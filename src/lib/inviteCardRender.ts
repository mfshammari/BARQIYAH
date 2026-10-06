import 'server-only';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { FONT_AMIRI } from '@/lib/inviteCard';

/**
 * تحويل SVG البطاقة إلى PNG بـ resvg.
 *
 * لماذا resvg لا next/og؟ satori (داخل next/og) لا يشكّل العربية ولا
 * يرتّب اتجاه الكلمات تشكيلاً صحيحاً (تحقّق عملي: الكلمات تنعكس والحروف
 * الأميرية تُسقط الدالة)، بينما resvg يشكّل عبر rustybuzz ويطبّق bidi.
 * الخطوط تُحمَّل من public/fonts كملفات — لا Google Fonts وقت التشغيل.
 */
const FONT_FILES = [
  'amiri-arabic-700-normal.ttf',
  'amiri-arabic-400-normal.ttf',
  'amiri-latin-700-normal.ttf',
  'amiri-latin-400-normal.ttf',
  'ibm-plex-sans-arabic-arabic-400-normal.ttf',
  'ibm-plex-sans-arabic-arabic-700-normal.ttf',
  'ibm-plex-sans-arabic-latin-400-normal.ttf',
  'ibm-plex-sans-arabic-latin-700-normal.ttf',
];

export function fontPaths(): string[] {
  const dir = join(process.cwd(), 'public', 'fonts');
  return FONT_FILES.map((f) => join(dir, f));
}

export function renderInviteCardPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: fontPaths(),
      defaultFontFamily: FONT_AMIRI,
    },
    fitTo: { mode: 'original' },
  });
  return Buffer.from(resvg.render().asPng());
}
