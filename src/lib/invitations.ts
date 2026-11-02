import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { buildButtonPayloads, buildSeatsPayload, getWhatsAppProvider, getReminderTemplateName } from '@/lib/whatsapp';
import type { EventRow, Guest, ImageMode, Inviter, Template, WhatsAppCategory } from '@/lib/types';
import { resolveHeaderImage } from '@/lib/inviteImage';
import { formatEventLine } from '@/lib/format';
import {
  buildInviteParams, hasInviteVars, renderInvite, DEFAULT_META_TEMPLATE_NAME, type InviteVars,
} from '@/lib/inviteVars';


export interface SendOutcome {
  guestId: string;
  name: string;
  ok: boolean;
  /** سبب مقروء بالعربية عند الفشل */
  reason?: string;
  missingSeats?: number;
}

interface ReserveRow {
  guest_id: string;
  ok: boolean;
  reason: string;
  missing_seats: number;
}

const RESERVE_REASONS: Record<string, string> = {
  EVENT_NOT_ACTIVE: 'المناسبة غير مفعّلة — فعّل الباقة للمتابعة.',
  TRIAL_EXHAUSTED: 'انتهت دعواتك التجريبية — فعّل الباقة للمتابعة.',
  GUEST_NOT_FOUND: 'المدعو غير موجود.',
  ALREADY_SENT: 'الدعوة مُرسلة مسبقاً.',
  INSUFFICIENT_SEATS: 'الرصيد لا يكفي لحجز مقاعد هذه الدعوة.',
  INVITE_TEXT_MISSING: 'اكتب نصّ دعوتك من صفحة دعوتي قبل الإرسال.',
};

/** سطر سجل الرسائل — يُكتب بـ service role حتى لا تحجبه سياسات RLS. */
async function logMessage(row: Record<string, unknown>) {
  if (!adminClientAvailable) return;
  try {
    await createAdminClient().from('message_logs').insert(row);
  } catch {
    /* السجل ثانوي — لا يوقف الإرسال */
  }
}

/**
 * القالب الموحّد الوحيد للمنصة: اسمه في Meta وتصنيفه من الصف is_default.
 * في المحاكاة (أو قبل تشغيل الترحيل) يبقى الاسم الافتراضي barqiyah_invite.
 */
export async function loadDefaultTemplate(
  supabase: SupabaseClient,
): Promise<{ metaName: string; category: WhatsAppCategory }> {
  try {
    const { data } = await supabase
      .from('templates').select('meta_template_name, whatsapp_category')
      .eq('is_default', true).maybeSingle<Pick<Template, 'meta_template_name' | 'whatsapp_category'>>();
    return {
      metaName: data?.meta_template_name || DEFAULT_META_TEMPLATE_NAME,
      category: data?.whatsapp_category ?? 'utility',
    };
  } catch {
    return { metaName: DEFAULT_META_TEMPLATE_NAME, category: 'utility' };
  }
}

/** إرسال باسم داعٍ: بحصته ونصّه وصورته — والقالب واحد للجميع. */
export interface InviterContext {
  inviterId: string;
  inviteVars: InviteVars;
  imageMode: ImageMode;
  imageUrl: string | null;
  reasons?: Record<string, string>;
}

/**
 * إرسال دعوات: يحجز المقاعد ذرّياً في قاعدة البيانات أولاً،
 * ثم يرسل عبر واتساب، ويحرّر الحجز عند فشل الإرسال.
 *
 * القالب واحد للجميع بثلاثة متغيّرات: [host, occasion, eventLine].
 * مع سياق داعٍ: الحجز من حصته، والنص والصورة من عنده؛ وإلا من المالك
 * (events.invite_vars) — وسطر الموعد يُحقن من بيانات المناسبة (SPEC §6).
 */
