// اختبار تحليل حمولات واتساب الواردة — يعمل بلا شبكة ولا قاعدة بيانات.
//   node tests/whatsapp-parse.test.mjs
import assert from 'node:assert/strict';
import { buildButtonPayloads, buildSeatsPayload, classifyText, normalizeArabic,
  parseButtonPayload, parseWebhookPayload } from '../.test-build/lib/whatsapp/parse.js';

const TOKEN = '2e72aa8b-000f-402c-8eaa-f7eb5d0c40b9';
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const wrap = (message) => ({
  entry: [{ changes: [{ value: { messages: [message] } }] }],
});

console.log('بناء وتحليل الحمولات:');

test('payload زرَّي التأكيد والاعتذار', () => {
  const p = buildButtonPayloads(TOKEN);
  assert.deepEqual(parseButtonPayload(p.accept), { kind: 'accept', token: TOKEN });
  assert.deepEqual(parseButtonPayload(p.decline), { kind: 'decline', token: TOKEN });
});

test('payload اختيار عدد الحاضرين', () => {
  assert.deepEqual(parseButtonPayload(buildSeatsPayload(TOKEN, 3)), {
    kind: 'seats', token: TOKEN, seats: 3,
  });
});

test('payload مشوّه يُرفض', () => {
  assert.equal(parseButtonPayload('ACCEPT:not-a-uuid'), null);
  assert.equal(parseButtonPayload('DROP TABLE guests'), null);
  assert.equal(parseButtonPayload(''), null);
});

console.log('\nتحليل webhook:');

test('زر قالب: تأكيد', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000001', id: 'wamid.1', type: 'button',
    button: { payload: `ACCEPT:${TOKEN}`, text: 'تأكيد الحضور' },
  }));
  assert.equal(r.kind, 'accept');
  assert.equal(r.from, '966551000001');
  assert.equal(r.messageId, 'wamid.1');
});

test('زر قالب: اعتذار', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000002', id: 'wamid.2', type: 'button',
    button: { payload: `DECLINE:${TOKEN}`, text: 'الاعتذار' },
  }));
  assert.equal(r.kind, 'decline');
});

test('قائمة تفاعلية: اختيار ٤ مقاعد', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000003', id: 'wamid.3', type: 'interactive',
    interactive: { type: 'list_reply', list_reply: { id: buildSeatsPayload(TOKEN, 4), title: '4' } },
  }));
  assert.equal(r.kind, 'seats');
  assert.equal(r.seats, 4);
});

test('زر تفاعلي (button_reply)', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000004', id: 'wamid.4', type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: `ACCEPT:${TOKEN}`, title: 'تأكيد' } },
  }));
  assert.equal(r.kind, 'accept');
});

test('رسالة نصية عربية تُصنَّف تأكيداً', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000005', id: 'wamid.5', type: 'text', text: { body: 'سأحضر إن شاء الله' },
  }));
  assert.equal(r.kind, 'accept');
});

test('رسالة نصية عربية تُصنَّف اعتذاراً', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000006', id: 'wamid.6', type: 'text', text: { body: 'أعتذر عن الحضور' },
  }));
  assert.equal(r.kind, 'decline');
});

test('نص غير مفهوم يبقى text', () => {
  const [r] = parseWebhookPayload(wrap({
    from: '966551000007', id: 'wamid.7', type: 'text', text: { body: 'وين مكان القاعة؟' },
  }));
  assert.equal(r.kind, 'text');
});

test('إشعارات الحالة (بلا messages) تُتجاهل', () => {
  assert.deepEqual(parseWebhookPayload({
    entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }],
  }), []);
  assert.deepEqual(parseWebhookPayload({}), []);
  assert.deepEqual(parseWebhookPayload(null), []);
});

test('عدة ردود في حمولة واحدة', () => {
  const replies = parseWebhookPayload({
    entry: [{ changes: [{ value: { messages: [
      { from: '9665001', id: 'a', button: { payload: `ACCEPT:${TOKEN}` } },
      { from: '9665002', id: 'b', button: { payload: `DECLINE:${TOKEN}` } },
    ] } }] }],
  });
  assert.equal(replies.length, 2);
  assert.equal(replies[0].kind, 'accept');
  assert.equal(replies[1].kind, 'decline');
});

console.log('\nتصنيف الردود الحرّة:');

test('تطبيع الهمزات والتشكيل', () => {
  assert.equal(normalizeArabic('أَعْتَذِر'), 'اعتذر');
  assert.equal(normalizeArabic('إن شاء الله'), 'ان شاء الله');
});

test('صيغ التأكيد المختلفة', () => {
  for (const t of ['تأكيد', 'أؤكد حضوري', 'سأحضر', 'نعم', 'أكيد بإذن الله', 'حاضر', 'Yes', 'confirm']) {
    assert.equal(classifyText(t), 'accept', `يُفترض أن «${t}» تأكيد`);
  }
});

test('صيغ الاعتذار المختلفة', () => {
  for (const t of ['أعتذر عن الحضور', 'اعتذار', 'لن أحضر', 'ما أقدر', 'لا أستطيع', 'معتذر', 'No', 'sorry']) {
    assert.equal(classifyText(t), 'decline', `يُفترض أن «${t}» اعتذار`);
  }
});

test('«لا» داخل كلمة لا تُحسب اعتذاراً', () => {
  assert.equal(classifyText('سلام عليكم'), 'text');
  assert.equal(classifyText('وين مكان القاعة؟'), 'text');
  assert.equal(classifyText('مبارك عليكم'), 'text');
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
