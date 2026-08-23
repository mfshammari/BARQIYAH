// اختبار مصفوفة الصلاحيات (SPEC §10) — المحاسب لا يرى مراقبة واتساب.
//   node tests/permissions.test.mjs
import assert from 'node:assert/strict';
import { can, navFor, permissionsOf } from '../.test-build/lib/permissions.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('مصفوفة الصلاحيات:');

test('المدير يملك كل الصلاحيات', () => {
  for (const p of ['manual_activation','review_templates','impersonate','finance','whatsapp_settings','manage_team']) {
    assert.equal(can('admin_owner', p), true, `المدير يفتقد ${p}`);
  }
});

test('الدعم: تفعيل يدوي ودخول كالعميل فقط', () => {
  assert.equal(can('admin_support', 'manual_activation'), true);
  assert.equal(can('admin_support', 'impersonate'), true);
  assert.equal(can('admin_support', 'review_templates'), false);
  assert.equal(can('admin_support', 'finance'), false);
  assert.equal(can('admin_support', 'whatsapp_settings'), false);
});

test('المراجع: مراجعة القوالب فقط', () => {
  assert.equal(can('admin_reviewer', 'review_templates'), true);
  assert.equal(can('admin_reviewer', 'manual_activation'), false);
  assert.equal(can('admin_reviewer', 'finance'), false);
});

test('المحاسب: المالية فقط', () => {
  assert.equal(can('admin_finance', 'finance'), true);
  assert.equal(can('admin_finance', 'whatsapp_settings'), false);
  assert.equal(can('admin_finance', 'manual_activation'), false);
  assert.equal(can('admin_finance', 'manage_team'), false);
});

test('العميل والماسح بلا صلاحيات إدارية', () => {
  assert.deepEqual(permissionsOf('user'), []);
  assert.deepEqual(permissionsOf('scanner'), []);
  assert.equal(can('user', 'finance'), false);
});

test('إدارة الفريق للمدير وحده', () => {
  assert.equal(can('admin_owner', 'manage_team'), true);
  for (const r of ['admin_support','admin_reviewer','admin_finance']) {
    assert.equal(can(r, 'manage_team'), false, `${r} يملك إدارة الفريق!`);
  }
});

console.log('\nبناء القائمة من الصلاحيات:');

test('المحاسب لا يرى مراقبة واتساب في قائمته', () => {
  const hrefs = navFor('admin_finance').map((i) => i.href);
  assert.ok(!hrefs.includes('/admin/whatsapp'), 'مراقبة واتساب ظاهرة للمحاسب!');
  assert.ok(hrefs.includes('/admin/finance'), 'المالية غائبة عن المحاسب');
});

test('المراجع يرى طلبات القوالب ولا يرى المالية', () => {
  const hrefs = navFor('admin_reviewer').map((i) => i.href);
  assert.ok(hrefs.includes('/admin/template-requests'));
  assert.ok(!hrefs.includes('/admin/finance'));
  assert.ok(!hrefs.includes('/admin/team'));
});

test('المدير يرى كل العناصر', () => {
  assert.equal(navFor('admin_owner').length, 11);
});

test('العناصر بلا شرط تظهر للجميع', () => {
  for (const r of ['admin_owner','admin_support','admin_reviewer','admin_finance']) {
    const hrefs = navFor(r).map((i) => i.href);
    assert.ok(hrefs.includes('/admin'), `${r} لا يرى لوحة اليوم`);
    assert.ok(hrefs.includes('/admin/events'), `${r} لا يرى المناسبات`);
  }
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
