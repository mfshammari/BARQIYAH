// اختبار مرفق الدعوة: تمييز الفيديو من الصورة وحدود الرفع.
//   node tests/invite-media.test.mjs
import assert from 'node:assert/strict';
import {
  isVideoPath, checkInviteMedia, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, INVITE_MEDIA_ACCEPT,
} from '../.test-build/lib/inviteMedia.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('مرفق الدعوة:');

test('الفيديو يُعرف من الامتداد — مسار أو رابط كامل', () => {
  assert.equal(isVideoPath('uid/evt/1700000000.mp4'), true);
  assert.equal(isVideoPath('uid/evt/1700000000.MOV'), true);
  assert.equal(isVideoPath('https://x.supabase.co/storage/v1/object/public/invite-images/u/e/1.webm?v=2'), true);
});

test('الصورة والفارغ ليسا فيديو', () => {
  assert.equal(isVideoPath('uid/evt/1700000000.jpg'), false);
  assert.equal(isVideoPath('uid/evt/1700000000.webp'), false);
  assert.equal(isVideoPath('uid/mp4/1700000000.png'), false);
  assert.equal(isVideoPath(null), false);
  assert.equal(isVideoPath(''), false);
});

test('يقبل الصورة حتى ٥ م.ب والفيديو حتى ٥٠ م.ب', () => {
  assert.deepEqual(checkInviteMedia({ type: 'image/png', size: MAX_IMAGE_BYTES }), { ok: true, kind: 'image', ext: 'png' });
  assert.deepEqual(checkInviteMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES }), { ok: true, kind: 'video', ext: 'mp4' });
  assert.deepEqual(checkInviteMedia({ type: 'video/quicktime', size: 1024 }), { ok: true, kind: 'video', ext: 'mov' });
});

test('يرفض ما زاد عن الحدّ وما ليس صورة ولا فيديو', () => {
  assert.equal(checkInviteMedia({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }).ok, false);
  assert.equal(checkInviteMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }).ok, false);
  assert.equal(checkInviteMedia({ type: 'application/pdf', size: 10 }).ok, false);
  assert.equal(checkInviteMedia({ type: '', size: 10 }).ok, false);
});

test('امتداد كل نوع مقبول يُعرف لاحقاً بنوعه الصحيح', () => {
  for (const type of INVITE_MEDIA_ACCEPT.split(',')) {
    const r = checkInviteMedia({ type, size: 1 });
    assert.ok(r.ok);
    assert.equal(isVideoPath(`u/e/1.${r.ext}`), r.kind === 'video');
  }
});

console.log(`\n${passed} اختبارات نجحت.`);
