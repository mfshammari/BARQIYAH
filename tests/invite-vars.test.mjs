// اختبار قيود متغيّرات القالب (قيود Meta).
//   node tests/invite-vars.test.mjs
import assert from 'node:assert/strict';
import {
  validateInviteVars, renderInvite, MAX_VAR_LENGTH,
  hasInviteVars, buildInviteParams, fillTemplate, UNIFIED_TEMPLATE_BODY, defaultOccasionText,
} from '../.test-build/lib/inviteVars.js';

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

console.log('\nالقالب الموحّد (المرحلة ٣):');

test('المالك بلا invite_vars يُرفض إرساله', () => {
  assert.equal(hasInviteVars({}), false);
  assert.equal(hasInviteVars(null), false);
  assert.equal(hasInviteVars({ host: 'أم حمودي' }), false);
  assert.equal(hasInviteVars({ host: 'أم حمودي', occasion: '  ' }), false);
});

test('المالك والداعي بمتغيّرات كاملة يمرّان', () => {
  assert.equal(hasInviteVars({ host: 'أسرة العبدالله', occasion: 'زواج محمد' }), true);
  assert.equal(hasInviteVars(ok), true);
});

test('الداعي والمالك يرسلان ٣ متغيّرات دائماً', () => {
  const line = 'الجمعة ٢٦ شوال ١٤٤٨ هـ · قصر ٣٣';
  const owner = buildInviteParams({ host: 'أسرة العبدالله', occasion: 'زواج محمد وعريب' }, line);
  const inviter = buildInviteParams(ok, line);
  assert.equal(owner.length, 3);
  assert.equal(inviter.length, 3);
  assert.equal(owner[2], line);
  assert.equal(inviter[2], line);
  assert.deepEqual(inviter, ['أم حمودي', 'زواج ابني حمودي', line]);
});

test('renderInvite يطابق نص القالب الموحّد حرفاً بحرف', () => {
  const line = 'الجمعة ٢٦ شوال ١٤٤٨ هـ · قصر ٣٣ · ٠٩:٠٠ مساءً';
  const expected = UNIFIED_TEMPLATE_BODY
    .replace('{{1}}', ok.host).replace('{{2}}', ok.occasion).replace('{{3}}', line);
  assert.equal(renderInvite(ok, line), expected);
  assert.equal(renderInvite(ok, line), fillTemplate(UNIFIED_TEMPLATE_BODY, buildInviteParams(ok, line)));
  assert.equal(UNIFIED_TEMPLATE_BODY, 'تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}');
});

test('المعاينة في كل شاشة = الرسالة الفعلية (نفس الدالة نفس المتغيّرات)', () => {
  const line = 'الخميس ١ محرم';
  const preview = renderInvite(ok, line);
  const actual = fillTemplate(UNIFIED_TEMPLATE_BODY, buildInviteParams(ok, line));
  assert.equal(preview, actual);
});

test('وصف المناسبة الابتدائي للمالك: نوع المناسبة وأصحابها', () => {
  assert.equal(defaultOccasionText('حفل زواج', ['محمد', 'عريب']), 'حفل زواج محمد وعريب');
  assert.equal(defaultOccasionText('حفل تخرّج', ['سارة', null]), 'حفل تخرّج سارة');
  assert.equal(defaultOccasionText('مناسبة أخرى', [null, undefined]), 'مناسبة أخرى');
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
