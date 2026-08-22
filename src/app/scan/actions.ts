'use server';

import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

export interface ScanResult {
  ok: boolean;
  reason: string;
  message: string;
  name?: string;
  seats?: number;
  scansUsed?: number;
  remaining?: number;
  inviter?: string;
  completed?: boolean;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const MESSAGES: Record<string, string> = {
  INVALID_CODE: 'رمز غير صالح — لا ينتمي لهذه المناسبة.',
  FORBIDDEN: 'لا تملك صلاحية المسح لهذه المناسبة.',
  NOT_CONFIRMED: 'لم يؤكّد هذا المدعو حضوره.',
  CODE_EXHAUSTED: 'الكود مستخدم بالكامل — اكتمل عدد مقاعده.',
};

/** التحقق من رمز ممسوح — أونلاين مباشرة من قاعدة البيانات. */
export async function verifyScan(rawCode: string): Promise<ScanResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: 'UNAUTHENTICATED', message: 'انتهت الجلسة. سجّل الدخول من جديد.' };

  const match = UUID_RE.exec(rawCode ?? '');
  if (!match) {
    return { ok: false, reason: 'INVALID_CODE', message: 'رمز غير مقروء — حاول مرة أخرى.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('scan_qr', { p_qr_token: match[0] });

  if (error) {
    return { ok: false, reason: 'ERROR', message: 'تعذّر التحقق. تحقق من الاتصال وحاول مجدداً.' };
  }

  const res = data as {
    ok: boolean; reason: string; name?: string; seats?: number;
    scans_used?: number; remaining?: number; inviter?: string; completed?: boolean;
  } | null;

  if (!res) return { ok: false, reason: 'ERROR', message: 'استجابة غير متوقعة من الخادم.' };

  if (!res.ok) {
    return {
      ok: false,
      reason: res.reason,
      message: MESSAGES[res.reason] ?? 'الرمز غير صالح.',
      name: res.name,
      seats: res.seats,
      scansUsed: res.scans_used,
    };
  }

  return {
    ok: true,
    reason: res.reason,
    message: res.completed ? 'تم تسجيل الحضور — اكتملت مقاعد هذه الدعوة.' : 'تم تسجيل الحضور.',
    name: res.name,
    seats: res.seats,
    scansUsed: res.scans_used,
    remaining: res.remaining,
    inviter: res.inviter,
    completed: res.completed,
  };
}