export async function sendInvitations(
  supabase: SupabaseClient,
  eventId: string,
  guestIds: string[],
  inviterCtx?: InviterContext,
): Promise<SendOutcome[]> {
  if (guestIds.length === 0) return [];

  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).maybeSingle<EventRow>();
  if (!event) return guestIds.map((id) => ({ guestId: id, name: '', ok: false, reason: 'المناسبة غير موجودة.' }));

  // المتغيّران: من الداعي أو من المالك — وبدونهما لا إرسال
  const vars: Partial<InviteVars> = inviterCtx
    ? inviterCtx.inviteVars
    : ((event.invite_vars ?? {}) as Partial<InviteVars>);

  const { data: guests } = await supabase
    .from('guests').select('*').in('id', guestIds).eq('event_id', eventId)
    .returns<Guest[]>();
  const guestMap = new Map((guests ?? []).map((g) => [g.id, g]));

  if (!hasInviteVars(vars)) {
    return guestIds.map((id) => ({
      guestId: id, name: guestMap.get(id)?.name ?? '', ok: false,
      reason: RESERVE_REASONS.INVITE_TEXT_MISSING,
    }));
  }

  // 1) الحجز الذرّي — من حصة الداعي إن وُجد سياقه، وإلا من رصيد المناسبة
  const { data: reserved, error: reserveError } = inviterCtx
    ? await supabase.rpc('reserve_seats_for_inviter', {
        p_inviter_id: inviterCtx.inviterId,
        p_guest_ids: guestIds,
      })
    : await supabase.rpc('reserve_seats_for_send', {
        p_event_id: eventId,
        p_guest_ids: guestIds,
      });

  if (reserveError) {
    const msg = reserveError.message.includes('FORBIDDEN')
      ? 'لا تملك صلاحية الإرسال لهذه المناسبة.'
      : 'تعذّر حجز المقاعد. حاول مرة أخرى.';
    return guestIds.map((id) => ({
      guestId: id, name: guestMap.get(id)?.name ?? '', ok: false, reason: msg,
    }));
  }

  const rows = (reserved ?? []) as ReserveRow[];
  const outcomes: SendOutcome[] = [];
  const toSend: ReserveRow[] = [];

  for (const row of rows) {
    if (row.ok) { toSend.push(row); continue; }
    const reasons = { ...RESERVE_REASONS, ...(inviterCtx?.reasons ?? {}) };
    outcomes.push({
      guestId: row.guest_id,
      name: guestMap.get(row.guest_id)?.name ?? '',
      ok: false,
      reason: reasons[row.reason] ?? 'تعذّر الإرسال.',
      missingSeats: row.missing_seats || undefined,
    });
  }

  if (toSend.length === 0) return outcomes;

  // 2) الإرسال الفعلي
  const provider = await getWhatsAppProvider();

  const { metaName: templateName } = await loadDefaultTemplate(supabase);

  // سطر الموعد والمكان: من حقول المناسبة وحدها، مصدره واحد لكل الدعاة
  const eventLine = formatEventLine({
    dateGregorian: event.event_date,
    dateHijri: event.event_date_hijri,
    weekday: event.event_weekday,
    time: event.event_time,
    venue: event.venue,
  });

  // دائماً ثلاثة متغيّرات — للمالك والداعي والمحاكاة وMeta
  const bodyParams = buildInviteParams(vars, eventLine);

  // الداعي بصورته، والمالك بصورته — لا fallback إلى صورة قالب.
  // المرفوعة رابط Storage العام، والمولَّدة مسار التوليد ببصمة البيانات.
  const headerImage = resolveHeaderImage(
    inviterCtx
      ? {
          kind: 'inviter', id: inviterCtx.inviterId,
          imageMode: inviterCtx.imageMode, imageUrl: inviterCtx.imageUrl,
          version: [vars.host, vars.occasion, event.event_date, event.event_time, event.venue],
        }
      : {
          kind: 'event', id: event.id,
          imageMode: event.image_mode, imageUrl: event.image_url,
          version: [vars.host, vars.occasion, event.event_date, event.event_time, event.venue, event.host_name],
        },
  );

  for (const row of toSend) {
    const guest = guestMap.get(row.guest_id);
    if (!guest) continue;

    const result = await provider.sendTemplate({
      to: guest.phone,
      templateName,
      languageCode: 'ar',
      headerImageUrl: headerImage,
      bodyParams,
      buttonPayloads: buildButtonPayloads(guest.invite_token),
    });

    await logMessage({
      event_id: eventId, guest_id: guest.id, kind: 'invitation',
      inviter_id: inviterCtx?.inviterId ?? guest.inviter_id ?? null,
      template_name: templateName,
      meta_message_id: result.messageId ?? null,
      provider: result.provider, to_phone: guest.phone,
      status: result.ok ? 'sent' : 'failed',
      message_id: result.messageId ?? null, error: result.error ?? null,
      payload: {
        rendered: renderInvite(vars, eventLine),
        rsvp_url: appUrl(`/rsvp/${guest.invite_token}`),
        body_params: bodyParams,
      },
    });

    if (result.ok) {
      outcomes.push({ guestId: guest.id, name: guest.name, ok: true });
    } else {
      // تحرير الحجز حتى لا يُستهلك الرصيد على رسالة لم تصل
      if (inviterCtx) {
        await supabase.rpc('release_inviter_hold', { p_guest_id: guest.id });
      } else {
        await supabase.rpc('release_seat_hold', { p_guest_id: guest.id });
      }
      outcomes.push({
        guestId: guest.id, name: guest.name, ok: false,
        reason: result.error ? `فشل الإرسال: ${result.error}` : 'فشل الإرسال عبر واتساب.',
      });
    }
  }

  return outcomes;
}

