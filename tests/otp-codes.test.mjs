// توليد رموز الدخول والاسترجاع وصياغتها.
//   node tests/otp-codes.test.mjs
import assert from 'node:assert/strict';
import {
  phoneToEmail, isPhoneEmail, formatRecoveryCode, isValidRecoveryCode,
  formatOtp, RECOVERY_ALPHABET,
} from '../.test-build/lib/otpCodes.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('رموز الدخول والاسترجاع:');

test('الجوال يصير بريداً اصطناعياً مميّزاً', () => {
  assert.equal(phoneToEmail('966555123456'), '966555123456@phone.barqiyah.local');
  assert.equal(isPhoneEmail('966555123456@phone.barqiyah.local'), true);
});

test('حساب الفريق ببريده الحقيقي لا يُحسب حساب جوال', () => {
  assert.equal(isPhoneEmail('admin@barqiyah.sa'), false);
  assert.equal(isPhoneEmail(null), false);
  assert.equal(isPhoneEmail(undefined), false);
});

test('رمز التحقق ست خانات بأصفار بادئة محفوظة', () => {
  assert.equal(formatOtp(7), '000007');
  assert.equal(formatOtp(123456), '123456');
  assert.equal(formatOtp(0), '000000');
  assert.equal(formatOtp(999999), '999999');
});

test('رمز الاسترجاع بصيغة XXXX-XXXX-XXXX', () => {
  const code = formatRecoveryCode(new Uint8Array([...Array(12).keys()]));
  assert.match(code, /^.{4}-.{4}-.{4}$/);
  assert.equal(isValidRecoveryCode(code), true);
});

test('رمز الاسترجاع بلا حروف ملتبسة (I O 0 1 L)', () => {
  for (const bad of ['I', 'O', '0', '1', 'L']) {
    assert.equal(RECOVERY_ALPHABET.includes(bad), false, `${bad} يجب ألا يكون في الأبجدية`);
  }
  // كل بايت ممكن يُنتج حرفاً من الأبجدية وحدها
  for (let b = 0; b < 256; b++) {
    const c = formatRecoveryCode(new Uint8Array(Array(12).fill(b)));
    for (const ch of c.replace(/-/g, '')) {
      assert.ok(RECOVERY_ALPHABET.includes(ch), `حرف خارج الأبجدية: ${ch}`);
    }
  }
});

test('رمز استرجاع مشوّه يُرفض', () => {
  assert.equal(isValidRecoveryCode('ABCD-EFGH'), false);
  assert.equal(isValidRecoveryCode('ABCD-EFGH-IJKL'), false, 'يحوي I و L');
  assert.equal(isValidRecoveryCode('abcd-efgh-jkmn'), false, 'حروف صغيرة');
  assert.equal(isValidRecoveryCode(''), false);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
