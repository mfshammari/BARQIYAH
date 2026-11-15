// اختبار الإرسال اليدوي عبر واتساب: نصّ الرسالة ورابط wa.me.
//   node tests/manual-invite.test.mjs
import assert from 'node:assert/strict';
import { buildManualMessage, buildWhatsAppUrl, waDigits } from '../.test-build/lib/manualInvite.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('الإرسال اليدوي عبر واتساب:');

const base = {
  guestName: 'خالد الفهد',
  occasion: 'زواج ابني محمد',
  eventLine: 'الجمعة ٢٦ شوال ١٤٤٨ هـ · قاعة اليخت · ٠٩:٠٠ مساءً',
  signature: 'فالح الشمري',
  link: 'https://barqiyah.vercel.app/rsvp/0b7e3c1e-1111-4222-8333-444455556666',
};

test('الرسالة تبدأ بالسلام ثم «المكرّم» وتنتهي بالتوقيع', () => {
  const lines = buildManualMessage(base).split('\n');
  assert.equal(lines[0], 'السلام عليكم ورحمة الله وبركاته');
  assert.equal(lines[1], 'المكرّم خالد الفهد');
  assert.equal(lines[2], 'يسرّنا دعوتكم لحضور زواج ابني محمد');
  assert.equal(lines.at(-1), 'فالح الشمري');
});

test('كل رسالة تحمل رابط المدعو على سطر مستقل', () => {
  assert.ok(buildManualMessage(base).split('\n').includes(base.link));
  assert.ok(buildManualMessage({ ...base, hasVideo: true }).split('\n').includes(base.link));
});

test('مع الفيديو: يُذكر أنه داخل الرابط', () => {
  assert.ok(buildManualMessage({ ...base, hasVideo: true }).includes('فيديو الدعوة وتأكيد الحضور:'));
  assert.ok(buildManualMessage(base).includes('تفاصيل الدعوة وتأكيد الحضور:'));
  assert.ok(!buildManualMessage(base).includes('فيديو'));
});

test('بلا سطر موعد: لا أسطر فارغة متتالية', () => {
  assert.ok(!buildManualMessage({ ...base, eventLine: '' }).includes('\n\n\n'));
});

test('أرقام wa.me دولية بلا + ولا 00', () => {
  assert.equal(waDigits('966555123456'), '966555123456');
  assert.equal(waDigits('+966 55 512 3456'), '966555123456');
  assert.equal(waDigits('00971501234567'), '971501234567');
  assert.equal(waDigits('٩٦٦٥٥٥١٢٣٤٥٦'), '966555123456');
});

test('رقم محلي يبدأ بصفر أو قصير يُرفض', () => {
  assert.equal(waDigits('0555123456'), null);
  assert.equal(waDigits('12345'), null);
  assert.equal(waDigits(''), null);
  assert.equal(buildWhatsAppUrl('0555123456', 'x'), null);
});

test('رابط wa.me يحمل النص مرمّزاً ويعود كما هو', () => {
  const msg = buildManualMessage({ ...base, hasVideo: true });
  const url = new URL(buildWhatsAppUrl('966555123456', msg));
  assert.equal(url.origin + url.pathname, 'https://wa.me/966555123456');
  assert.equal(url.searchParams.get('text'), msg);
});

console.log(`\n${passed} اختبارات نجحت.`);