/**
 * بعد ضغط زر «تأكيد الحضور»: نسأل المدعو عن العدد الفعلي.
 * دعوة بمقعد واحد لا تحتاج سؤالاً. حتى ١٠ مقاعد نعرض قائمة تفاعلية داخل واتساب،
 * وما فوقها نرسل رابط صفحة الرد لأن Meta تحدّ القائمة بعشرة صفوف.
 */
export async function askForSeatCount(guestId: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminClientAvailable) return { ok: false, error: 'service role غير مضبوط' };

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*').eq('id', guestId).maybeSingle<Guest>();
  if (!guest) return { ok: false, error: 'المدعو غير موجود' };

  const provider = await getWhatsAppProvider();
  const rsvpUrl = appUrl(`/rsvp/${guest.invite_token}`);

  const result = guest.max_seats <= 10
    ? await provider.sendList({
        to: guest.phone,
        header: 'تأكيد الحضور',
        body: 'كم عدد الحاضرين معكم؟ اختر العدد الفعلي من القائمة.',
        footer: `دعوتكم تتسع لـ ${guest.max_seats}`,
        buttonLabel: 'اختيار العدد',
        rows: Array.from({ length: guest.max_seats }, (_, i) => ({
          id: buildSeatsPayload(guest.invite_token, i + 1),
          title: `${i + 1}`,
          description: i === 0 ? 'شخص واحد' : `${i + 1} أشخاص`,
        })),
      })
    : await provider.sendText({
        to: guest.phone,
        text:
          `شكراً لتأكيدكم. حدّدوا عدد الحاضرين الفعلي من هذا الرابط ` +
          `(الحد الأقصى ${guest.max_seats}):\n${rsvpUrl}`,
      });

  await logMessage({
    event_id: guest.event_id, guest_id: guest.id, kind: 'seat_prompt',
    provider: result.provider, to_phone: guest.phone,
    status: result.ok ? 'sent' : 'failed',
    message_id: result.messageId ?? null, error: result.error ?? null,
    payload: { max_seats: guest.max_seats, rsvp_url: rsvpUrl },
  });

  return { ok: result.ok, error: result.error };
}

