-- ============================================================
-- 0021 — الإعفاء من الدفع (باقة ضيافة)
--
-- سوبر أدمن (admin_owner، وadmin القديم) يمنح حساباً سقفاً من الدعوات
-- المجانية. الحساب المعفى تُفعَّل مناسباته بلا دفع، ويُخصم من السقف كل
-- مدعو يُرسَل له في جميع مناسباته (مدعو = دعوة واحدة أياً كانت مقاعده).
--
-- القاعدة تُطبَّق هنا لا في الواجهة: المنح والسحب يفحصان صفة المستدعي،
-- والحجز قبل الإرسال يفحص الإعفاء والمتبقي من السقف، والسجل لا يُحذف منه.
-- ============================================================

do $$ begin
  alter type transaction_type add value if not exists 'exemption';
exception when others then null; end $$;

-- ---------- الجداول ----------
create table if not exists public.payment_exemptions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null unique references public.profiles(id) on delete cascade,
  cap               integer not null check (cap >= 1),
  used              integer not null default 0 check (used >= 0),
  -- عمود نصّي لا enum؛ ::text تصريحاً ليتجاوزه فاحص 55P04
  reason            text not null check (reason::text in ('trial', 'partner', 'compensation', 'personal', 'other')),
  note              text,
  expires_at        timestamptz,
  granted_by        uuid references public.profiles(id) on delete set null,
  granted_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  /** يُضبط عند أول قراءة بعد الانتهاء — ليُسجَّل «انتهاء» مرة واحدة */
  expired_logged_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.exemption_log (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  action     text not null check (action in ('grant', 'update', 'revoke', 'expire')),
  cap        integer not null,
  reason     text not null,
  /** فارغ للإجراءات الآلية (الانتهاء) */
  admin_id   uuid references public.profiles(id) on delete set null,
  at         timestamptz not null default clock_timestamp()
);

create index if not exists exemption_log_account_idx on public.exemption_log (account_id, at desc);

alter table public.events
  add column if not exists exemption_id uuid references public.payment_exemptions(id) on delete set null;

comment on column public.events.exemption_id is
  'المناسبة فُعّلت ضمن باقة ضيافة (إعفاء من الدفع) — الإرسال يُخصم من سقف الإعفاء لا من مقاعد الباقة.';

-- السجل يُضاف إليه فقط
create or replace function public.exemption_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'EXEMPTION_LOG_APPEND_ONLY'
    using hint = 'سجل الإعفاءات لا يُعدَّل ولا يُحذف منه.';
end;
$$;

drop trigger if exists exemption_log_append_only on public.exemption_log;
create trigger exemption_log_append_only
  before update or delete on public.exemption_log
  for each row execute function public.exemption_log_immutable();

-- ---------- RLS: القراءة للأدمن ولصاحب الحساب؛ الكتابة عبر الدوال فقط ----------
alter table public.payment_exemptions enable row level security;
alter table public.exemption_log enable row level security;

drop policy if exists exemptions_select on public.payment_exemptions;
create policy exemptions_select on public.payment_exemptions
  for select using (account_id = auth.uid() or public.is_admin());

drop policy if exists exemption_log_select on public.exemption_log;
create policy exemption_log_select on public.exemption_log
  for select using (public.is_admin());

revoke insert, update, delete on public.payment_exemptions from anon, authenticated;
revoke insert, update, delete on public.exemption_log from anon, authenticated;
grant select on public.payment_exemptions, public.exemption_log to authenticated, service_role;

-- ---------- الصفة والحالة ----------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'admin_owner')
      and is_active
  );
$$;

/** none | active | cap_reached | revoked | expired — بترتيب الأسبقية: مسحوب ← منتهٍ ← بلغ السقف */
create or replace function public.exemption_state(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when e.revoked_at is not null then 'revoked'
      when e.expires_at is not null and e.expires_at <= now() then 'expired'
      when e.used >= e.cap then 'cap_reached'
      else 'active'
    end
    from public.payment_exemptions e
    where e.account_id = p_account_id
  ), 'none');
$$;

