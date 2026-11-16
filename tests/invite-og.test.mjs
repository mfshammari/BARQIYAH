// اختبار معاينة رابط المدعو في واتساب: العنوان والزاحف وتسجيل الفتح.
//   node tests/invite-og.test.mjs
import assert from 'node:assert/strict';
import {
  OG_DESCRIPTION, OG_MAX_EDGE, OG_MAX_BYTES, OG_JPEG_QUALITIES,
  inviteTitle, ogImagePath, isPreviewBot, shouldRecordOpen,
} from '../.test-build/lib/inviteOg.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('معاينة رابط المدعو:');

test('الثوابت: «دعوة خاصة»، ١٢٠٠ بكسل، أقل من ٣٠٠ KB، درجات ضغط تنازلية', () => {
  assert.equal(OG_DESCRIPTION, 'دعوة خاصة');
  assert.equal(OG_MAX_EDGE, 1200);
  assert.equal(OG_MAX_BYTES, 307200);
  for (let i = 1; i < OG_JPEG_QUALITIES.length; i++) assert.ok(OG_JPEG_QUALITIES[i] < OG_JPEG_QUALITIES[i - 1]);
});

test('العنوان: وصف المناسبة إن كُتب وإلا النوع والجهة — بلا اسم المدعو', () => {
  assert.equal(inviteTitle({ occasionText: ' زواج ابني محمد ', occasionLabel: 'حفل زواج', hostName: 'آل الشمري' }), 'زواج ابني محمد');
  assert.equal(inviteTitle({ occasionText: '', occasionLabel: 'حفل زواج', hostName: 'آل الشمري' }), 'حفل زواج — آل الشمري');
  assert.equal(inviteTitle({ occasionText: null, occasionLabel: 'حفل تخرّج', hostName: 'الفهد' }), 'حفل تخرّج — الفهد');
});

test('مسار صورة المعاينة يحمل النوع والمعرّف والبصمة', () => {
  assert.equal(ogImagePath('event', 'abc', 'v1'), '/api/invite-og/event/abc?v=v1');
  assert.equal(ogImagePath('inviter', 'xyz', 'deadbeef'), '/api/invite-og/inviter/xyz?v=deadbeef');
});

test('زاحف واتساب وفيسبوك وتيليغرام يُعرف، والمتصفحات لا', () => {
  assert.equal(isPreviewBot('WhatsApp/2.23.20.0 A'), true);
  assert.equal(isPreviewBot('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'), true);
  assert.equal(isPreviewBot('TelegramBot (like TwitterBot)'), true);
  assert.equal(isPreviewBot(null), true);
  assert.equal(isPreviewBot(''), true);
  assert.equal(isPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isPreviewBot('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'), false);
});

test('تسجيل الفتح: مرة واحدة، لمدعو أُرسلت دعوته، من متصفح لا زاحف، وليس من حساب الداعي', () => {
  const ua = 'Mozilla/5.0 (iPhone) Safari/604.1';
  assert.equal(shouldRecordOpen({ status: 'sent', openedAt: null, userAgent: ua, viewerIsAccount: false }), true);
  assert.equal(shouldRecordOpen({ status: 'declined', openedAt: null, userAgent: ua, viewerIsAccount: false }), true);
  assert.equal(shouldRecordOpen({ status: 'sent', openedAt: '2026-01-01T00:00:00Z', userAgent: ua, viewerIsAccount: false }), false);
  assert.equal(shouldRecordOpen({ status: 'draft', openedAt: null, userAgent: ua, viewerIsAccount: false }), false);
  assert.equal(shouldRecordOpen({ status: 'sent', openedAt: null, userAgent: 'WhatsApp/2.0', viewerIsAccount: false }), false);
  assert.equal(shouldRecordOpen({ status: 'sent', openedAt: null, userAgent: ua, viewerIsAccount: true }), false);
});

console.log(`\n${passed} اختبارات نجحت.`);
