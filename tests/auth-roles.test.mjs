// اختبار الأدوار: كل الأدوار الإدارية تفتح المناسبات، والصلاحيات من المصفوفة،
// والعميل يصل إلى شاشة المسح (المرحلة ١).
//   node tests/auth-roles.test.mjs
import assert from 'node:assert/strict';
import {
  ADMIN_ROLES, CLIENT_ROLES, canAccessEvent, canOpenScanner,
  hasAdminPermission, homePathForRole, isAdminRole, isClientRole,
} from '../.test-build/lib/roles.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const OWNER = 'u-owner';
const STRANGER = 'u-stranger';

console.log('الوصول إلى المناسبة (requireEventAccess):');

test('admin_owner يمرّ إلى أي مناسبة', () => {
  assert.equal(canAccessEvent({ role: 'admin_owner', userId: STRANGER }, OWNER), true);
});

test('admin_support يمرّ إلى أي مناسبة', () => {
  assert.equal(canAccessEvent({ role: 'admin_support', userId: STRANGER }, OWNER), true);
});

test('كل الأدوار الإدارية تمرّ — لا فحص حرفي على admin', () => {
  for (const r of ADMIN_ROLES) {
    assert.equal(canAccessEvent({ role: r, userId: STRANGER }, OWNER), true, `${r} لا يمرّ`);
  }
});

test('المالك يمرّ إلى مناسبته فقط', () => {
  assert.equal(canAccessEvent({ role: 'user', userId: OWNER }, OWNER), true);
  assert.equal(canAccessEvent({ role: 'user', userId: STRANGER }, OWNER), false);
  assert.equal(canAccessEvent({ role: 'owner', userId: OWNER }, OWNER), true);
});

test('الماسح لا يفتح لوحة مناسبة غيره', () => {
  assert.equal(canAccessEvent({ role: 'scanner', userId: STRANGER }, OWNER), false);
});

console.log('\nالصلاحيات الإدارية (requireAdminPermission):');

test('admin_finance لا يمرّ من التفعيل اليدوي', () => {
  assert.equal(hasAdminPermission('admin_finance', 'manual_activation'), false);
});

test('admin_support يمرّ من التفعيل اليدوي', () => {
  assert.equal(hasAdminPermission('admin_support', 'manual_activation'), true);
});

test('admin القديم يُعامل كـ admin_owner', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(hasAdminPermission('admin', 'manage_team'), true);
  assert.equal(homePathForRole('admin'), '/admin');
});

test('العميل لا يملك أي صلاحية إدارية ولو وُجدت في المصفوفة', () => {
  assert.equal(hasAdminPermission('user', 'finance'), false);
  assert.equal(hasAdminPermission('scanner', 'finance'), false);
});

console.log('\nشاشة المسح:');

test('user يصل إلى /scan', () => {
  assert.equal(canOpenScanner('user'), true);
});

test('owner القديم يُعامل كـ user ويصل إلى /scan', () => {
  assert.equal(isClientRole('owner'), true);
  assert.equal(homePathForRole('owner'), '/app');
  assert.equal(canOpenScanner('owner'), true);
});

test('الماسح والأدمن يصلان أيضاً', () => {
  assert.equal(canOpenScanner('scanner'), true);
  assert.equal(canOpenScanner('admin_owner'), true);
});

test('أدوار العميل معرّفة في مكان واحد', () => {
  assert.deepEqual(CLIENT_ROLES, ['user', 'owner']);
});

console.log(`\n✓ نجحت ${passed} حالة اختبار`);
