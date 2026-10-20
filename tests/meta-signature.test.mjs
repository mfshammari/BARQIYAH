// توقيع webhook واتساب (المرحلة ٨): لا يُقبل بلا توقيع صحيح.
//   node tests/meta-signature.test.mjs
import assert from 'node:assert/strict';
import {
  verifyMetaSignature, signMetaPayload, allowUnsignedWebhook,
} from '../.test-build/lib/whatsapp/signature.js';

const SECRET = 'app_secret_for_tests';
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('توقيع Meta:');

test('التوقيع الصحيح يُقبل', () => {
  assert.equal(verifyMetaSignature(body, signMetaPayload(body, SECRET), SECRET), true);
});

test('بلا توقيع → مرفوض', () => {
  assert.equal(verifyMetaSignature(body, null, SECRET), false);
  assert.equal(verifyMetaSignature(body, '', SECRET), false);
});

test('توقيع بسرّ آخر → مرفوض', () => {
  assert.equal(verifyMetaSignature(body, signMetaPayload(body, 'other'), SECRET), false);
});

test('تعديل الجسم بعد التوقيع → مرفوض', () => {
  const sig = signMetaPayload(body, SECRET);
  assert.equal(verifyMetaSignature(body + ' ', sig, SECRET), false);
});

test('صيغة الترويسة يجب أن تكون sha256=hex', () => {
  assert.equal(verifyMetaSignature(body, 'md5=abc', SECRET), false);
  assert.equal(verifyMetaSignature(body, 'sha256=zz', SECRET), false);
});

test('سرّ فارغ لا يقبل أي توقيع', () => {
  assert.equal(verifyMetaSignature(body, signMetaPayload(body, ''), ''), false);
});

test('بلا توقيع يُسمح في المحاكاة خارج الإنتاج فقط', () => {
  assert.equal(allowUnsignedWebhook('', 'development'), true);
  assert.equal(allowUnsignedWebhook('', 'test'), true);
  assert.equal(allowUnsignedWebhook('', 'production'), false);
  assert.equal(allowUnsignedWebhook(SECRET, 'development'), false);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
