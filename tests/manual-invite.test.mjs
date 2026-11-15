// اختبار الإرسال اليدوي عبر واتساب: نصّ الرسالة ورابط wa.me.
//   node tests/manual-invite.test.mjs
import assert from 'node:assert/strict';
import { buildWhatsAppUrl, waDigits } from '../.test-build/lib/manualInvite.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('الإرسال اليدوي عبر واتساب:');

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
  const msg = 'السلام عليكم ورحمة الله وبركاته\nالمكرّم خالد\nhttps://barqiyah.vercel.app/rsvp/0b7e3c1e-1111-4222-8333-444455556666\n\nالداعي: فالح';
  const url = new URL(buildWhatsAppUrl('966555123456', msg));
  assert.equal(url.origin + url.pathname, 'https://wa.me/966555123456');
  assert.equal(url.searchParams.get('text'), msg);
});

console.log(`\n${passed} اختبارات نجحت.`);
