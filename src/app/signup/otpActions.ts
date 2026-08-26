'use server';

import { cookies } from 'next/headers';
import { requestOtp, verifyOtpAndSignIn } from '@/lib/otp';
import { normalizePhone, isValidPhone } from '@/lib/format';
import { otpUnified } from '@/lib/env';

/**
 * تدفّق دخول العميل بالجوال. بيانات الخطوة الأولى تُحفَظ في كوكي
 * قصيرة العمر حتى الخطوة الثانية — فلا تُمرَّر عبر الرابط.
 */
const PENDING = 'barqiyah_otp_pending';

interface Pending {
  phone: string;
  name: string;
  email: string;
}

export interface OtpState {
  error?: string;
  notice?: string;
  /** الرمز الموحّد في وضع المحاكاة — يُعرض في الشاشة لا يُرسل */
  unifiedCode?: string;
  step?: 'code';
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
  UNAVAILABLE: 'الخدمة غير متاحة الآن. حاول بعد قليل.',
};

/** الخطوة الأولى: الاسم والجوال (والبريد اختياري) ← إرسال الرمز. */
export async function startPhoneSignup(_prev: OtpState, formData: FormData): Promise<OtpState> {
  const name = String(formData.get('full_name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const dial = String(formData.get('dial') ?? '966').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const consent = formData.get('consent') === 'on';

  if (name.length < 3) return { error: 'اكتب اسمك الكامل.' };
  if (!consent) return { error: 'يجب الموافقة للمتابعة' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'البريد الإلكتروني غير صحيح.' };
  }

  const phone = normalizePhone(rawPhone.replace(/^0+/, ''), dial);
  if (!isValidPhone(phone)) return { error: 'رقم الجوال غير صالح. مثال: 0555123456' };

  const res = await requestOtp(phone);
  if (!res.ok) return { error: REQUEST_ERRORS[res.error] ?? REQUEST_ERRORS.UNAVAILABLE };

  const jar = await cookies();
  jar.set(PENDING, JSON.stringify({ phone, name, email } satisfies Pending), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });

  return { step: 'code', unifiedCode: res.unifiedCode };
}

/** إعادة إرسال الرمز لنفس الرقم المعلّق. */
export async function resendOtp(_prev: OtpState, _formData: FormData): Promise<OtpState> {
  const pending = await readPending();
  if (!pending) return { error: 'انتهت الجلسة — ابدأ من جديد.' };

  const res = await requestOtp(pending.phone);
  if (!res.ok) return { error: REQUEST_ERRORS[res.error] ?? REQUEST_ERRORS.UNAVAILABLE };

  return { step: 'code', notice: 'أُرسل رمز جديد.', unifiedCode: res.unifiedCode };
}

export interface VerifyState {
  error?: string;
  attemptsLeft?: number;
  /** يُعرض مرة واحدة للحساب الجديد */
  recoveryCode?: string;
  done?: boolean;
  hasEmail?: boolean;
}

/** الخطوة الثانية: التحقق من الرمز ← فتح الجلسة. */
export async function verifyPhoneCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: VERIFY_ERRORS.INVALID_CODE };

  const pending = await readPending();
  if (!pending) return { error: 'انتهت الجلسة — ابدأ من جديد.' };

  const res = await verifyOtpAndSignIn(pending.phone, code, pending.name, pending.email || undefined);

  if (!res.ok) {
    return { error: VERIFY_ERRORS[res.error] ?? VERIFY_ERRORS.INVALID_CODE, attemptsLeft: res.attemptsLeft };
  }

  const jar = await cookies();
  jar.delete(PENDING);

  // الحساب القائم يدخل مباشرةً؛ الجديد يرى رمز الاسترجاع أولاً
  return {
    done: true,
    recoveryCode: res.recoveryCode,
    hasEmail: Boolean(pending.email),
  };
}

async function readPending(): Promise<Pending | null> {
  const jar = await cookies();
  const raw = jar.get(PENDING)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pending;
  } catch {
    return null;
  }
}

/** هل نحن في وضع الرمز الموحّد؟ تستخدمه الواجهة لعرض تنبيه. */
export async function isUnifiedOtpMode(): Promise<boolean> {
  return otpUnified;
}
