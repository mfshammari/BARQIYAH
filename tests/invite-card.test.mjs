// اختبار بطاقة الدعوة المولَّدة: بناء SVG وتحويله إلى PNG بخطوط الملفات.
//   node tests/invite-card.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  buildInviteCardSvg, wrapText, escapeXml, CARD_WIDTH, CARD_HEIGHT,
} from '../.test-build/lib/inviteCard.js';

const require = createRequire(import.meta.url);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('بناء SVG البطاقة:');

const input = {
  host: 'أم حمودي',
  occasion: 'زواج ابني حمودي',
  dateLine: 'الجمعة ٢٦ شوال ١٤٤٨ هـ',
  venue: 'قصر ٣٣ للاحتفالات',
  time: '٠٩:٠٠ مساءً',
};

test('يحوي النصّين وسطر الموعد والمكان والوقت', () => {
  const svg = buildInviteCardSvg(input);
  for (const s of [input.host, input.occasion, input.dateLine, input.venue, input.time]) {
    assert.ok(svg.includes(s), `ينقص «${s}»`);
  }
  assert.ok(svg.includes(`width="${CARD_WIDTH}"`) && svg.includes(`height="${CARD_HEIGHT}"`));
});

test('الأبعاد ١٠٨٠×١٣٥٠ (نسبة ٤:٥)', () => {
  assert.equal(CARD_WIDTH / CARD_HEIGHT, 4 / 5);
});

test('عناصر التصميم: تدرّج أخضر وإطاران ومونوجرام ومسطرة', () => {
  const svg = buildInviteCardSvg(input);
  assert.ok(svg.includes('#1A4433') && svg.includes('#123528'));
  assert.equal((svg.match(/<rect[^>]*fill="none"[^>]*stroke=/g) ?? []).length, 2, 'إطاران');
  assert.ok(svg.includes('>ب</text>'), 'المونوجرام');
  assert.ok(svg.includes('<polygon'), 'المعيّن ◆');
});

test('نصوص المستخدم تُهرَّب (XML)', () => {
  const svg = buildInviteCardSvg({ ...input, host: 'أبو <خالد> & "الفهد"' });
  assert.ok(!svg.includes('<خالد>'));
  assert.ok(svg.includes('&lt;خالد&gt; &amp; &quot;الفهد&quot;'));
  assert.equal(escapeXml("a'b"), 'a&apos;b');
});

test('اللفّ على الكلمات بسطرين كحدّ أقصى', () => {
  assert.deepEqual(wrapText('أم عبدالله الفالح', 10), ['أم عبدالله', 'الفالح']);
  const lines = wrapText('كلمة '.repeat(12).trim(), 12);
  assert.equal(lines.length, 2);
  assert.deepEqual(wrapText('', 10), []);
});

console.log('\nالتحويل إلى PNG بخطوط الملفات:');

test('resvg يحوّل البطاقة إلى PNG صالح بلا خطوط نظام', () => {
  const { Resvg } = require('@resvg/resvg-js');
  const dir = join(process.cwd(), 'public', 'fonts');
  const fontFiles = [
    'amiri-arabic-700-normal.ttf', 'amiri-arabic-400-normal.ttf',
    'amiri-latin-700-normal.ttf', 'amiri-latin-400-normal.ttf',
    'ibm-plex-sans-arabic-arabic-400-normal.ttf', 'ibm-plex-sans-arabic-latin-400-normal.ttf',
  ].map((f) => join(dir, f));
  const r = new Resvg(buildInviteCardSvg(input), {
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Amiri' },
  });
  const png = r.render().asPng();
  assert.ok(png.length > 20_000, `PNG صغير جداً: ${png.length}`);
  // توقيع PNG
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
