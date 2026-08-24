// صفة المستخدم تجاه المناسبة: مالك أم داعٍ (SPEC §3).
// المالك له صفٌّ في inviters بحسابه نفسه — ويجب ألّا يجعله «داعياً في مناسبة غيره».
//   node tests/event-roles.test.mjs
import assert from 'node:assert/strict';
import {
  isOwnEventInviterRow, foreignInviterRows, relationToEvent,
} from '../.test-build/lib/eventRoles.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const MOHAMMED = 'u-mohammed';
const OTHER = 'u-other';

// صفّ المالك في مناسبته (يُنشأ تلقائياً عند إنشاء المناسبة)
const ownRow = {
  id: 'inv-own', profile_id: MOHAMMED, seats_quota: 0,
  events: { id: 'e1', owner_id: MOHAMMED, host_name: 'أسرة العبدالله' },
};
// صفّ محمد داعياً في مناسبة شخص آخر
const guestRow = {
  id: 'inv-guest', profile_id: MOHAMMED, seats_quota: 80,
  events: { id: 'e2', owner_id: OTHER, host_name: 'أبو فيصل العتيبي' },
};
// صفّ داعٍ لم ينضم بعد (بلا مناسبة محمّلة)
const orphanRow = { id: 'inv-orphan', profile_id: MOHAMMED, events: null };

console.log('صفة المستخدم تجاه المناسبة:');

test('صفّ المالك في مناسبته يُعرَف كذلك', () => {
  assert.equal(isOwnEventInviterRow(ownRow, MOHAMMED), true);
});

test('صفّ داعٍ في مناسبة غيره ليس صفّ مالك', () => {
  assert.equal(isOwnEventInviterRow(guestRow, MOHAMMED), false);
});

test('«مناسبات أنا داعٍ فيها» لا تشمل مناسبةً أملكها', () => {
  const rows = foreignInviterRows([ownRow, guestRow], MOHAMMED);
  assert.deepEqual(rows.map((r) => r.id), ['inv-guest']);
});

test('المناسبة الواحدة لا تُحسب مرّتين', () => {
  const owned = [{ id: 'e1' }];
  const invited = foreignInviterRows([ownRow, guestRow], MOHAMMED);
  assert.equal(owned.length + invited.length, 2, 'e1 مرّة واحدة و e2 مرّة واحدة');
});

test('الصفوف بلا مناسبة تُستبعد', () => {
  assert.deepEqual(foreignInviterRows([orphanRow], MOHAMMED), []);
});

test('مالك بلا أي صفّ داعٍ: القائمة فارغة لا خطأ', () => {
  assert.deepEqual(foreignInviterRows([], MOHAMMED), []);
});

test('الملكية تسبق صفة الداعي عند اجتماعهما', () => {
  assert.equal(
    relationToEvent({ ownerId: MOHAMMED, inviterProfileId: MOHAMMED }, MOHAMMED),
    'owner',
  );
});

test('داعٍ في مناسبة غيره', () => {
  assert.equal(
    relationToEvent({ ownerId: OTHER, inviterProfileId: MOHAMMED }, MOHAMMED),
    'inviter',
  );
});

test('لا صلة له بالمناسبة', () => {
  assert.equal(relationToEvent({ ownerId: OTHER, inviterProfileId: null }, MOHAMMED), 'none');
});

test('المالك يبقى مالكاً ولو لم يكن له صفّ داعٍ', () => {
  assert.equal(relationToEvent({ ownerId: MOHAMMED }, MOHAMMED), 'owner');
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
