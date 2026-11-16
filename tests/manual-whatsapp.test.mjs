// اختبار الإرسال اليدوي عبر واتساب: بناء الرسالة، رابط wa.me، التوقيع، الرصيد، والرمز.
//   node tests/manual-whatsapp.test.mjs
import assert from 'node:assert/strict';
import {
  buildMessage, buildWhatsAppUrl, computeSeatBalance, ensureLinkVariable, generateToken,
  guestLink, isValidE164, resolveInviterNames, resolveSignature, DEFAULT_TEMPLATES, TOKEN_RE,
} from '../.test-build/lib/manual-whatsapp/message.js';
import {
  MOCK_EVENT_ID, getInvitationByToken, listGuests, markOpened, markSent, resetMock, setViewer,
  saveSettings, submitRsvp, getEvent,
} from '../.test-build/lib/manual-whatsapp/mock.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
async function atest(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`); }

const event = {
  id: 'e1', title: 'حفل زواج فيصل العتيبي', occasion: 'حفل زواج فيصل العتيبي',
  ownerName: 'عبدالله بن سعد العتيبي', subInviterName: 'سعد بن عبدالله العتيبي',
  dateText: 'مساء الجمعة 15 يناير 2027', timeText: '8:30 مساءً', venue: 'قاعة الريم، الرياض',
  mapUrl: 'https://maps.google.com/?q=x', packageSeats: 20,
};
const guest = { id: 'g1', token: 'Abc123XyZ9', name: 'تركي الدوسري', phoneE164: '+966555100001', maxSeats: 4, status: 'draft', attendees: 0 };
const link = 'https://barqiyah.app/i/Abc123XyZ9';

console.log('بناء الرسالة:');

test('القالب الرسمي يُملأ بالاسم والمناسبة والرابط والتوقيع', () => {
  const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'formal').text;
  const msg = buildMessage(tpl, guest, event, 'owner', link);
  assert.ok(msg.startsWith('السلام عليكم ورحمة الله وبركاته\nالمكرّم تركي الدوسري\n'));
  assert.ok(msg.includes('يسرّنا دعوتكم لحضور حفل زواج فيصل العتيبي'));
  assert.ok(msg.includes('مساء الجمعة 15 يناير 2027، قاعة الريم، الرياض'));
  assert.ok(msg.includes(`\n${link}\n`));
  assert.ok(msg.endsWith('الداعي: عبدالله بن سعد العتيبي'));
  assert.equal((msg.match(/\{/g) ?? []).length, 0, 'لا تبقى متغيّرات غير مستبدلة');
});

test('حذف {الرابط} من القالب يُعيد الرابط سطراً أخيراً', () => {
  const tpl = 'السلام عليكم ورحمة الله وبركاته\nالمكرّم {الاسم}\n{التوقيع}\n\n';
  const msg = buildMessage(tpl, guest, event, 'owner', link);
  assert.ok(msg.endsWith(`\n${link}`));
  assert.equal(msg.split('\n').at(-1), link);
  assert.equal(ensureLinkVariable('نص'), 'نص\n{الرابط}');
  assert.equal(ensureLinkVariable('نص {الرابط} هنا'), 'نص {الرابط} هنا');
});

test('التوقيع: الداعي لواحد، الداعيان للاثنين بواو العطف', () => {
  assert.equal(resolveSignature(event, 'owner'), 'الداعي: عبدالله بن سعد العتيبي');
  assert.equal(resolveSignature(event, 'sub'), 'الداعي: سعد بن عبدالله العتيبي');
  assert.equal(resolveSignature(event, 'both'), 'الداعيان: عبدالله بن سعد العتيبي وسعد بن عبدالله العتيبي');
  assert.deepEqual(resolveInviterNames(event, 'both'), [event.ownerName, event.subInviterName]);
});

test('بلا داعٍ فرعي تعود الدعوة إلى صاحب المناسبة أياً كان الاختيار', () => {
  const solo = { ...event, subInviterName: null };
  assert.deepEqual(resolveInviterNames(solo, 'both'), [event.ownerName]);
  assert.deepEqual(resolveInviterNames(solo, 'sub'), [event.ownerName]);
  assert.equal(resolveSignature(solo, 'both'), 'الداعي: عبدالله بن سعد العتيبي');
});

test('{الداعي} يُحلّ إلى الأسماء المختارة', () => {
  const msg = buildMessage('{الداعي}\n{الرابط}', guest, event, 'both', link);
  assert.equal(msg, `عبدالله بن سعد العتيبي وسعد بن عبدالله العتيبي\n${link}`);
});

console.log('\nرابط واتساب:');

test('wa.me بأرقام E.164 بلا + والرسالة مشفّرة كاملة', () => {
  const msg = buildMessage(DEFAULT_TEMPLATES[2].text, guest, event, 'owner', link);
  const url = buildWhatsAppUrl(guest.phoneE164, msg);
  assert.ok(url.startsWith('https://wa.me/966555100001?text='));
  const decoded = decodeURIComponent(url.slice(url.indexOf('text=') + 5));
  assert.equal(decoded, msg);
  assert.ok(decoded.includes('تركي الدوسري'));
  assert.ok(decoded.includes(link));
});

test('الأرقام غير الصحيحة تُرفض', () => {
  assert.equal(isValidE164('+966555100001'), true);
  assert.equal(isValidE164('0555'), false);
  assert.equal(isValidE164(''), false);
  assert.equal(isValidE164('+0123456789'), false);
  assert.throws(() => buildWhatsAppUrl('12', 'x'));
});

test('رابط المدعو /i/{token}', () => {
  assert.equal(guestLink('https://barqiyah.app/', 'Abc123XyZ9'), 'https://barqiyah.app/i/Abc123XyZ9');
});

console.log('\nالرصيد:');

const g = (status, maxSeats, attendees = 0) => ({ ...guest, id: Math.random().toString(), status, maxSeats, attendees });

test('متاح = الباقة − المحجوز (بانتظار + فتح الدعوة) − المؤكّد', () => {
  const b = computeSeatBalance([g('draft', 4), g('pending', 2), g('opened', 2), g('confirmed', 1, 1), g('declined', 1)], 20);
  assert.equal(b.reserved, 4);
  assert.equal(b.confirmed, 1);
  assert.equal(b.available, 15);
  assert.equal(b.invited, 5);
  assert.equal(b.sent, 4);
  assert.equal(b.confirmedCount, 1);
  assert.equal(b.declinedCount, 1);
});

test('تأكيد ٢ من ٤ يُعيد ٢ إلى المتاح', () => {
  const before = computeSeatBalance([g('pending', 4)], 20);
  const after = computeSeatBalance([g('confirmed', 4, 2)], 20);
  assert.equal(before.available, 16);
  assert.equal(after.available, 18);
});

test('الاعتذار يُعيد المقاعد كلها', () => {
  assert.equal(computeSeatBalance([g('declined', 4)], 20).available, 20);
});

console.log('\nالرمز:');

test('٨ محارف عشوائية فأكثر وبلا تكرار', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const t = generateToken();
    assert.ok(t.length >= 8);
    assert.match(t, TOKEN_RE);
    seen.add(t);
  }
  assert.equal(seen.size, 2000);
  assert.ok(!TOKEN_RE.test('abc'));
});

console.log('\nالمحاكاة (في الذاكرة):');

await atest('زر واتساب يحوّل المسودة إلى بانتظار ويحجز مقاعدها', async () => {
  await resetMock();
  const ev = await getEvent(MOCK_EVENT_ID);
  const guests = await listGuests(MOCK_EVENT_ID);
  assert.equal(guests.length, 5);
  assert.ok(guests.every((x) => x.status === 'draft' && TOKEN_RE.test(x.token)));
  const turki = guests.find((x) => x.name === 'تركي الدوسري');
  const sent = await markSent(turki.id);
  assert.equal(sent.status, 'pending');
  const b = computeSeatBalance(await listGuests(MOCK_EVENT_ID), ev.packageSeats);
  assert.equal(b.reserved, 4);
  assert.equal(b.available, 16);
});

await atest('فتح الصفحة يحوّل بانتظار إلى فتح الدعوة، والتأكيد بـ٢ من ٤ يُعيد ٢', async () => {
  const guests = await listGuests(MOCK_EVENT_ID);
  const turki = guests.find((x) => x.name === 'تركي الدوسري');
  await markOpened(turki.token);
  let inv = await getInvitationByToken(turki.token);
  assert.equal(inv.guest.status, 'opened');
  assert.equal(inv.guest.name, 'تركي الدوسري');
  assert.equal(Object.keys(inv.guest).sort().join(','), 'attendees,id,maxSeats,name,phoneE164,status,token');
  const confirmed = await submitRsvp(turki.token, { attending: true, attendees: 2 });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.attendees, 2);
  const b = computeSeatBalance(await listGuests(MOCK_EVENT_ID), 20);
  assert.equal(b.confirmed, 2);
  assert.equal(b.reserved, 0);
  assert.equal(b.available, 18);
  inv = await getInvitationByToken(turki.token);
  assert.equal(inv.guest.status, 'confirmed');
});

await atest('الاعتذار يُحرّر الكل، والرمز المجهول يُرفض', async () => {
  const guests = await listGuests(MOCK_EVENT_ID);
  const mansour = guests.find((x) => x.name === 'منصور العنزي');
  await markSent(mansour.id);
  const declined = await submitRsvp(mansour.token, { attending: false, attendees: 0 });
  assert.equal(declined.status, 'declined');
  assert.equal(computeSeatBalance(await listGuests(MOCK_EVENT_ID), 20).available, 18);
  await assert.rejects(getInvitationByToken('zzzzzzzzzz'));
  await assert.rejects(submitRsvp(mansour.token, { attending: true, attendees: 9 }));
});

await atest('حساب صاحب المناسبة يُرسل باسمه فقط؛ الداعي الفرعي باختياره', async () => {
  await resetMock();
  const guests = await listGuests(MOCK_EVENT_ID);
  setViewer('owner');
  await saveSettings(MOCK_EVENT_ID, { signBy: 'both' });
  await markSent(guests[0].id);
  assert.equal((await getInvitationByToken(guests[0].token)).signBy, 'owner');
  setViewer('sub');
  await markSent(guests[1].id);
  assert.equal((await getInvitationByToken(guests[1].token)).signBy, 'both');
});

console.log(`\n${passed} اختبارات نجحت ✓`);
