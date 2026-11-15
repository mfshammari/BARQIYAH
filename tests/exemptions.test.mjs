// اختبار الإعفاء من الدفع: الصلاحية، السقف، السحب، الانتهاء، والسجل.
//   node tests/exemptions.test.mjs
import assert from 'node:assert/strict';
import {
  decideSend, exemptionStatus, isSuperAdmin, validateGrantInput, validateNewCap,
} from '../.test-build/lib/exemptions/logic.js';
import {
  ADMINS, canSend, createEvent, getExemption, grantExemption, listEvents, listExemptionLog,
  resetMock, revokeExemption, sendInvitations, setActor, updateExemptionCap, _debugExpire,
} from '../.test-build/lib/exemptions/mock.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
async function atest(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`); }

const SUPER = ADMINS.find((a) => a.role === 'admin_owner');
const SUPPORT = ADMINS.find((a) => a.role === 'admin_support');
const CLIENT = { id: 'acc_2', name: 'نورة', role: 'user' };

console.log('المنطق الخالص:');

test('سوبر أدمن وحده', () => {
  assert.equal(isSuperAdmin('admin_owner'), true);
  assert.equal(isSuperAdmin('admin'), true);
  assert.equal(isSuperAdmin('admin_support'), false);
  assert.equal(isSuperAdmin('admin_finance'), false);
  assert.equal(isSuperAdmin('user'), false);
});

test('تحقّق المنح: سقف صحيح ≥ ١ وسبب من القائمة', () => {
  assert.equal(validateGrantInput({ cap: 10, reason: 'trial' }), null);
  assert.ok(validateGrantInput({ cap: 0, reason: 'trial' }));
  assert.ok(validateGrantInput({ cap: 2.5, reason: 'trial' }));
  assert.ok(validateGrantInput({ cap: 10, reason: 'nope' }));
  assert.ok(validateGrantInput({ cap: 10, reason: 'trial', expiresAt: '2001-01-01' }));
});

test('السقف الجديد لا يقلّ عن المستخدم', () => {
  assert.equal(validateNewCap({ used: 6 }, 6), null);
  assert.equal(validateNewCap({ used: 6 }, 50), null);
  assert.ok(validateNewCap({ used: 6 }, 5));
  assert.ok(validateNewCap({ used: 0 }, 0));
});

const base = { accountId: 'x', cap: 10, used: 0, reason: 'trial', note: null, expiresAt: null, grantedBy: 'a', grantedAt: '2026-01-01T00:00:00Z', revokedAt: null };

test('الحالة: مسحوب ← منتهٍ ← بلغ السقف ← نشط', () => {
  assert.equal(exemptionStatus(base), 'active');
  assert.equal(exemptionStatus({ ...base, used: 10 }), 'cap_reached');
  assert.equal(exemptionStatus({ ...base, expiresAt: '2001-01-01T00:00:00Z' }), 'expired');
  assert.equal(exemptionStatus({ ...base, revokedAt: '2026-02-01T00:00:00Z', used: 10 }), 'revoked');
});

test('قرار الإرسال يتوقف عند السقف تمامًا', () => {
  assert.deepEqual(decideSend({ ...base, used: 7 }, 3, false), { ok: true });
  assert.deepEqual(decideSend({ ...base, used: 7 }, 4, false), { ok: false, reason: 'cap_reached' });
  assert.deepEqual(decideSend({ ...base, revokedAt: 'x' }, 1, false), { ok: false, reason: 'revoked' });
  assert.deepEqual(decideSend({ ...base, expiresAt: '2001-01-01T00:00:00Z' }, 1, false), { ok: false, reason: 'expired' });
  assert.deepEqual(decideSend(null, 1, false), { ok: false, reason: 'no_package' });
  assert.deepEqual(decideSend({ ...base, revokedAt: 'x' }, 1, true), { ok: true }, 'الباقة المدفوعة لا تتأثر بالإعفاء');
});

console.log('\nالمحاكاة (الخادم):');

await atest('غير السوبر أدمن يُرفض منحه وسحبه', async () => {
  await resetMock();
  setActor(SUPPORT);
  await assert.rejects(grantExemption('acc_2', { cap: 10, reason: 'trial' }), /غير مصرّح/);
  await assert.rejects(revokeExemption('acc_3'), /غير مصرّح/);
  await assert.rejects(updateExemptionCap('acc_3', 30), /غير مصرّح/);
  setActor(CLIENT);
  await assert.rejects(grantExemption('acc_2', { cap: 10, reason: 'trial' }), /غير مصرّح/);
  assert.equal(await getExemption('acc_2'), null);
});

await atest('الحساب المعفى ينشئ مناسبة مفعّلة ويرسل بلا دفع', async () => {
  setActor(SUPER);
  const ex = await grantExemption('acc_2', { cap: 5, reason: 'trial', note: 'تجربة أسبوع' });
  assert.equal(ex.used, 0);
  assert.equal(ex.grantedBy, SUPER.id);
  const ev = await createEvent('acc_2', 'حفل تجريبي');
  assert.equal(ev.status, 'active');
  assert.equal(ev.paidPackage, null);
  const r = await sendInvitations('acc_2', ev.id, 3);
  assert.deepEqual(r.result, { ok: true });
  assert.equal(r.exemption.used, 3);
  assert.equal(r.event.sent, 3);
});

const pick = async (accountId, name) => (await listEvents(accountId)).find((e) => e.name === name);

await atest('الإرسال يتوقف عند السقف تمامًا', async () => {
  const ev = await pick('acc_2', 'حفل تجريبي');
  assert.deepEqual(await canSend('acc_2', ev.id, 2), { ok: true });
  assert.deepEqual(await canSend('acc_2', ev.id, 3), { ok: false, reason: 'cap_reached' });
  const ok = await sendInvitations('acc_2', ev.id, 2);
  assert.equal(ok.result.ok, true);
  assert.equal(ok.exemption.used, 5);
  const blocked = await sendInvitations('acc_2', ev.id, 1);
  assert.deepEqual(blocked.result, { ok: false, reason: 'cap_reached' });
  assert.equal(blocked.event.sent, 5, 'لا يُرسل شيء عند الرفض');
});

await atest('السقف الجديد لا يقلّ عن المستخدم', async () => {
  await assert.rejects(updateExemptionCap('acc_2', 4), /لا يمكن أن يقلّ السقف/);
  const ex = await updateExemptionCap('acc_2', 8);
  assert.equal(ex.cap, 8);
  const ev = await pick('acc_2', 'حفل تجريبي');
  assert.deepEqual(await canSend('acc_2', ev.id, 3), { ok: true });
});

await atest('السحب يوقف الإرسال الجديد ويُبقي المرسل', async () => {
  const before = await pick('acc_2', 'حفل تجريبي');
  const old = await pick('acc_2', 'حفل زواج ريم');
  assert.equal(old.status, 'unpaid');
  const viaExemption = await sendInvitations('acc_2', old.id, 1);
  assert.equal(viaExemption.result.ok, true);
  assert.equal(viaExemption.event.status, 'active', 'الإعفاء النشط يفعّل المناسبة القديمة عند أول إرسال');
  const ex = await revokeExemption('acc_2');
  assert.ok(ex.revokedAt);
  const r = await sendInvitations('acc_2', before.id, 1);
  assert.deepEqual(r.result, { ok: false, reason: 'revoked' });
  const after = await pick('acc_2', 'حفل تجريبي');
  assert.equal(after.sent, before.sent);
  assert.equal(after.status, 'active', 'المناسبة المفعّلة تبقى كما هي');
  const ev2 = await createEvent('acc_2', 'بعد السحب');
  assert.equal(ev2.status, 'unpaid');
  await assert.rejects(revokeExemption('acc_2'), /مسحوب/);
});

await atest('الانتهاء يحجب ويُسجَّل مرة واحدة', async () => {
  await grantExemption('acc_4', { cap: 10, reason: 'partner', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const ev = await createEvent('acc_4', 'مناسبة شريك');
  assert.equal(ev.status, 'active');
  _debugExpire('acc_4');
  assert.deepEqual(await canSend('acc_4', ev.id, 1), { ok: false, reason: 'expired' });
  await getExemption('acc_4');
  const log = await listExemptionLog('acc_4');
  assert.deepEqual(log.map((l) => l.action), ['expire', 'grant']);
});

await atest('الباقة المدفوعة ترسل دون إعفاء، وبلا باقة no_package', async () => {
  assert.deepEqual(await canSend('acc_1', 'ev_1', 50), { ok: true });
  const ev = await createEvent('acc_1', 'بلا باقة');
  assert.equal(ev.status, 'unpaid');
  assert.deepEqual(await canSend('acc_1', ev.id, 1), { ok: false, reason: 'no_package' });
});

await atest('كل منح وتعديل وسحب وانتهاء في السجل، ولا يُحذف منه', async () => {
  const log = await listExemptionLog();
  const acc2 = log.filter((l) => l.accountId === 'acc_2').map((l) => l.action);
  assert.deepEqual(acc2, ['revoke', 'update', 'grant']);
  assert.ok(log.some((l) => l.accountId === 'acc_4' && l.action === 'expire'));
  assert.ok(log.some((l) => l.accountId === 'acc_3' && l.action === 'grant'), 'البذرة باقية');
  assert.ok(log.every((l) => l.adminId && l.at && l.cap >= 1));
  const admins = new Set(log.filter((l) => l.action !== 'expire').map((l) => l.adminId));
  assert.deepEqual([...admins], [SUPER.id]);
});

console.log(`\n${passed} اختبارات نجحت ✓`);
