// اختبار قيود متغيّرات القالب (قيود Meta).
//   node tests/invite-vars.test.mjs
import assert from 'node:assert/strict';
import { validateInviteVars, renderInvite, MAX_VAR_LENGTH }
  from '../.test-build/lib/inviteVars.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const ok = { host: 'أم حمودي', occasion: 'زواج ابني حمودي' };

console.log('التحقق من متغيّرات الداعي:');

test('القيم السليمة تمرّ', () => {
  assert.deepEqual(validateInviteVars(ok), []);
});

test('الفارغ يُرفض', () => {
  assert.equal(validateInviteVars({ host: '', occasion: 'زواج' }).length, 1);
  assert.equal(validateInviteVars({ host: '   ', occasion: 'زواج' }).length, 1);
});

test('الروابط تُرفض — واتساب يرفض القالب', () => {
  for (const bad of ['زواج https://x.com', 'زفة www.hall.sa', 'قاعة alqasr.com']) {
    const issues = validateInviteVars({ ...ok, occasion: bad });
    assert.ok(issues.some((i) => /روابط/.test(i.message)), `يُفترض رفض «${bad}»`);
  }
});

test('الأسطر الجديدة تُرفض', () => {
  const issues = validateInviteVars({ ...ok, occasion: 'زواج\nابني' });
  assert.ok(issues.some((i) => /أسطر/.test(i.message)));
});

test('المسافات المتتالية والطرفية تُرفض', () => {
  assert.ok(validateInviteVars({ ...ok, host: 'أم  حمودي' }).some((i) => /متتالية/.test(i.message)));
  assert.ok(validateInviteVars({ ...ok, host: 'أم حمودي ' }).some((i) => /المسافات/.test(i.message)));
});

test('الطول الأقصى يُفرض', () => {
  const long = 'ا'.repeat(MAX_VAR_LENGTH + 1);
  assert.ok(validateInviteVars({ ...ok, host: long }).some((i) => /أطول/.test(i.message)));
  assert.deepEqual(validateInviteVars({ ...ok, host: 'ا'.repeat(MAX_VAR_LENGTH) }), []);
});

test('الرموز غير المدعومة تُرفض', () => {
  assert.ok(validateInviteVars({ ...ok, host: 'أم {حمودي}' }).some((i) => /رموز/.test(i.message)));
});

test('حقل واحد فاسد لا يخفي الآخر', () => {
  const issues = validateInviteVars({ host: '', occasion: '' });
  assert.equal(issues.filter((i) => i.field === 'host').length, 1);
  assert.equal(issues.filter((i) => i.field === 'occasion').length, 1);
});

console.log('\nبناء نص الدعوة:');

test('النص يجمع المتغيّرات وسطر الموعد', () => {
  const line = 'الجمعة ٢٦ شوال ١٤٤٨ هـ · قصر ٣٣ · ٠٩:٠٠ مساءً';
  const out = renderInvite(ok, line);
  assert.equal(out, `تتشرّف أم حمودي بدعوتكم لحضور زواج ابني حمودي — ${line}`);
});

test('داعيان مختلفان ينتجان نصّين مختلفين بنفس القالب', () => {
  const line = 'الجمعة ٢٦ شوال';
  const a = renderInvite({ host: 'أم حمودي', occasion: 'زواج ابني حمودي' }, line);
  const b = renderInvite({ host: 'أم سوسو', occasion: 'زواج ابنتي سوسو' }, line);
  assert.notEqual(a, b);
  assert.ok(a.includes(line) && b.includes(line), 'وسطر الموعد واحد في الاثنين');
});

test('القيم الناقصة تُعرض كنقاط في المعاينة', () => {
  assert.match(renderInvite({}, 'الموعد'), /…/);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
