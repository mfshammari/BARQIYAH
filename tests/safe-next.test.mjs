// مسار العودة بعد الدخول: داخلي فقط (المرحلة ٦).
//   node tests/safe-next.test.mjs
import assert from 'node:assert/strict';
import { safeNextPath, isSafeNextPath } from '../.test-build/lib/safeNext.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('مسار العودة (next):');

test('المسار الداخلي يُقبل كما هو', () => {
  assert.equal(safeNextPath('/join/2e72aa8b-000f-402c-8eaa-f7eb5d0c40b9'), '/join/2e72aa8b-000f-402c-8eaa-f7eb5d0c40b9');
  assert.equal(safeNextPath('/e/abc/guests?status=draft'), '/e/abc/guests?status=draft');
});

test('الفارغ → الافتراضي', () => {
  assert.equal(safeNextPath(''), '/app');
  assert.equal(safeNextPath(null), '/app');
  assert.equal(safeNextPath(undefined, '/scan'), '/scan');
});

test('الروابط الخارجية تُرفض', () => {
  for (const bad of ['https://evil.com', 'http://x', '//evil.com/x', '/\\evil.com', 'evil.com', 'javascript:alert(1)', '/javascript:alert(1)']) {
    assert.equal(safeNextPath(bad), '/app', `قُبل «${bad}»`);
  }
});

test('أسطر جديدة ومسارات طويلة تُرفض', () => {
  assert.equal(safeNextPath('/app\r\nSet-Cookie: x'), '/app');
  assert.equal(safeNextPath('/' + 'a'.repeat(600)), '/app');
});

test('isSafeNextPath', () => {
  assert.equal(isSafeNextPath('/join/x'), true);
  assert.equal(isSafeNextPath('https://x'), false);
  assert.equal(isSafeNextPath(''), false);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
