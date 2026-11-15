// اختبار مرفق الدعوة: تمييز الفيديو من الصورة وحدود الرفع.
//   node tests/invite-media.test.mjs
import assert from 'node:assert/strict';
import {
  isVideoPath, isQuickTimePath, checkInviteMedia, checkVideoDuration, formatDuration, cacheSecondsFor,
  resumableEndpoint, uploadPercent, formatMegabytes,
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_MB_LABEL, MAX_VIDEO_SECONDS, VIDEO_CACHE_SECONDS, IMAGE_CACHE_SECONDS,
  TUS_CHUNK_BYTES, INVITE_MEDIA_ACCEPT,
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

test('يقبل الصورة حتى ٥ م.ب والفيديو حتى ٢٠٠ م.ب (حدّ المخزن في 0023)', () => {
  assert.equal(MAX_VIDEO_BYTES, 209715200);
  assert.equal(MAX_VIDEO_MB_LABEL, '٢٠٠');
  assert.deepEqual(checkInviteMedia({ type: 'image/png', size: MAX_IMAGE_BYTES }), { ok: true, kind: 'image', ext: 'png' });
  assert.deepEqual(checkInviteMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES }), { ok: true, kind: 'video', ext: 'mp4' });
  assert.deepEqual(checkInviteMedia({ type: 'video/quicktime', size: 1024 }), { ok: true, kind: 'video', ext: 'mov' });
});

test('يرفض ما زاد عن الحدّ وما ليس صورة ولا فيديو', () => {
  assert.equal(checkInviteMedia({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }).ok, false);
  const tooBig = checkInviteMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 });
  assert.equal(tooBig.ok, false);
  assert.ok(tooBig.error.includes('٢٠٠ ميغابايت'));
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

test('MOV وحده يُعرف كـQuickTime — لتنبيه أندرويد', () => {
  assert.equal(isQuickTimePath('u/e/1.mov'), true);
  assert.equal(isQuickTimePath('u/e/1.MOV?v=1'), true);
  assert.equal(isQuickTimePath('u/e/1.mp4'), false);
  assert.equal(isQuickTimePath(null), false);
});

test('مدة الفيديو: حتى ثلاث دقائق، وما زاد يُرفض برسالة عربية', () => {
  assert.equal(MAX_VIDEO_SECONDS, 180);
  assert.deepEqual(checkVideoDuration(45), { ok: true });
  assert.deepEqual(checkVideoDuration(MAX_VIDEO_SECONDS), { ok: true });
  const r = checkVideoDuration(MAX_VIDEO_SECONDS + 1);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('ثلاث دقائق'));
  assert.ok(r.error.includes('٣:٠١'));
});

test('مدة غير معروفة لا تُرفض — الحجم هو الحاجز', () => {
  assert.deepEqual(checkVideoDuration(NaN), { ok: true });
  assert.deepEqual(checkVideoDuration(Infinity), { ok: true });
  assert.deepEqual(checkVideoDuration(0), { ok: true });
});

test('تنسيق المدة بالأرقام العربية', () => {
  assert.equal(formatDuration(0), '٠:٠٠');
  assert.equal(formatDuration(65), '١:٠٥');
  assert.equal(formatDuration(155.6), '٢:٣٦');
});

test('كاش الفيديو سنة والصورة ساعة', () => {
  assert.equal(VIDEO_CACHE_SECONDS, 31536000);
  assert.equal(IMAGE_CACHE_SECONDS, 3600);
  assert.equal(cacheSecondsFor('video'), VIDEO_CACHE_SECONDS);
  assert.equal(cacheSecondsFor('image'), IMAGE_CACHE_SECONDS);
});

test('الرفع القابل للاستئناف: نقطة Supabase وقطع ٦ م.ب', () => {
  assert.equal(TUS_CHUNK_BYTES, 6291456);
  assert.equal(resumableEndpoint('https://x.supabase.co'), 'https://x.supabase.co/storage/v1/upload/resumable');
  assert.equal(resumableEndpoint('https://x.supabase.co/'), 'https://x.supabase.co/storage/v1/upload/resumable');
});

test('نسبة التقدّم محصورة بين ٠ و١٠٠', () => {
  assert.equal(uploadPercent(0, 100), 0);
  assert.equal(uploadPercent(50, 200), 25);
  assert.equal(uploadPercent(999, 100), 100);
  assert.equal(uploadPercent(10, 0), 0);
  assert.equal(uploadPercent(1, 3), 33);
});

test('حجم الملف بالأرقام العربية', () => {
  assert.ok(formatMegabytes(150 * 1024 * 1024).startsWith('١٥٠'));
  assert.ok(formatMegabytes(1.5 * 1024 * 1024).includes('١'));
  assert.ok(formatMegabytes(42 * 1024 * 1024).endsWith('م.ب'));
});

console.log(`\n${passed} اختبارات نجحت.`);
