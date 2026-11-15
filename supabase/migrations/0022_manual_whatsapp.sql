-- ============================================================
-- 0022 — الحل المؤقّت (زر واتساب) على البيانات الحقيقية
--
-- ١) نصّ رسالة واتساب اليدوية يُحفظ لكل مناسبة (المالك) ولكل داعٍ:
--    manual_message jsonb = {"template": "formal"|"friendly"|"brief",
--                            "texts": {"formal": "…", …}}  — النصوص المعدَّلة فقط.
-- ٢) توقيع الداعي الفرعي: sign_by = both | owner | sub (صاحب المناسبة بلا خيار).
-- ٣) guests.opened_at: أول فتح لصفحة المدعو /rsvp/[token].
-- ٤) event_owner_name: اسم حساب صاحب المناسبة للداعي (RLS تمنعه من profiles).
-- ============================================================

alter table public.events
  add column if not exists manual_message jsonb not null default '{}'::jsonb;

alter table public.inviters
  add column if not exists manual_message jsonb not null default '{}'::jsonb,
  add column if not exists sign_by text not null default 'both';

do $$ begin
  alter table public.inviters
    add constraint inviters_sign_by_check check (sign_by in ('both', 'owner', 'sub'));
exception when duplicate_object then null; end $$;

comment on column public.events.manual_message is
  'نصّ رسالة واتساب اليدوية للمالك: {"template": …, "texts": {…}}. المتغيّرات {الاسم} {المناسبة} {التاريخ} {المكان} {الرابط} {التوقيع}.';
comment on column public.inviters.manual_message is
  'نصّ رسالة واتساب اليدوية للداعي — يملكه الداعي وحده كنصّ دعوته.';
comment on column public.inviters.sign_by is
  'باسم من تصدر دعوة الداعي الفرعي: both (الاثنين) | owner (صاحب المناسبة) | sub (الداعي الفرعي).';

alter table public.guests
  add column if not exists opened_at timestamptz;

comment on column public.guests.opened_at is
  'أول فتح لصفحة المدعو — يُسجَّل من الخادم ويُستثنى زاحف معاينة واتساب وجلسات أصحاب الحساب.';

-- ---------- المالك لا يملك نصّ رسالة الداعي ولا توقيعه ----------
create or replace function public.guard_inviter_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
begin
  if auth.uid() is null then
    return new;  -- كود خادم موثوق
  end if;

  select (e.owner_id = auth.uid()) into v_is_owner
  from public.events e where e.id = new.event_id;

  if coalesce(v_is_owner, false) or public.is_admin() then
    -- المالك لا يملك نصّ الداعي ولا قالبه ولا صورته ولا رسالته ولا توقيعه
    if new.template_id is distinct from old.template_id
       or new.invite_vars is distinct from old.invite_vars
       or new.image_url is distinct from old.image_url
       or new.manual_message is distinct from old.manual_message
       or new.sign_by is distinct from old.sign_by then
      raise exception 'INVITER_CONTENT_IS_OWNED_BY_INVITER'
        using hint = 'نص الداعي وقالبه وصورته ورسالته يملكها الداعي وحده.';
    end if;
    return new;
  end if;

  -- الداعي نفسه: يملك نصّه، ولا يملك حصته ولا صفته
  if new.profile_id = auth.uid() then
    if new.seats_quota is distinct from old.seats_quota then
      raise exception 'SEATS_QUOTA_IS_OWNED_BY_EVENT_OWNER'
        using hint = 'الحصة يوزّعها صاحب المناسبة وحده.';
    end if;
    if new.event_id is distinct from old.event_id
       or new.profile_id is distinct from old.profile_id
       or new.role_label is distinct from old.role_label then
      raise exception 'FORBIDDEN_FIELD_CHANGE';
    end if;
    return new;
  end if;

  raise exception 'FORBIDDEN';
end;
$$;

-- ---------- اسم حساب صاحب المناسبة — للتوقيع في رسالة الداعي ----------
-- RLS على profiles تمنع الداعي من قراءة حساب المالك؛ الاسم وحده يُكشف
-- لمن له صفة في المناسبة. يعود إلى host_name إن كان الاسم فارغاً.
create or replace function public.event_owner_name(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(p.full_name), ''), e.host_name)
  from public.events e
  join public.profiles p on p.id = e.owner_id
  where e.id = p_event_id
    and (e.owner_id = auth.uid()
         or public.is_inviter_in(e.id)
         or public.is_admin()
         or auth.uid() is null);
$$;

revoke all on function public.event_owner_name(uuid) from public, anon;
grant execute on function public.event_owner_name(uuid) to authenticated, service_role;
