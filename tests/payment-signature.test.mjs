// اختبار التحقق من توقيع webhook الدفع — بلا هذا التحقق يستطيع
// أي طرف تفعيل مناسبة مجاناً بطلب مزوَّر.
//   node tests/payment-signature.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../.test-build/lib/payments/moyasar.js';

const SECRET = 'whsec_test_secret_value';
const body = JSON.stringify({ type: 'invoice.paid', data: { id: 'inv_1', status: 'paid' } });
const sign = (b, s = SECRET) => createHmac('sha256', s).update(b, 'utf8').digest('hex');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('التحقق من توقيع الـwebhook:');

test('التوقيع الصحيح يُقبل', () => {
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
});

test('البادئة sha256= تُقبل', () => {
  assert.equal(verifyWebhookSignature(body, `sha256=${sign(body)}`, SECRET), true);
});

test('التوقيع المزوَّر يُرفض', () => {
  assert.equal(verifyWebhookSignature(body, 'a'.repeat(64), SECRET), false);
});

test('توقيع بمفتاح آخر يُرفض', () => {
  assert.equal(verifyWebhookSignature(body, sign(body, 'wrong_secret'), SECRET), false);
});

test('تعديل حرف واحد في الجسم يُبطل التوقيع', () => {
  const tampered = body.replace('"paid"', '"PAID"');
  assert.equal(verifyWebhookSignature(tampered, sign(body), SECRET), false);
});

test('تغيير المبلغ يُبطل التوقيع', () => {
  const original = JSON.stringify({ data: { amount: 100 } });
  const hacked = JSON.stringify({ data: { amount: 1 } });
  assert.equal(verifyWebhookSignature(hacked, sign(original), SECRET), false);
});

test('غياب التوقيع يُرفض', () => {
  assert.equal(verifyWebhookSignature(body, null, SECRET), false);
  assert.equal(verifyWebhookSignature(body, '', SECRET), false);
});

test('غياب السر يُرفض — لا يُفتح الباب بالخطأ', () => {
  assert.equal(verifyWebhookSignature(body, sign(body), ''), false);
});

test('طول مختلف يُرفض دون انهيار', () => {
  assert.equal(verifyWebhookSignature(body, 'abc', SECRET), false);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
