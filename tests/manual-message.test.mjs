// اختبار نصّ رسالة واتساب اليدوية: القوالب والمتغيّرات والتوقيع.
//   node tests/manual-message.test.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATES, TEMPLATE_IDS, TEMPLATE_VARIABLES, LINK_VAR, MAX_TEMPLATE_CHARS,
  parseManualMessage, templateText, withTemplateText, validateTemplateText, ensureLinkVariable,
  parseSignBy, resolveSignerNames, resolveSignature, joinNames, buildMessage,
} from '../.test-build/lib/manualMessage.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('رسالة واتساب اليدوية:');

const vars = {
  guestName: 'خالد الفهد',
  occasion: 'زواج ابني محمد',
  date: 'الجمعة ٢٦ شوال ١٤٤٨ هـ · ٠٩:٠٠ مساءً',
  venue: 'قاعة اليخت',
  link: 'https://barqiyah.vercel.app/rsvp/0b7e3c1e-1111-4222-8333-444455556666',
  signature: 'الداعي: فالح الشمري',
};

test('ثلاثة قوالب تبدأ كلها بالسلام الكامل وتحمل الرابط والتوقيع', () => {
  assert.deepEqual(TEMPLATE_IDS, ['formal', 'friendly', 'brief']);
  for (const id of TEMPLATE_IDS) {
    const t = DEFAULT_TEMPLATES[id].text;
    assert.ok(t.startsWith('السلام عليكم ورحمة الله وبركاته'), id);
    assert.ok(t.includes(LINK_VAR), id);
    assert.ok(t.includes('{التوقيع}'), id);
    for (const v of t.match(/\{[^}]+\}/g)) assert.ok(TEMPLATE_VARIABLES.includes(v), `${id}: ${v}`);
  }
});

test('الرسمي: «المكرّم فلان» ثم «يسرّنا دعوتكم» — النبرة المحسومة', () => {
  const lines = buildMessage(DEFAULT_TEMPLATES.formal.text, vars).split('\n');
  assert.equal(lines[0], 'السلام عليكم ورحمة الله وبركاته');
  assert.equal(lines[1], 'المكرّم خالد الفهد');
  assert.equal(lines[2], 'يسرّنا دعوتكم لحضور زواج ابني محمد');
  assert.equal(lines[3], vars.date);
  assert.equal(lines[4], 'قاعة اليخت');
  assert.equal(lines.at(-1), 'الداعي: فالح الشمري');
  assert.ok(lines.includes(vars.link));
});

test('حُذف {الرابط} من النص → يُضاف آخر الرسالة تلقائياً', () => {
  const noLink = 'السلام عليكم\nالمكرّم {الاسم}\n{التوقيع}';
  assert.equal(ensureLinkVariable(noLink), `${noLink}\n{الرابط}`);
  assert.equal(ensureLinkVariable(DEFAULT_TEMPLATES.brief.text), DEFAULT_TEMPLATES.brief.text);
  assert.equal(ensureLinkVariable('   '), '{الرابط}');
  const msg = buildMessage(noLink, vars);
  assert.ok(msg.endsWith(vars.link));
  assert.equal(msg.split('\n').filter((l) => l === vars.link).length, 1);
});

test('مكان غير محدّد: سطر {المكان} يُحذف ولا أسطر فارغة متتالية', () => {
  const msg = buildMessage(DEFAULT_TEMPLATES.formal.text, { ...vars, venue: '' });
  assert.ok(!msg.includes('{المكان}'));
  assert.ok(!msg.includes('\n\n\n'));
  assert.equal(msg.split('\n')[4], '');
});

test('متغيّر غير معروف يبقى كما هو ولا يُفسَّر', () => {
  assert.equal(buildMessage('{الاسم} {غريب} {الرابط}', vars), `خالد الفهد {غريب} ${vars.link}`);
});

test('قراءة jsonb القاعدة بأمان', () => {
  assert.deepEqual(parseManualMessage(null), { template: 'formal', texts: {} });
  assert.deepEqual(parseManualMessage({}), { template: 'formal', texts: {} });
  assert.deepEqual(parseManualMessage({ template: 'x', texts: 5 }), { template: 'formal', texts: {} });
  const cfg = parseManualMessage({ template: 'brief', texts: { brief: 'نصّي {الرابط}', formal: DEFAULT_TEMPLATES.formal.text, junk: 'x' } });
  assert.deepEqual(cfg, { template: 'brief', texts: { brief: 'نصّي {الرابط}' } });
  assert.equal(templateText(cfg), 'نصّي {الرابط}');
  assert.equal(templateText(cfg, 'friendly'), DEFAULT_TEMPLATES.friendly.text);
});

test('تعديل النص يُحفظ، وإرجاعه إلى الأصل يحذف التعديل', () => {
  let cfg = { template: 'formal', texts: {} };
  cfg = withTemplateText(cfg, 'formal', 'مرحباً {الاسم}');
  assert.deepEqual(cfg.texts, { formal: 'مرحباً {الاسم}' });
  cfg = withTemplateText(cfg, 'formal', DEFAULT_TEMPLATES.formal.text);
  assert.deepEqual(cfg.texts, {});
});

test('تحقّق النص: فارغ أو أطول من الحدّ يُرفض', () => {
  assert.equal(validateTemplateText('  '), 'نصّ الرسالة فارغ.');
  assert.equal(validateTemplateText('x'.repeat(MAX_TEMPLATE_CHARS)), null);
  assert.ok(validateTemplateText('x'.repeat(MAX_TEMPLATE_CHARS + 1)));
});

test('التوقيع: صاحب المناسبة وحده بلا خيار، والداعي الفرعي ثلاثة خيارات', () => {
  const owner = { ownerName: 'فالح الشمري', subName: null };
  for (const s of ['both', 'owner', 'sub']) {
    assert.deepEqual(resolveSignerNames(owner, s), ['فالح الشمري']);
    assert.equal(resolveSignature(owner, s), 'الداعي: فالح الشمري');
  }
  const pair = { ownerName: 'فالح الشمري', subName: 'أم سوسو' };
  assert.deepEqual(resolveSignerNames(pair, 'both'), ['فالح الشمري', 'أم سوسو']);
  assert.deepEqual(resolveSignerNames(pair, 'owner'), ['فالح الشمري']);
  assert.deepEqual(resolveSignerNames(pair, 'sub'), ['أم سوسو']);
  assert.equal(resolveSignature(pair, 'both'), 'الداعيان: فالح الشمري وأم سوسو');
  assert.equal(resolveSignature(pair, 'sub'), 'الداعي: أم سوسو');
  assert.equal(joinNames(['أ', 'ب']), 'أ وب');
});

test('parseSignBy: قيمة غير صالحة تعود إلى الافتراضي', () => {
  assert.equal(parseSignBy('sub'), 'sub');
  assert.equal(parseSignBy('x'), 'both');
  assert.equal(parseSignBy(null, 'owner'), 'owner');
});

console.log(`\n${passed} اختبارات نجحت.`);
