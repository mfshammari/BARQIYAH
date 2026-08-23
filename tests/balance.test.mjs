// اختبار منطق الرصيد بالمقاعد وتوحيد أرقام الجوال.
//   node tests/balance.test.mjs
import assert from 'node:assert/strict';
import { computeBalance, usageRatio } from '../.test-build/lib/balance.js';
import { normalizePhone, isValidPhone, formatHijri, formatWeekday, formatTime, formatEventLine, formatNumber }
  from '../.test-build/lib/format.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const guest = (status, max, confirmed = null) => ({
  status, max_seats: max, confirmed_seats: confirmed,
});

console.log('حساب الرصيد بثلاث حالات:');

test('المسودّات لا تحجز ولا تُحتسب رسالة', () => {
  const b = computeBalance([guest('draft', 5), guest('draft', 3)], 100);
  assert.equal(b.held, 0);
  assert.equal(b.confirmed, 0);
  assert.equal(b.available, 100);
  assert.equal(b.messages_used, 0);
});

test('المُرسل يحجز الحد الأقصى', () => {
  const b = computeBalance([guest('sent', 7), guest('sent', 2)], 20);
  assert.equal(b.held, 9);
  assert.equal(b.available, 11);
  assert.equal(b.messages_used, 2);
});

test('التأكيد يخصم العدد الفعلي لا الحد الأقصى', () => {
  // دعوة حدّها ٧ وأكّد ٣ → المؤكّد ٣ والمحرَّر ٤
  const b = computeBalance([guest('accepted', 7, 3)], 20);
  assert.equal(b.held, 0);
  assert.equal(b.confirmed, 3);
  assert.equal(b.available, 17);
});

test('الاعتذار يحرّر المقاعد بالكامل', () => {
  const b = computeBalance([guest('declined', 6)], 20);
  assert.equal(b.held, 0);
  assert.equal(b.confirmed, 0);
  assert.equal(b.available, 20);
});

test('الحاضر يبقى ضمن المؤكّد', () => {
  const b = computeBalance([guest('attended', 4, 2)], 10);
  assert.equal(b.confirmed, 2);
  assert.equal(b.cnt_attended, 1);
});

test('«لم يرد» يحرّر الحجز (خرج من حالة sent)', () => {
  const b = computeBalance([guest('expired', 6)], 20);
  assert.equal(b.held, 0);
  assert.equal(b.available, 20);
});

test('خليط واقعي: ٤ مؤكّد + ٩ محجوز من أصل ٣٠', () => {
  const b = computeBalance([
    guest('accepted', 4, 2), guest('attended', 2, 2),
    guest('sent', 7), guest('sent', 2),
    guest('declined', 3), guest('draft', 5),
  ], 30);
  assert.equal(b.confirmed, 4);
  assert.equal(b.held, 9);
  assert.equal(b.available, 17);
  assert.equal(b.messages_used, 5);      // كل ما ليس مسودة
  assert.equal(b.total_guests, 6);
});

test('الرصيد قد يصبح سالباً إن قُلّصت الباقة — تُعرض الحقيقة لا صفر', () => {
  const b = computeBalance([guest('sent', 10)], 5);
  assert.equal(b.available, -5);
});

test('نسبة الاستهلاك = (مؤكّد + محجوز) / الباقة', () => {
  assert.equal(usageRatio(computeBalance([guest('sent', 10)], 40)), 25);
  assert.equal(usageRatio(computeBalance([], 0)), 0);
});

console.log('\nتوحيد أرقام الجوال:');

test('الصيغة المحلية 05 تتحول إلى 9665', () => {
  assert.equal(normalizePhone('0555123456'), '966555123456');
});

test('الصيغ الدولية تُقبل كما هي', () => {
  assert.equal(normalizePhone('+966555123456'), '966555123456');
  assert.equal(normalizePhone('00966555123456'), '966555123456');
  assert.equal(normalizePhone('966555123456'), '966555123456');
});

test('المسافات والشرطات تُزال', () => {
  assert.equal(normalizePhone('055 512-3456'), '966555123456');
  assert.equal(normalizePhone('(055) 512 3456'), '966555123456');
});

test('الأرقام العربية والفارسية تُحوَّل', () => {
  assert.equal(normalizePhone('٠٥٥٥١٢٣٤٥٦'), '966555123456');
  assert.equal(normalizePhone('۰۵۵۵۱۲۳۴۵۶'), '966555123456');
});

test('الرقم بلا صفر بادئ (٩ خانات) يُكمَل', () => {
  assert.equal(normalizePhone('555123456'), '966555123456');
});

test('التحقق يرفض غير الصالح', () => {
  assert.equal(isValidPhone('0555123456'), true);
  assert.equal(isValidPhone('123'), false);
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('غير رقم'), false);
});

console.log('\nالتاريخ الهجري وسطر الموعد:');

test('الأرقام تُعرض عربية هندية', () => {
  assert.equal(formatNumber(1234), '١٬٢٣٤');
  assert.equal(formatNumber(7), '٧');
});

test('التاريخ الهجري بتقويم أم القرى', () => {
  const h = formatHijri('2027-04-26');
  assert.match(h, /١٤٤٨/, 'يحتوي السنة الهجرية');
  assert.match(h, /[\u0600-\u06FF]/, 'اسم الشهر بالعربية');
});

test('اسم اليوم بالعربية', () => {
  assert.equal(formatWeekday('2027-04-26'), 'الاثنين');
});

test('الوقت بصيغة ١٢ ساعة عربية', () => {
  assert.match(formatTime('21:00'), /٠٩:٠٠/);
  assert.equal(formatTime(''), '');
  assert.equal(formatTime(null), '');
});

test('سطر الموعد يجمع اليوم والتاريخ والمكان والوقت', () => {
  const line = formatEventLine({
    dateGregorian: '2027-04-26', dateHijri: '٢٦ شوال ١٤٤٨ هـ',
    weekday: 'الجمعة', time: '21:00', venue: 'قصر ٣٣',
  });
  assert.match(line, /الجمعة/);
  assert.match(line, /٢٦ شوال/);
  assert.match(line, /قصر ٣٣/);
  assert.match(line, /٠٩:٠٠/);
});

test('سطر الموعد يشتق الهجري واليوم إن لم يُمرَّرا', () => {
  const line = formatEventLine({ dateGregorian: '2027-04-26', venue: 'قاعة الرياض' });
  assert.match(line, /الاثنين/);
  assert.match(line, /١٤٤٨/);
  assert.match(line, /قاعة الرياض/);
});

test('الحقول الفارغة لا تترك فواصل معلّقة', () => {
  const line = formatEventLine({ dateGregorian: '2027-04-26' });
  assert.ok(!line.endsWith('·'), 'لا فاصل في النهاية');
  assert.ok(!line.includes('· ·'), 'لا فواصل متتالية');
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
