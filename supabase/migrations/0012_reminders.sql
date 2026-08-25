-- ============================================================
-- 0012 — تذكير واحد لمن لم يردّ (SPEC §4.1)
--
-- التذكير رسالة واتساب مدفوعة، وتكراره على غير الراغبين يرفع شكاوى
-- الحظر ويضرّ تقييم الرقم المشترك — فالقيد إلزامي في القاعدة لا في
-- الواجهة وحدها:
--   ١) مضى ٥ أيام كاملة على sent_at والحالة ما زالت 'sent'.
--   ٢) reminded_at IS NULL — مرة واحدة أبداً مهما تأخّر.
-- ============================================================

alter table public.guests
  add column if not exists reminded_at timestamptz;

comment on column public.guests.reminded_at is
  'وقت إرسال التذكير الوحيد. غير فارغ = ذُكِّر ولا يُذكَّر ثانيةً أبداً.';

-- فهرس للمؤهّلين: الحالة 'sent' ولم يُذكَّروا بعد
create index if not exists guests_reminder_due_idx
  on public.guests (event_id, sent_at)
  where status = 'sent' and reminded_at is null;

-- ------------------------------------------------------------
-- عدّ المؤهّلين للتذكير. المالك يعدّ مدعوّي مناسبته، والداعي مدعوّيه
-- وحده (p_inviter_id) — نطاق التذكير مقيّد كما في المواصفة.
-- ------------------------------------------------------------
create or replace function public.reminder_due_count(
  p_event_id   uuid,
  p_inviter_id uuid default null
)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
  from public.guests g
  where g.event_id = p_event_id
    and g.status = 'sent'
    and g.reminded_at is null
    and g.sent_at <= now() - interval '5 days'
    and (p_inviter_id is null or g.inviter_id = p_inviter_id);
$$;

-- ------------------------------------------------------------
-- تعليم دفعة التذكير. يُستدعى قبل الإرسال الفعلي فيقفل الصفوف
-- ويضبط reminded_at، ويرجع من عُلِّم فعلاً — فلا يُذكَّر أحد مرّتين
-- حتى لو ضُغط الزر مرّتين في اللحظة نفسها.
--
-- لا يُغيّر status: المدعو يبقى 'sent' حتى يردّ، والمقاعد تبقى محجوزة.
-- ------------------------------------------------------------
create or replace function public.mark_reminders_sent(
  p_event_id   uuid,
  p_inviter_id uuid default null
)
returns table (guest_id uuid, name text, phone text, max_seats integer, inviter_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with due as (
    select g.id
    from public.guests g
    where g.event_id = p_event_id
      and g.status = 'sent'
      and g.reminded_at is null
      and g.sent_at <= now() - interval '5 days'
      and (p_inviter_id is null or g.inviter_id = p_inviter_id)
    order by g.sent_at
    for update
  )
  update public.guests g
  set reminded_at = now()
  from due
  where g.id = due.id
  returning g.id, g.name, g.phone, g.max_seats, g.inviter_id;
end;
$$;