/**
 * إرسال الباركود للمدعو بعد تأكيده.
 * رسالة صورة حرّة داخل نافذة الخدمة (24 ساعة) لأن التأكيد فتحها للتو.
 * TODO: confirm with owner — هل نستخدم قالباً مدفوعاً منفصلاً بدل الرسالة الحرّة؟
 */
export async function sendQrToGuest(guestId: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminClientAvailable) return { ok: false, error: 'service role غير مضبوط' };

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*').eq('id', guestId).maybeSingle<Guest>();
  if (!guest?.qr_token) return { ok: false, error: 'لا يوجد رمز للمدعو' };

  const { data: event } = await admin
    .from('events').select('*').eq('id', guest.event_id).maybeSingle<EventRow>();

  const pageUrl = appUrl(`/i/${guest.qr_token}`);
  const imageUrl = appUrl(`/api/qr/${guest.qr_token}`);
  const seats = guest.confirmed_seats ?? 1;

  const provider = await getWhatsAppProvider();
  const caption =
    `تم تأكيد حضوركم — ${event?.host_name ?? ''}\n` +
    `عدد المقاعد: ${seats}\n` +
    `يُرجى إظهار هذا الرمز عند البوابة.\n${pageUrl}`;

  const result = await provider.sendImage({ to: guest.phone, imageUrl, caption });

  await logMessage({
    event_id: guest.event_id, guest_id: guest.id, kind: 'qr',
    provider: result.provider, to_phone: guest.phone,
    status: result.ok ? 'sent' : 'failed',
    message_id: result.messageId ?? null, error: result.error ?? null,
    payload: { page_url: pageUrl, image_url: imageUrl, seats },
  });

  return { ok: result.ok, error: result.error };
}

/* ============================================================
   رابط انضمام الداعي عبر واتساب (المرحلة ٦)
   ============================================================ */

/** اسم قالب رابط الانضمام في Meta: متغيّران — اسم المناسبة والرابط. */
export const INVITER_INVITE_TEMPLATE = 'barqiyah_inviter_invite';

/**
 * يرسل للداعي الذي لا حساب له رابط انضمامه عبر قالب barqiyah_inviter_invite
 * ويسجّله في message_logs بـ kind='inviter_invite'. في المحاكاة يُطبع.
 */
export async function sendInviterInviteLink(
  inviter: Pick<Inviter, 'id' | 'event_id' | 'name' | 'phone' | 'invite_token'>,
  event: Pick<EventRow, 'internal_name' | 'host_name'>,
): Promise<{ ok: boolean; error?: string }> {
  if (!inviter.phone) return { ok: false, error: 'الداعي بلا جوال.' };

  const provider = await getWhatsAppProvider();
  const link = appUrl(`/join/${inviter.invite_token}`);
  const eventName = event.internal_name || event.host_name;

  const result = await provider.sendTemplate({
    to: inviter.phone,
    templateName: INVITER_INVITE_TEMPLATE,
    languageCode: 'ar',
    bodyParams: [eventName, link],
  });

  await logMessage({
    event_id: inviter.event_id, guest_id: null, inviter_id: inviter.id, kind: 'inviter_invite',
    template_name: INVITER_INVITE_TEMPLATE,
    meta_message_id: result.messageId ?? null,
    provider: result.provider, to_phone: inviter.phone,
    status: result.ok ? 'sent' : 'failed',
    message_id: result.messageId ?? null, error: result.error ?? null,
    payload: { join_url: link, event_name: eventName, inviter_name: inviter.name },
  });

  return { ok: result.ok, error: result.error };
}

/* ============================================================
   التذكير — رسالة واحدة لمن لم يردّ (SPEC §4.1)
   ============================================================ */

export interface ReminderOutcome {
  sent: number;
  failed: number;
  /** لم يكن هناك مؤهّل أصلاً */
  none: boolean;
}

