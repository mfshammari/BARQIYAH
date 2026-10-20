-- ============================================================
-- 0018 — الدعوات التجريبية الخمس (المرحلة ٧)
--
-- وعد الصفحة الرئيسية: خمس دعوات تجريبية لكل حساب جديد تُرسل قبل الدفع
-- ولا تُحسب على رصيد المقاعد. العدّاد على الحساب (profiles) لا المناسبة،
-- والمدعو التجريبي يُعلَّم is_trial فتستثنيه دوال الرصيد.
-- المصدر المحاسبي: صفّ transactions بنوع 'trial' ومبلغ صفر باسم النظام
-- عند أول إرسال تجريبي في المناسبة.
-- ============================================================

alter table public.profiles
  add column if not exists trial_invites_left integer not null default 5
    check (trial_invites_left >= 0);

alter table public.guests
  add column if not exists is_trial boolean not null default false;

create index if not exists guests_trial_idx on public.guests (event_id) where is_trial;

do $$ begin
  alter type transaction_type add value if not exists 'trial';
exception when others then null; end $$;

-- ---------- الرصيد يستثني التجريبية ----------
create or replace function public.event_balance(p_event_id uuid)
returns table (
  seats_quota    integer,
  held           integer,
  confirmed      integer,
  available      integer,
  messages_used  integer,
  total_guests   integer,
  cnt_draft      integer,
  cnt_sent       integer,
  cnt_accepted   integer,
  cnt_declined   integer,
  cnt_expired    integer,
  cnt_attended   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.seats_quota,
    coalesce(h.held, 0)                                              as held,
    coalesce(c.confirmed, 0)                                         as confirmed,
    e.seats_quota - coalesce(h.held, 0) - coalesce(c.confirmed, 0)   as available,
    coalesce(g.messages_used, 0)                                     as messages_used,
    coalesce(g.total_guests, 0)                                      as total_guests,
    coalesce(g.cnt_draft, 0), coalesce(g.cnt_sent, 0), coalesce(g.cnt_accepted, 0),
    coalesce(g.cnt_declined, 0), coalesce(g.cnt_expired, 0), coalesce(g.cnt_attended, 0)
  from public.events e
  left join lateral (
    select sum(max_seats)::int as held
    from public.guests where event_id = e.id and status = 'sent' and not is_trial
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where event_id = e.id and status in ('accepted', 'attended') and not is_trial
  ) c on true
  left join lateral (
    select
      count(*) filter (where status <> 'draft')::int as messages_used,
      count(*)::int                                   as total_guests,
      count(*) filter (where status = 'draft')::int    as cnt_draft,
      count(*) filter (where status = 'sent')::int     as cnt_sent,
      count(*) filter (where status = 'accepted')::int as cnt_accepted,
      count(*) filter (where status = 'declined')::int as cnt_declined,
      count(*) filter (where status = 'expired')::int  as cnt_expired,
      count(*) filter (where status = 'attended')::int as cnt_attended
    from public.guests where event_id = e.id
  ) g on true
  where e.id = p_event_id
    and (e.owner_id = auth.uid() or public.is_admin() or public.scans_event(e.id) or auth.uid() is null);
$$;

create or replace function public.inviter_balance(p_inviter_id uuid)
returns table (
  seats_quota   integer,
  held          integer,
  confirmed     integer,
  available     integer,
  messages_used integer,
  total_guests  integer,
  cnt_draft     integer,
  cnt_sent      integer,
  cnt_accepted  integer,
  cnt_declined  integer,
  cnt_expired   integer,
  cnt_attended  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.seats_quota,
    coalesce(h.held, 0),
    coalesce(c.confirmed, 0),
    i.seats_quota - coalesce(h.held, 0) - coalesce(c.confirmed, 0),
    coalesce(g.messages_used, 0),
    coalesce(g.total_guests, 0),
    coalesce(g.cnt_draft, 0), coalesce(g.cnt_sent, 0), coalesce(g.cnt_accepted, 0),
    coalesce(g.cnt_declined, 0), coalesce(g.cnt_expired, 0), coalesce(g.cnt_attended, 0)
  from public.inviters i
  left join lateral (
    select sum(max_seats)::int as held
    from public.guests where inviter_id = i.id and status = 'sent' and not is_trial
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where inviter_id = i.id and status in ('accepted', 'attended') and not is_trial
  ) c on true
  left join lateral (
    select
      count(*) filter (where status <> 'draft')::int as messages_used,
      count(*)::int                                   as total_guests,
      count(*) filter (where status = 'draft')::int    as cnt_draft,
      count(*) filter (where status = 'sent')::int     as cnt_sent,
      count(*) filter (where status = 'accepted')::int as cnt_accepted,
      count(*) filter (where status = 'declined')::int as cnt_declined,
      count(*) filter (where status = 'expired')::int  as cnt_expired,
      count(*) filter (where status = 'attended')::int as cnt_attended
    from public.guests where inviter_id = i.id
  ) g on true
  where i.id = p_inviter_id
    and (
      i.profile_id = auth.uid()
      or public.owns_event(i.event_id)
      or public.is_admin()
      or auth.uid() is null
    );
$$;

-- ---------- خصم دعوة تجريبية من رصيد الحساب (ذرّي) ----------
-- يُرجع true إن خُصمت. يُسجَّل صفّ transactions نوع trial مرة واحدة للمناسبة.
create or replace function public.consume_trial_invite(p_profile_id uuid, p_event_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ok boolean := false;
begin
  if p_profile_id is null then return false; end if;

  update public.profiles
     set trial_invites_left = trial_invites_left - 1
   where id = p_profile_id and trial_invites_left > 0
  returning true into v_ok;

  if coalesce(v_ok, false) then
    insert into public.transactions (event_id, package_id, amount, type, status, method, seats_added, note)
    select p_event_id, null, 0, 'trial'::transaction_type, 'paid', 'manual', 0,
           'دعوات تجريبية — تُسجَّل باسم النظام'
    where not exists (
      select 1 from public.transactions t
      where t.event_id = p_event_id and t.type::text = 'trial'
    );
    return true;
  end if;
  return false;
end;
$$;

-- ---------- الحجز للمالك: التجريبية قبل الدفع ----------
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

  if not v_trial_mode then
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
      -- دعوة تجريبية: تُخصم من عدّاد الحساب ولا تُحجز مقاعد
      if public.consume_trial_invite(auth.uid(), p_event_id) then
        update public.guests set status = 'sent', sent_at = now(), is_trial = true where id = v_guest.id;
        ok := true; reason := 'TRIAL'; missing_seats := 0;
      else
        ok := false; reason := 'TRIAL_EXHAUSTED'; missing_seats := 0;
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

-- ---------- الحجز للداعي: التجريبية من رصيد حسابه هو ----------
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

  if not v_trial_mode then
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

-- ---------- تحرير الحجز: التجريبية تُعاد إلى عدّاد الحساب ----------
create or replace function public.release_seat_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_guest public.guests%rowtype;
begin
  select * into v_guest from public.guests where id = p_guest_id;
  if not found or v_guest.status::text <> 'sent' then return; end if;
  if not (public.owns_event(v_guest.event_id) or public.is_admin() or auth.uid() is null) then return; end if;

  update public.guests set status = 'draft', sent_at = null, is_trial = false where id = p_guest_id;

  if v_guest.is_trial and auth.uid() is not null then
    update public.profiles set trial_invites_left = trial_invites_left + 1 where id = auth.uid();
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
declare v_guest public.guests%rowtype;
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
    end if;
  end if;
end;
$$;

revoke all on function public.consume_trial_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_trial_invite(uuid, uuid) to service_role;
