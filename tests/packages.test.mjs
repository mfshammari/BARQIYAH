// اختبار تسعير الباقة المخصّصة في الواجهة — مرآة custom_package_price.
//   node tests/packages.test.mjs
import assert from 'node:assert/strict';
import {
  customPrice, customUpgradePrice, lowestUnitPrice, validateTiers, parseFeatures,
} from '../.test-build/lib/packages.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// ١٠٠٠→١٫٥ · ٣٠٠٠→١٫٢ · ٧٠٠٠→١٫٠ (كما في seed)
const TIERS = [
  { min_qty: 3000, unit_price: 1.2 },
  { min_qty: 1000, unit_price: 1.5 },
  { min_qty: 7000, unit_price: 1.0 },
];

console.log('التسعير التراكمي:');

test('داخل الشريحة الأولى', () => {
  assert.equal(customPrice(TIERS, 1500), 2250);
});

test('يعبر إلى الثانية: ٢٩٩٩ بالأولى و٥٠١ بالثانية', () => {
  assert.equal(customPrice(TIERS, 3500), 2999 * 1.5 + 501 * 1.2);
});

test('يعبر الشرائح الثلاث', () => {
  assert.equal(customPrice(TIERS, 8000), 2999 * 1.5 + 4000 * 1.2 + 1001 * 1.0);
});

test('الفاتورة لا تنخفض بزيادة الكمية', () => {
  let prev = 0;
  for (let q = 1; q <= 9000; q += 97) {
    const p = customPrice(TIERS, q);
    assert.ok(p >= prev, `انخفضت عند ${q}`);
    prev = p;
  }
});

test('كمية صفر أو سالبة = صفر', () => {
  assert.equal(customPrice(TIERS, 0), 0);
  assert.equal(customPrice(TIERS, -5), 0);
  assert.equal(customPrice([], 100), 0);
});

test('الترقية = فرق الإجمالي التراكمي', () => {
  assert.equal(customUpgradePrice(TIERS, 300, 1000), customPrice(TIERS, 1300) - customPrice(TIERS, 300));
});

test('أدنى سعر للدعوة', () => {
  assert.equal(lowestUnitPrice(TIERS), 1.0);
  assert.equal(lowestUnitPrice([]), null);
});

console.log('\nالتحقق من الشرائح:');

test('الشرائح الصالحة تمرّ', () => {
  assert.equal(validateTiers(TIERS, 1000), null);
});

test('أول شريحة ≠ أقل كمية', () => {
  assert.match(validateTiers(TIERS, 500), /أقل كمية/);
});

test('سعر يرتفع مع الكمية يُرفض', () => {
  assert.match(validateTiers([{ min_qty: 1000, unit_price: 1.5 }, { min_qty: 3000, unit_price: 1.7 }], 1000), /ينخفض/);
});

test('تكرار الكمية يُرفض', () => {
  assert.match(validateTiers([{ min_qty: 1000, unit_price: 1.5 }, { min_qty: 1000, unit_price: 1.2 }], 1000), /تكرار/);
});

test('بلا شرائح يُرفض', () => {
  assert.match(validateTiers([], 1000), /شريحة/);
});

test('المزايا سطر لكل ميزة', () => {
  assert.deepEqual(parseFeatures('أ\n\n ب \r\nج'), ['أ', 'ب', 'ج']);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