/**
 * تذكير من لم يردّ. الاستحقاق والقيد «مرة واحدة» محسومان في القاعدة:
 * `mark_reminders_sent` تقفل الصفوف وتضبط `reminded_at` وترجع من
 * عُلِّم فعلاً — فالضغط مرّتين لا يذكّر أحداً مرّتين.
 *
 * التذكير لا يغيّر الحالة ولا يحرّر المقاعد: المدعو يبقى `sent`.
 * مع `inviterId` يقتصر على مدعوّي ذلك الداعي وحده.
 */
export async function sendReminders(
  supabase: SupabaseClient,
  eventId: string,
  inviterId?: string,
): Promise<ReminderOutcome> {
  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).maybeSingle<EventRow>();
  if (!event) return { sent: 0, failed: 0, none: true };

  // التعليم أولاً: من عُلِّم هنا هو من نرسل له — لا أحد غيره
  const { data: marked, error } = await supabase.rpc('mark_reminders_sent', {
    p_event_id: eventId,
    p_inviter_id: inviterId ?? null,
  });

  if (error) return { sent: 0, failed: 0, none: true };

  const due = (marked ?? []) as {
    guest_id: string; name: string; phone: string; max_seats: number; inviter_id: string | null;
  }[];
  if (due.length === 0) return { sent: 0, failed: 0, none: true };

  const eventLine = formatEventLine({
    dateGregorian: event.event_date,
    dateHijri: event.event_date_hijri,
    weekday: event.event_weekday,
    time: event.event_time,
    venue: event.venue,
  });

  // {{1}} الجهة الداعية كما كتبها صاحب الدعوة: الداعي لمدعوّيه والمالك لمدعوّيه
  const ownerVars = (event.invite_vars ?? {}) as Partial<InviteVars>;
  const inviterIds = Array.from(new Set(due.map((g) => g.inviter_id).filter(Boolean))) as string[];
  const { data: inviterRows } = inviterIds.length
    ? await supabase.from('inviters').select('id, profile_id, invite_vars').in('id', inviterIds)
    : { data: [] as { id: string; profile_id: string | null; invite_vars: Record<string, string> }[] };
  const hostFor = (inviterId: string | null): string => {
    const row = (inviterRows ?? []).find((r) => r.id === inviterId);
    const v = (row?.invite_vars ?? {}) as Partial<InviteVars>;
    if (row && row.profile_id !== event.owner_id && v.host?.trim()) return v.host.trim();
    return ownerVars.host?.trim() || event.host_name;
  };

  // التذكير قالب معتمد لا نصّ حرّ (قرار محسوم): {{1}} الداعي، {{2}} الموعد
  const templateName = await getReminderTemplateName();
  const provider = await getWhatsAppProvider();
  let sent = 0;
  let failed = 0;

  for (const g of due) {
    const { data: guestRow } = await supabase
      .from('guests').select('invite_token').eq('id', g.guest_id).maybeSingle<{ invite_token: string }>();
    const bodyParams = [hostFor(g.inviter_id), eventLine];

    const res = await provider.sendTemplate({
      to: g.phone,
      templateName,
      languageCode: 'ar',
      bodyParams,
      buttonPayloads: guestRow ? buildButtonPayloads(guestRow.invite_token) : undefined,
    });
    if (res.ok) sent += 1;
    else failed += 1;

    await logMessage({
      event_id: eventId, guest_id: g.guest_id, kind: 'reminder',
      inviter_id: g.inviter_id ?? inviterId ?? null,
      template_name: templateName,
      meta_message_id: res.messageId ?? null,
      provider: res.provider, to_phone: g.phone,
      status: res.ok ? 'sent' : 'failed',
      message_id: res.messageId ?? null, error: res.error ?? null,
      payload: { body_params: bodyParams, rsvp_url: guestRow ? appUrl(`/rsvp/${guestRow.invite_token}`) : null },
    });
  }

  return { sent, failed, none: false };
}
