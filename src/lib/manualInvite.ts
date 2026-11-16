/**
 * الإرسال اليدوي عبر واتساب (الحل المؤقّت إلى أن يكتمل ربط WhatsApp Cloud API).
 *
 * الداعي يرسل كل دعوة من واتساب جواله أو واتساب ويب برابط click-to-chat،
 * والرسالة نصّ يحمل رابط المدعو الخاص /rsvp/{token}. رابط wa.me لا يرفق
 * وسائط — فالصورة أو الفيديو يراهما المدعو داخل الرابط. منطق خالص للاختبار.
 * نصّ الرسالة نفسه (القوالب والمتغيّرات والتوقيع) في manualMessage.ts.
 */

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
