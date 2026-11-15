/**
 * الإرسال اليدوي عبر واتساب (الحل المؤقّت إلى أن يكتمل ربط WhatsApp Cloud API).
 *
 * الداعي يرسل كل دعوة من واتساب جواله أو واتساب ويب برابط click-to-chat،
 * والرسالة نصّ يحمل رابط المدعو الخاص /rsvp/{token}. رابط wa.me لا يرفق
 * وسائط — فالصورة أو الفيديو يراهما المدعو داخل الرابط. منطق خالص للاختبار.
 */

export interface ManualInviteInput {
  guestName: string;
  /** وصف المناسبة كما كتبه الداعي — {{2}} في القالب الموحّد */
  occasion: string;
  /** سطر الموعد والمكان من بيانات المناسبة */
  eventLine: string;
  /** باسم من تصدر الدعوة — {{1}} في القالب الموحّد */
  signature: string;
  /** رابط المدعو الخاص */
  link: string;
  /** هل مرفق الدعوة فيديو؟ يغيّر سطر التعريف بالرابط فقط */
  hasVideo?: boolean;
}

/** نصّ الرسالة: هادئ، يبدأ بالسلام ثم «المكرّم فلان»، وينتهي بالرابط والتوقيع. */
export function buildManualMessage(i: ManualInviteInput): string {
  return [
    'السلام عليكم ورحمة الله وبركاته',
    `المكرّم ${i.guestName.trim()}`,
    `يسرّنا دعوتكم لحضور ${i.occasion.trim()}`,
    i.eventLine.trim(),
    '',
    i.hasVideo ? 'فيديو الدعوة وتأكيد الحضور:' : 'تفاصيل الدعوة وتأكيد الحضور:',
    i.link,
    '',
    i.signature.trim(),
  ].filter((line, idx, all) => line !== '' || (all[idx - 1] ?? '') !== '').join('\n').trim();
}

/** أرقام الجوال كما يطلبها wa.me: دولية بلا + ولا أصفار بادئة (٨–١٥ رقماً). */
export function waDigits(phone: string): string | null {
  const digits = (phone || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '')
    .replace(/^00/, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** رابط click-to-chat — يفتح واتساب الجوال أو واتساب ويب والنص جاهز. null لرقم غير صالح. */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}
