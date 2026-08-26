'use server';

import { cookies } from 'next/headers';
import { requestOtp, verifyOtpAndSignIn, phoneHasAccount } from '@/lib/otp';
import { normalizePhone, isValidPhone } from '@/lib/format';

/**
 * دخول العميل: جوال ثم رمز — لا اسم ولا بريد ولا إقرار.
 * الدخول **لا ينشئ حساباً**: رقم بلا حساب يُوجَّه إلى التسجيل، فلا
 * نهدر رسالة واتساب مدفوعة على رقم لا حساب له.
 */
const PENDING = 'barqiyah_login_pending';

export interface LoginOtpState {
  error?: string;
  notice?: string;
  unifiedCode?: string;
  step?: 'code';
  /** الرقم كما يُعرض في الخطوة الثانية */
  phone?: string;
}

const REQUEST_ERRORS: Record<string, string> = {
  RATE_LIMITED: 'طلبت الرمز ثلاث مرات خلال ساعة. انتظر قليلاً ثم حاول.',
  INVALID_PHONE: 'رقم الجوال غير صالح.',
  SEND_FAILED: 'تعذّر إرسال الرمز على واتساب. تأكد من الرقم وحاول مرة أخرى.',
  UNAVAILABLE: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
};

const VERIFY_ERRORS: Record<string, string> = {
  INVALID_CODE: 'رمز غير صحيح',
  EXPIRED: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً.',
  TOO_MANY_ATTEMPTS: 'تجاوزت عدد المحاولات المسموحة. اطلب رمزاً جديداً.',
  NO_ACCOUNT: 'لا يوجد حساب بهذا الرقم.',
  UNAVAILABLE: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
};

/** الخطوة الأولى: الجوال ← إرسال رمز الدخول. */
export async function startPhoneLogin(
  _prev: LoginOtpState,
  formData: FormData,
): Promise<LoginOtpState> {
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const dial = String(formData.get('dial') ?? '966').trim();

  const phone = normalizePhone(rawPhone.replace(/^0+/, ''), dial);
  if (!isValidPhone(phone)) return { error: 'رقم الجوال غير صالح. مثال: 0555123456' };

  // الرقم بلا حساب: نوجّهه للتسجيل بدل إهدار رسالة مدفوعة
  if (!(await phoneHasAccount(phone))) {
    return { error: 'لا يوجد حساب بهذا الرقم — أنشئ حسابك أولاً.' };
  }

  const res = await requestOtp(phone);
  if (!res.ok) return { error: REQUEST_ERRORS[res.error] ?? REQUEST_ERRORS.UNAVAILABLE };

  const jar = await cookies();
  jar.set(PENDING, phone, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });

  return { step: 'code', unifiedCode: res.unifiedCode, phone };
}

/** إعادة إرسال رمز الدخول لنفس الرقم المعلّق. */
export async function resendLoginOtp(
  _prev: LoginOtpState,
  _formData: FormData,
): Promise<LoginOtpState> {
  const jar = await cookies();
  const phone = jar.get(PENDING)?.value;
  if (!phone) return { error: 'انتهت الجلسة — أدخل رقمك من جديد.' };

  const res = await requestOtp(phone);
  if (!res.ok) return { error: REQUEST_ERRORS[res.error] ?? REQUEST_ERRORS.UNAVAILABLE };

  return { step: 'code', notice: 'أُرسل رمز جديد.', unifiedCode: res.unifiedCode, phone };
}

export interface LoginVerifyState {
  error?: string;
  attemptsLeft?: number;
  done?: boolean;
}

/** الخطوة الثانية: الرمز ← فتح الجلسة. */
export async function verifyLoginCode(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: VERIFY_ERRORS.INVALID_CODE };

  const jar = await cookies();
  const phone = jar.get(PENDING)?.value;
  if (!phone) return { error: 'انتهت الجلسة — أدخل رقمك من جديد.' };

  const res = await verifyOtpAndSignIn(phone, code, undefined, undefined, {
    createIfMissing: false,
  });

  if (!res.ok) {
    return {
      error: VERIFY_ERRORS[res.error] ?? VERIFY_ERRORS.INVALID_CODE,
      attemptsLeft: res.attemptsLeft,
    };
  }

  jar.delete(PENDING);
  return { done: true };
}