/** انتهاء كسول: أول قراءة بعد تاريخ الانتهاء تُسجّل «انتهاء» مرة واحدة. */
create or replace function public.touch_exemption_expiry(p_account_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ex public.payment_exemptions%rowtype;
begin
  update public.payment_exemptions
     set expired_logged_at = now()
   where account_id = p_account_id
     and revoked_at is null
     and expires_at is not null and expires_at <= now()
     and expired_logged_at is null
  returning * into v_ex;

  if found then
    insert into public.exemption_log (account_id, action, cap, reason, admin_id)
    values (v_ex.account_id, 'expire', v_ex.cap, v_ex.reason, null);
  end if;
end;
$$;

-- ---------- إجراءات السوبر أدمن ----------
create or replace function public.grant_exemption(
  p_account_id uuid,
  p_cap        integer,
  p_reason     text,
  p_note       text default null,
  p_expires_at timestamptz default null
)
returns public.payment_exemptions
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row   public.payment_exemptions%rowtype;
  v_state text;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN' using hint = 'الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط.';
  end if;
  if p_cap is null or p_cap < 1 then
    raise exception 'INVALID_CAP' using hint = 'عدد الدعوات المجانية رقم صحيح لا يقل عن ١.';
  end if;
  if p_reason is null or p_reason::text not in ('trial', 'partner', 'compensation', 'personal', 'other') then
    raise exception 'INVALID_REASON' using hint = 'اختر السبب من القائمة.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'INVALID_EXPIRY' using hint = 'تاريخ الانتهاء يجب أن يكون في المستقبل.';
  end if;
  if not exists (select 1 from public.profiles where id = p_account_id) then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  v_state := public.exemption_state(p_account_id);
  if v_state in ('active', 'cap_reached') then
    raise exception 'ALREADY_EXEMPT' using hint = 'الحساب معفى بالفعل — عدّل السقف بدل منح إعفاء جديد.';
  end if;

  -- منح جديد (أو إعادة منح بعد سحب/انتهاء) يبدأ العدّاد من الصفر
  insert into public.payment_exemptions (account_id, cap, used, reason, note, expires_at, granted_by, granted_at)
  values (p_account_id, p_cap, 0, p_reason, nullif(trim(p_note), ''), p_expires_at, auth.uid(), now())
  on conflict (account_id) do update
     set cap = excluded.cap, used = 0, reason = excluded.reason, note = excluded.note,
         expires_at = excluded.expires_at, granted_by = excluded.granted_by, granted_at = now(),
         revoked_at = null, expired_logged_at = null, updated_at = now()
  returning * into v_row;

  insert into public.exemption_log (account_id, action, cap, reason, admin_id)
  values (p_account_id, 'grant', v_row.cap, v_row.reason, auth.uid());

  return v_row;
end;
$$;

create or replace function public.update_exemption_cap(p_account_id uuid, p_cap integer)
returns public.payment_exemptions
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_row public.payment_exemptions%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN' using hint = 'الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط.';
  end if;

  select * into v_row from public.payment_exemptions where account_id = p_account_id for update;
  if not found or v_row.revoked_at is not null then
    raise exception 'NOT_EXEMPT' using hint = 'لا إعفاء نشطاً لهذا الحساب.';
  end if;
  if p_cap is null or p_cap < 1 then
    raise exception 'INVALID_CAP';
  end if;
  if p_cap < v_row.used then
    raise exception 'CAP_BELOW_USED' using hint = 'لا يمكن أن يقلّ السقف عن المستخدم.';
  end if;

  update public.payment_exemptions
     set cap = p_cap, updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.exemption_log (account_id, action, cap, reason, admin_id)
  values (p_account_id, 'update', p_cap, v_row.reason, auth.uid());

  return v_row;
end;
$$;

create or replace function public.revoke_exemption(p_account_id uuid)
returns public.payment_exemptions
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_row public.payment_exemptions%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN' using hint = 'الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط.';
  end if;

  select * into v_row from public.payment_exemptions where account_id = p_account_id for update;
  if not found or v_row.revoked_at is not null then
    raise exception 'NOT_EXEMPT' using hint = 'لا إعفاء نشطاً لهذا الحساب.';
  end if;

  -- السحب يوقف الإرسال الجديد فقط؛ الدعوات المرسلة ومناسباتها المفعّلة لا تتأثر
  update public.payment_exemptions
     set revoked_at = now(), updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.exemption_log (account_id, action, cap, reason, admin_id)
  values (p_account_id, 'revoke', v_row.cap, v_row.reason, auth.uid());

  return v_row;
end;
$$;

-- ---------- فحص الإرسال (للعرض — الحجز الفعلي في reserve_*) ----------
create or replace function public.exemption_can_send(p_account_id uuid, p_event_id uuid, p_count integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_ex    public.payment_exemptions%rowtype;
  v_state text;
begin
  if not (p_account_id = auth.uid() or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = p_event_id and owner_id = p_account_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_package');
  end if;

  -- باقة مدفوعة: الإعفاء لا يعنيها
  if v_event.status::text = 'active' and v_event.exemption_id is null then
    return jsonb_build_object('ok', true);
  end if;

  perform public.touch_exemption_expiry(p_account_id);
  v_state := public.exemption_state(p_account_id);
  select * into v_ex from public.payment_exemptions where account_id = p_account_id;

  if v_state = 'none'    then return jsonb_build_object('ok', false, 'reason', 'no_package'); end if;
  if v_state = 'revoked' then return jsonb_build_object('ok', false, 'reason', 'revoked');    end if;
  if v_state = 'expired' then return jsonb_build_object('ok', false, 'reason', 'expired');    end if;
  if coalesce(p_count, 1) < 1 or (v_ex.cap - v_ex.used) < coalesce(p_count, 1) then
    return jsonb_build_object('ok', false, 'reason', 'cap_reached',
                              'remaining', greatest(v_ex.cap - v_ex.used, 0));
  end if;
  return jsonb_build_object('ok', true, 'remaining', v_ex.cap - v_ex.used);
end;
$$;

-- ---------- تفعيل المناسبة بلا دفع ----------
create or replace function public.activate_event_by_exemption(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_ex    public.payment_exemptions%rowtype;
  v_state text;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_FOUND');
  end if;
  if not (v_event.owner_id = auth.uid() or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;
  if v_event.status::text = 'active' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_event.status::text not in ('unpaid', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_ACTIVATABLE');
  end if;

  perform public.touch_exemption_expiry(v_event.owner_id);
  v_state := public.exemption_state(v_event.owner_id);
  if v_state <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'EXEMPTION_' || upper(v_state));
  end if;
  select * into v_ex from public.payment_exemptions where account_id = v_event.owner_id;

  update public.events
     set status = 'active', activated_at = now(), exemption_id = v_ex.id,
         package_id = null, package_qty = null
   where id = p_event_id;

  -- أثر محاسبي بمبلغ صفر باسم النظام
  insert into public.transactions (event_id, package_id, amount, type, status, method, seats_added, note)
  values (p_event_id, null, 0, 'exemption'::transaction_type, 'paid', 'manual', 0,
          'باقة ضيافة — إعفاء من الدفع');

  insert into public.activity_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.activated_by_exemption', 'event', p_event_id,
          jsonb_build_object('exemption_id', v_ex.id, 'cap', v_ex.cap, 'used', v_ex.used));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- خصم دعوة من السقف (داخلي — تُستدعى من الحجز) ----------
/** يُرجع 'EXEMPTION' عند الخصم، وإلا سبب الرفض. يقفل صفّ الإعفاء. */
create or replace function public.consume_exemption_invite(p_exemption_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ex public.payment_exemptions%rowtype;
begin
  select * into v_ex from public.payment_exemptions where id = p_exemption_id for update;
  if not found then return 'EXEMPTION_REVOKED'; end if;
  if v_ex.revoked_at is not null then return 'EXEMPTION_REVOKED'; end if;
  if v_ex.expires_at is not null and v_ex.expires_at <= now() then
    perform public.touch_exemption_expiry(v_ex.account_id);
    return 'EXEMPTION_EXPIRED';
  end if;
  if v_ex.used >= v_ex.cap then return 'EXEMPTION_EXHAUSTED'; end if;

  update public.payment_exemptions set used = used + 1, updated_at = now() where id = v_ex.id;
  return 'EXEMPTION';
end;
$$;

/** إعادة دعوة إلى السقف عند تحرير حجز لم يُرسل فعلاً */
create or replace function public.refund_exemption_invite(p_exemption_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.payment_exemptions
     set used = greatest(used - 1, 0), updated_at = now()
   where id = p_exemption_id;
$$;

-- ---------- الحجز للمالك: وضع الإعفاء يخصم من السقف لا من المقاعد ----------
create or replace function public.reserve_seats_for_send(
  p_event_id uuid,
  p_guest_ids uuid[]
)
returns table (guest_id uuid, ok boolean, reason text, missing_seats integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event      public.events%rowtype;
  v_guest      public.guests%rowtype;
  v_held       integer;
  v_confirmed  integer;
  v_available  integer;
  v_trial_mode boolean := false;
  v_exempt     boolean := false;
  v_res        text;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not (v_event.owner_id = auth.uid() or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  -- المناسبة غير مفعّلة: يُسمح بالدعوات التجريبية بقدر رصيد الحساب
  if v_event.status::text <> 'active' then
    if v_event.status::text in ('unpaid', 'pending') and auth.uid() is not null then
      v_trial_mode := true;
    else
      return query
        select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
      return;
    end if;
  end if;

  v_exempt := v_event.exemption_id is not null;

  if not v_trial_mode and not v_exempt then
    select coalesce(sum(max_seats), 0)::int into v_held
      from public.guests where event_id = p_event_id and status = 'sent' and not is_trial;
    select coalesce(sum(coalesce(confirmed_seats, 0)), 0)::int into v_confirmed
      from public.guests where event_id = p_event_id and status in ('accepted', 'attended') and not is_trial;
    v_available := v_event.seats_quota - v_held - v_confirmed;
  end if;

  foreach guest_id in array p_guest_ids loop
    select * into v_guest from public.guests where id = guest_id and event_id = p_event_id;

    if not found then
      ok := false; reason := 'GUEST_NOT_FOUND'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.status::text <> 'draft' then
      ok := false; reason := 'ALREADY_SENT'; missing_seats := 0;
      return next; continue;
    end if;

    if v_trial_mode then
      if public.consume_trial_invite(auth.uid(), p_event_id) then
        update public.guests set status = 'sent', sent_at = now(), is_trial = true where id = v_guest.id;
        ok := true; reason := 'TRIAL'; missing_seats := 0;
      else
        ok := false; reason := 'TRIAL_EXHAUSTED'; missing_seats := 0;
      end if;
      return next; continue;
    end if;

    if v_exempt then
      -- باقة ضيافة: كل مدعو دعوة واحدة تُخصم من سقف الإعفاء
      v_res := public.consume_exemption_invite(v_event.exemption_id);
      if v_res = 'EXEMPTION' then
        update public.guests set status = 'sent', sent_at = now() where id = v_guest.id;
        ok := true; reason := 'EXEMPTION'; missing_seats := 0;
      else
        ok := false; reason := v_res; missing_seats := 0;
      end if;
      return next; continue;
    end if;

    if v_guest.max_seats > v_available then
      ok := false; reason := 'INSUFFICIENT_SEATS';
      missing_seats := v_guest.max_seats - greatest(v_available, 0);
      return next; continue;
    end if;

    update public.guests set status = 'sent', sent_at = now() where id = v_guest.id;

    v_available := v_available - v_guest.max_seats;
    ok := true; reason := 'RESERVED'; missing_seats := 0;
    return next;
  end loop;
end;
$$;

-- ---------- الحجز للداعي: في وضع الإعفاء لا حصص مقاعد، السقف وحده ----------
create or replace function public.reserve_seats_for_inviter(
  p_inviter_id uuid,
  p_guest_ids uuid[]
)
returns table (guest_id uuid, ok boolean, reason text, missing_seats integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_inviter     public.inviters%rowtype;
  v_event       public.events%rowtype;
  v_guest       public.guests%rowtype;
  v_available   integer;
  v_event_avail integer;
  v_trial_mode  boolean := false;
  v_exempt      boolean := false;
  v_res         text;
begin
  select * into v_inviter from public.inviters where id = p_inviter_id for update;
  if not found then
    raise exception 'INVITER_NOT_FOUND';
  end if;

  if not (v_inviter.profile_id = auth.uid()
          or public.owns_event(v_inviter.event_id)
          or public.is_admin()
          or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = v_inviter.event_id for update;

  if v_event.status::text <> 'active' then
    if v_event.status::text in ('unpaid', 'pending') and auth.uid() is not null then
      v_trial_mode := true;
    else
      return query select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
      return;
    end if;
  end if;

  v_exempt := v_event.exemption_id is not null;

  if not v_trial_mode and not v_exempt then
    select v_inviter.seats_quota
           - coalesce((select sum(max_seats) from public.guests
                       where inviter_id = p_inviter_id and status = 'sent' and not is_trial), 0)
           - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                       where inviter_id = p_inviter_id and status in ('accepted','attended') and not is_trial), 0)
      into v_available;

    select v_event.seats_quota
           - coalesce((select sum(max_seats) from public.guests
                       where event_id = v_event.id and status = 'sent' and not is_trial), 0)
           - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                       where event_id = v_event.id and status in ('accepted','attended') and not is_trial), 0)
      into v_event_avail;
  end if;

  foreach guest_id in array p_guest_ids loop
    select * into v_guest from public.guests
     where id = guest_id and inviter_id = p_inviter_id;

    if not found then
      ok := false; reason := 'GUEST_NOT_FOUND'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.status::text <> 'draft' then
      ok := false; reason := 'ALREADY_SENT'; missing_seats := 0;
      return next; continue;
    end if;

    if v_trial_mode then
      if public.consume_trial_invite(auth.uid(), v_event.id) then
        update public.guests set status = 'sent', sent_at = now(), is_trial = true where id = v_guest.id;
        ok := true; reason := 'TRIAL'; missing_seats := 0;
      else
        ok := false; reason := 'TRIAL_EXHAUSTED'; missing_seats := 0;
      end if;
      return next; continue;
    end if;

    if v_exempt then
      v_res := public.consume_exemption_invite(v_event.exemption_id);
      if v_res = 'EXEMPTION' then
        update public.guests set status = 'sent', sent_at = now() where id = v_guest.id;
        ok := true; reason := 'EXEMPTION'; missing_seats := 0;
      else
        ok := false; reason := v_res; missing_seats := 0;
      end if;
      return next; continue;
    end if;

    if v_guest.max_seats > v_available then
      ok := false; reason := 'INSUFFICIENT_QUOTA';
      missing_seats := v_guest.max_seats - greatest(v_available, 0);
      return next; continue;
    end if;

    if v_guest.max_seats > v_event_avail then
      ok := false; reason := 'INSUFFICIENT_EVENT_SEATS';
      missing_seats := v_guest.max_seats - greatest(v_event_avail, 0);
      return next; continue;
    end if;

    update public.guests set status = 'sent', sent_at = now() where id = v_guest.id;

    v_available   := v_available - v_guest.max_seats;
    v_event_avail := v_event_avail - v_guest.max_seats;
    ok := true; reason := 'RESERVED'; missing_seats := 0;
    return next;
  end loop;
end;
$$;

-- ---------- تحرير الحجز: دعوة الضيافة تعود إلى السقف ----------
create or replace function public.release_seat_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
  v_exemption uuid;
begin
  select * into v_guest from public.guests where id = p_guest_id;
  if not found or v_guest.status::text <> 'sent' then return; end if;
  if not (public.owns_event(v_guest.event_id) or public.is_admin() or auth.uid() is null) then return; end if;

  update public.guests set status = 'draft', sent_at = null, is_trial = false where id = p_guest_id;

  if v_guest.is_trial and auth.uid() is not null then
    update public.profiles set trial_invites_left = trial_invites_left + 1 where id = auth.uid();
  elsif not v_guest.is_trial then
    select exemption_id into v_exemption from public.events where id = v_guest.event_id;
    if v_exemption is not null then perform public.refund_exemption_invite(v_exemption); end if;
  end if;
end;
$$;

create or replace function public.release_inviter_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
  v_exemption uuid;
begin
  select * into v_guest from public.guests where id = p_guest_id;
  if not found or v_guest.status::text <> 'sent' then return; end if;

  if v_guest.inviter_id is not null
     and (v_guest.inviter_id = public.my_inviter_id(v_guest.event_id)
          or public.owns_event(v_guest.event_id)
          or public.is_admin()
          or auth.uid() is null) then
    update public.guests set status = 'draft', sent_at = null, is_trial = false where id = p_guest_id;

    if v_guest.is_trial and auth.uid() is not null then
      update public.profiles set trial_invites_left = trial_invites_left + 1 where id = auth.uid();
    elsif not v_guest.is_trial then
      select exemption_id into v_exemption from public.events where id = v_guest.event_id;
      if v_exemption is not null then perform public.refund_exemption_invite(v_exemption); end if;
    end if;
  end if;
end;
$$;

-- ---------- تأكيد الحضور بعد الاعتذار: مناسبة الضيافة بلا رصيد مقاعد ----------
create or replace function public.rsvp_accept(p_token uuid, p_seats integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest     public.guests%rowtype;
  v_inviter   public.inviters%rowtype;
  v_qr        uuid;
  v_available integer;
  v_exempt    boolean;
begin
  select * into v_guest from public.guests
   where invite_token = p_token or qr_token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if v_guest.status::text = 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'NOT_SENT');
  end if;

  if p_seats is null or p_seats < 1 or p_seats > v_guest.max_seats then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SEATS', 'max_seats', v_guest.max_seats);
  end if;

  if v_guest.status::text = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTENDED');
  end if;

  select exemption_id is not null into v_exempt from public.events where id = v_guest.event_id;

  -- خرج من الحجز (اعتذر/انتهى/فشل) ثم عاد يؤكّد: نتحقق من المتاح الآن.
  -- التجريبية ومناسبات الضيافة لا تُحسب على رصيد المقاعد أصلاً.
  if v_guest.status::text in ('declined', 'expired', 'failed') and not v_guest.is_trial and not coalesce(v_exempt, false) then
    perform 1 from public.events where id = v_guest.event_id for update;

    v_available := null;
    if v_guest.inviter_id is not null then
      select * into v_inviter from public.inviters where id = v_guest.inviter_id;
      if found and v_inviter.seats_quota > 0 then
        select v_inviter.seats_quota
               - coalesce((select sum(max_seats) from public.guests
                           where inviter_id = v_inviter.id and status = 'sent' and not is_trial), 0)
               - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                           where inviter_id = v_inviter.id and status in ('accepted','attended') and not is_trial), 0)
          into v_available;
      end if;
    end if;

    if v_available is null then
      select e.seats_quota
             - coalesce((select sum(max_seats) from public.guests
                         where event_id = e.id and status = 'sent' and not is_trial), 0)
             - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                         where event_id = e.id and status in ('accepted','attended') and not is_trial), 0)
        into v_available
      from public.events e where e.id = v_guest.event_id;
    end if;

    if p_seats > coalesce(v_available, 0) then
      return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_SEATS',
                                'available', greatest(coalesce(v_available, 0), 0));
    end if;
  end if;

  v_qr := coalesce(v_guest.qr_token, gen_random_uuid());

  update public.guests
     set status          = 'accepted',
         confirmed_seats = p_seats,
         qr_token        = v_qr,
         responded_at    = now(),
         failure_reason  = null
   where id = v_guest.id;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest.id, 'event_id', v_guest.event_id,
    'qr_token', v_qr, 'confirmed_seats', p_seats, 'name', v_guest.name, 'phone', v_guest.phone
  );
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.exemption_state(uuid) from public, anon;
revoke all on function public.touch_exemption_expiry(uuid) from public, anon, authenticated;
revoke all on function public.grant_exemption(uuid, integer, text, text, timestamptz) from public, anon;
revoke all on function public.update_exemption_cap(uuid, integer) from public, anon;
revoke all on function public.revoke_exemption(uuid) from public, anon;
revoke all on function public.exemption_can_send(uuid, uuid, integer) from public, anon;
revoke all on function public.activate_event_by_exemption(uuid) from public, anon;
revoke all on function public.consume_exemption_invite(uuid) from public, anon, authenticated;
revoke all on function public.refund_exemption_invite(uuid) from public, anon, authenticated;

grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.exemption_state(uuid) to authenticated, service_role;
grant execute on function public.touch_exemption_expiry(uuid) to service_role;
grant execute on function public.grant_exemption(uuid, integer, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.update_exemption_cap(uuid, integer) to authenticated, service_role;
grant execute on function public.revoke_exemption(uuid) to authenticated, service_role;
grant execute on function public.exemption_can_send(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.activate_event_by_exemption(uuid) to authenticated, service_role;
grant execute on function public.consume_exemption_invite(uuid) to service_role;
grant execute on function public.refund_exemption_invite(uuid) to service_role;
