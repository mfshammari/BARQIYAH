import 'server-only';
import sharp from 'sharp';
import { OG_JPEG_QUALITIES, OG_MAX_BYTES, OG_MAX_EDGE } from '@/lib/inviteOg';

/**
 * يحوّل صورة (PNG/JPEG/WebP) إلى JPEG لمعاينة واتساب: أكبر ضلع ١٢٠٠ بكسل،
 * ويخفّض الجودة تدريجياً حتى يقلّ الحجم عن ٣٠٠ KB. آخر محاولة تُقبل كما هي.
 */
export async function toOgJpeg(input: Buffer): Promise<Buffer> {
  const base = sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: OG_MAX_EDGE, height: OG_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#123528' });

  let out: Buffer = Buffer.alloc(0);
  for (const quality of OG_JPEG_QUALITIES) {
    out = await base.clone().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
    if (out.length <= OG_MAX_BYTES) return out;
  }
  return out;
}
