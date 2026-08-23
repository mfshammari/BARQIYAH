'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { normalizePhone, isValidPhone } from '@/lib/format';
import { validateInviteVars, type InviteVars } from '@/lib/inviteVars';
import { sendInvitations } from '@/lib/invitations';
import type { Guest, Inviter } from '@/lib/types';

export interface ActionState { error?: string; notice?: string }

/** يتحقق أن المستخدم هو صاحب صفّ الداعي هذا. */
async function guardInviter(inviterId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: inviter } = await supabase
    .from('inviters').select('*').eq('id', inviterId).maybeSingle<Inviter>();

  if (!inviter) throw new Error('INVITER_NOT_FOUND');
  if (inviter.profile_id !== user.id) throw new Error('FORBIDDEN');
  return { user, supabase, inviter };
}

function revalidateInviter(id: string) {
  revalidatePath(`/inviter/${id}`);
  revalidatePath('/app');
}

/** الداعي يحفظ قالبه ونصّه وصورته — يملكها وحده. */
export async function saveInviteContent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviterId = String(formData.get('inviter_id') ?? '');
  const { supabase } = await guardInviter(inviterId);

  const vars: InviteVars = {
    host: String(formData.get('host') ?? '').trim(),
    occasion: String(formData.get('occasion') ?? '').trim(),
  };
  const templateId = String(formData.get('template_id') ?? '') || null;
  const imageUrl = String(formData.get('image_url') ?? '').trim() || null;

  const issues = validateInviteVars(vars);
  if (issues.length > 0) return { error: issues[0].message };
  if (!templateId) return { error: 'اختر قالباً من المكتبة أولاً.' };

  const { error } = await supabase
    .from('inviters')
    .update({ invite_vars: vars, template_id: templateId, image_url: imageUrl })
    .eq('id', inviterId);

  if (error) return { error: 'تعذّر حفظ دعوتك.' };
  revalidateInviter(inviterId);
  return { notice: 'حُفظت دعوتك — جاهزة للإرسال.' };
}

/** الداعي يضيف مدعواً إلى قائمته وحده. */
export async function addInviterGuest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviterId = String(formData.get('inviter_id') ?? '');
  const { supabase, inviter } = await guardInviter(inviterId);

  const name = String(formData.get('name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const maxSeats = Number(formData.get('max_seats') ?? 1);

  if (!name) return { error: 'اسم المدعو مطلوب.' };
  if (!isValidPhone(rawPhone)) return { error: 'رقم الجوال غير صالح.' };
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > 50) {
    return { error: 'عدد الأشخاص يجب أن يكون بين ١ و٥٠.' };
  }

  const { error } = await supabase.from('guests').insert({
    event_id: inviter.event_id,
    inviter_id: inviterId,
    name,
    phone: normalizePhone(rawPhone),
    max_seats: maxSeats,
    status: 'draft',
  });

  if (error) {
    if (error.code === '23505') return { error: 'هذا الرقم مضاف في هذه المناسبة مسبقاً.' };
    return { error: 'تعذّرت الإضافة.' };
  }

  revalidateInviter(inviterId);
  return { notice: `أُضيف ${name} كمسودة.` };
}

/** اختيار مدعوين من دفتر عناوين الداعي الشخصي. */
export async function addFromContacts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviterId = String(formData.get('inviter_id') ?? '');
  const { supabase, inviter, user } = await guardInviter(inviterId);

  const contactIds = formData.getAll('contact_ids').map(String).filter(Boolean);
  const seats = Number(formData.get('max_seats') ?? 1);
  if (contactIds.length === 0) return { error: 'اختر جهة واحدة على الأقل.' };

  const { data: contacts } = await supabase
    .from('contacts').select('id, name, phone').in('id', contactIds).eq('owner_id', user.id);

  if (!contacts?.length) return { error: 'لم يُعثر على الجهات المختارة.' };

  const { data, error } = await supabase
    .from('guests')
    .upsert(
      contacts.map((c) => ({
        event_id: inviter.event_id, inviter_id: inviterId,
        name: c.name, phone: c.phone, contact_id: c.id,
        max_seats: Number.isInteger(seats) && seats >= 1 ? Math.min(seats, 50) : 1,
        status: 'draft' as const,
      })),
      { onConflict: 'event_id,phone', ignoreDuplicates: true },
    )
    .select('id');

  if (error) return { error: 'تعذّرت الإضافة من الدفتر.' };

  const added = data?.length ?? 0;
  revalidateInviter(inviterId);
  return {
    notice: `أُضيف ${added} مدعواً من دفترك.` +
      (contacts.length - added > 0 ? ` (${contacts.length - added} مضاف مسبقاً)` : ''),
  };
}

const REASONS: Record<string, string> = {
  EVENT_NOT_ACTIVE: 'المناسبة غير مفعّلة بعد — راجع صاحب المناسبة.',
  GUEST_NOT_FOUND: 'المدعو غير موجود.',
  ALREADY_SENT: 'الدعوة مُرسلة مسبقاً.',
  INSUFFICIENT_QUOTA: 'حصتك لا تكفي — راجع صاحب المناسبة لزيادتها.',
  INSUFFICIENT_EVENT_SEATS: 'رصيد المناسبة نفد — راجع صاحب المناسبة.',
};

/** إرسال دعوات الداعي — تُحجز من حصته هو. */
export async function sendInviterInvitations(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inviterId = String(formData.get('inviter_id') ?? '');
  const { supabase, inviter } = await guardInviter(inviterId);

  if (!inviter.template_id || !inviter.invite_vars?.host) {
    return { error: 'اكتب نصّ دعوتك واختر قالبك قبل الإرسال.' };
  }

  const scope = String(formData.get('scope') ?? 'selected');
  let guestIds: string[] = [];

  if (scope === 'all_drafts') {
    const { data } = await supabase
      .from('guests').select('id').eq('inviter_id', inviterId).eq('status', 'draft')
      .returns<Pick<Guest, 'id'>[]>();
    guestIds = (data ?? []).map((g) => g.id);
  } else {
    guestIds = formData.getAll('guest_ids').map(String).filter(Boolean);
  }

  if (guestIds.length === 0) return { error: 'لا توجد دعوات مسودة للإرسال.' };

  const outcomes = await sendInvitations(supabase, inviter.event_id, guestIds, {
    inviterId,
    inviteVars: inviter.invite_vars as unknown as InviteVars,
    imageUrl: inviter.image_url,
    templateId: inviter.template_id,
    reasons: REASONS,
  });

  revalidateInviter(inviterId);

  const sent = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length === 0) return { notice: `أُرسلت ${sent} دعوة.` };

  const shortage = failed.filter((f) => f.missingSeats);
  const missing = shortage.reduce((s, f) => s + (f.missingSeats ?? 0), 0);
  const parts: string[] = [];
  if (sent) parts.push(`أُرسلت ${sent} دعوة.`);
  if (shortage.length) parts.push(`تعذّر إرسال ${shortage.length} لنقص حصتك — ينقصك ${missing} مقعداً.`);
  const others = failed.filter((f) => !f.missingSeats);
  if (others.length) parts.push(`فشل ${others.length}: ${others[0].reason ?? ''}`);

  return sent ? { notice: parts.join(' ') } : { error: parts.join(' ') };
}

export async function deleteInviterGuest(formData: FormData) {
  const inviterId = String(formData.get('inviter_id') ?? '');
  const { supabase } = await guardInviter(inviterId);
  await supabase.from('guests').delete()
    .eq('id', String(formData.get('guest_id') ?? '')).eq('inviter_id', inviterId);
  revalidateInviter(inviterId);
}
