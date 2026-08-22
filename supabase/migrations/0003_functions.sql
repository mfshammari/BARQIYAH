-- ============================================================
-- برقية — منطق الرصيد والحجز والمسح (دوال ذرّية داخل قاعدة البيانات)
--
-- الرصيد بالمقاعد (أشخاص) لا بعدد الدعوات، بثلاث حالات:
--   مؤكّد  = مجموع confirmed_seats للحالات accepted/attended
--   محجوز  = مجموع max_seats للحالة sent (ننتظر الرد فنحجز الحد الأقصى)
--   متاح   = seats_quota - محجوز - مؤكّد
-- ============================================================

-- ---------- 1) حساب الرصيد ----------
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
    from public.guests where event_id = e.id and status = 'sent'
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where event_id = e.id and status in ('accepted', 'attended')
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

-- ---------- 2) حجز المقاعد وتعليم الدعوات كمُرسَلة ----------
-- تُستدعى قبل الإرسال الفعلي عبر واتساب. تقفل صف المناسبة لمنع تجاوز الرصيد
-- عند الإرسال المتزامن. ترجع لكل مدعو: هل نجح الحجز ولماذا لا.
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
begin
  -- قفل صف المناسبة (تسلسل عمليات الإرسال على نفس المناسبة)
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not (v_event.owner_id = auth.uid() or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  if v_event.status <> 'active' then
    return query
      select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
    return;
  end if;

  select coalesce(sum(max_seats), 0)::int into v_held
    from public.guests where event_id = p_event_id and status = 'sent';
  select coalesce(sum(coalesce(confirmed_seats, 0)), 0)::int into v_confirmed
    from public.guests where event_id = p_event_id and status in ('accepted', 'attended');
  v_available := v_event.seats_quota - v_held - v_confirmed;

  foreach guest_id in array p_guest_ids loop
    select * into v_guest from public.guests where id = guest_id and event_id = p_event_id;

    if not found then
      ok := false; reason := 'GUEST_NOT_FOUND'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.status <> 'draft' then
      ok := false; reason := 'ALREADY_SENT'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.max_seats > v_available then
      ok := false; reason := 'INSUFFICIENT_SEATS';
      missing_seats := v_guest.max_seats - greatest(v_available, 0);
      return next; continue;
    end if;

    update public.guests
       set status = 'sent', sent_at = now()
     where id = v_guest.id;

    v_available := v_available - v_guest.max_seats;
    ok := true; reason := 'RESERVED'; missing_seats := 0;
    return next;
  end loop;
end;
$$;

-- ---------- 3) التراجع عن الحجز عند فشل الإرسال ----------
create or replace function public.release_seat_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.guests
     set status = 'draft', sent_at = null
   where id = p_guest_id
     and status = 'sent'
     and (public.owns_event(event_id) or public.is_admin() or auth.uid() is null);
end;
$$;

-- ---------- 4) تأكيد الحضور (RSVP) ----------
-- يقبل invite_token أو qr_token. يولّد qr_token عند أول تأكيد.
create or replace function public.rsvp_accept(p_token uuid, p_seats integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
  v_qr    uuid;
begin
  select * into v_guest from public.guests
   where invite_token = p_token or qr_token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if v_guest.status in ('draft') then
    return jsonb_build_object('ok', false, 'reason', 'NOT_SENT');
  end if;

  if p_seats is null or p_seats < 1 or p_seats > v_guest.max_seats then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SEATS', 'max_seats', v_guest.max_seats);
  end if;

  if v_guest.status = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTENDED');
  end if;

  -- المقاعد المؤكَّدة ≤ الحد الأقصى المحجوز أصلاً، فلا يتجاوز الرصيد أبداً
  v_qr := coalesce(v_guest.qr_token, gen_random_uuid());

  update public.guests
     set status          = 'accepted',
         confirmed_seats = p_seats,
         qr_token        = v_qr,
         responded_at    = now()
   where id = v_guest.id;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest.id, 'event_id', v_guest.event_id,
    'qr_token', v_qr, 'confirmed_seats', p_seats, 'name', v_guest.name, 'phone', v_guest.phone
  );
end;
$$;

-- ---------- 5) الاعتذار ----------
create or replace function public.rsvp_decline(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
begin
  select * into v_guest from public.guests
   where invite_token = p_token or qr_token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if v_guest.status = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTENDED');
  end if;

  update public.guests
     set status = 'declined', confirmed_seats = 0, responded_at = now()
   where id = v_guest.id;

  return jsonb_build_object('ok', true, 'guest_id', v_guest.id, 'event_id', v_guest.event_id, 'name', v_guest.name);
end;
$$;

-- ---------- 6) مسح الباركود (تحقّق أونلاين، أحادي الاستخدام حتى اكتمال المقاعد) ----------
create or replace function public.scan_qr(p_qr_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest     public.guests%rowtype;
  v_event     public.events%rowtype;
  v_inviter   text;
  v_remaining integer;
begin
  select * into v_guest from public.guests where qr_token = p_qr_token for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_CODE');
  end if;

  select * into v_event from public.events where id = v_guest.event_id;

  -- الصلاحية: ماسح مُسنَد لهذه المناسبة، أو مالكها، أو أدمن
  if not (public.scans_event(v_guest.event_id) or v_event.owner_id = auth.uid() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'FORBIDDEN');
  end if;

  if v_guest.status not in ('accepted', 'attended') then
    return jsonb_build_object('ok', false, 'reason', 'NOT_CONFIRMED', 'name', v_guest.name);
  end if;

  if v_guest.scans_used >= coalesce(v_guest.confirmed_seats, 0) then
    return jsonb_build_object(
      'ok', false, 'reason', 'CODE_EXHAUSTED', 'name', v_guest.name,
      'seats', coalesce(v_guest.confirmed_seats, 0), 'scans_used', v_guest.scans_used
    );
  end if;

  select name into v_inviter from public.inviters where id = v_guest.inviter_id;

  update public.guests
     set scans_used  = scans_used + 1,
         status      = case when scans_used + 1 >= coalesce(confirmed_seats, 0) then 'attended'::guest_status else status end,
         attended_at = case when attended_at is null then now() else attended_at end
   where id = v_guest.id;

  v_remaining := coalesce(v_guest.confirmed_seats, 0) - (v_guest.scans_used + 1);

  return jsonb_build_object(
    'ok', true, 'reason', 'CHECKED_IN', 'name', v_guest.name,
    'seats', coalesce(v_guest.confirmed_seats, 0),
    'scans_used', v_guest.scans_used + 1,
    'remaining', v_remaining,
    'inviter', coalesce(v_inviter, ''),
    'completed', v_remaining <= 0
  );
end;
$$;

-- ---------- 7) تفعيل مناسبة / إضافة رصيد (الأدمن) ----------
create or replace function public.admin_activate_event(
  p_event_id uuid,
  p_package_id uuid,
  p_type transaction_type default 'manual_activation',
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pkg   public.packages%rowtype;
  v_event public.events%rowtype;
  v_seats integer;
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_FOUND');
  end if;

  select * into v_pkg from public.packages where id = p_package_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PACKAGE_NOT_FOUND');
  end if;

  -- التفعيل الأول يضبط الرصيد، والترقية تضيف فوقه
  if p_type = 'upgrade' then
    v_seats := v_event.seats_quota + v_pkg.seats;
  else
    v_seats := greatest(v_event.seats_quota, v_pkg.seats);
  end if;

  update public.events
     set status      = 'active',
         seats_quota = v_seats,
         package_id  = case when p_type = 'upgrade' then package_id else p_package_id end
   where id = p_event_id;

  insert into public.transactions (event_id, package_id, amount, type, status, seats_added, note)
  values (p_event_id, p_package_id, v_pkg.price, p_type, 'paid', v_pkg.seats, p_note);

  return jsonb_build_object('ok', true, 'seats_quota', v_seats);
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.reserve_seats_for_send(uuid, uuid[]) from public, anon;
revoke all on function public.release_seat_hold(uuid)             from public, anon;
revoke all on function public.rsvp_accept(uuid, integer)          from public, anon;
revoke all on function public.rsvp_decline(uuid)                  from public, anon;
revoke all on function public.scan_qr(uuid)                       from public, anon;
revoke all on function public.admin_activate_event(uuid, uuid, transaction_type, text) from public, anon;
revoke all on function public.event_balance(uuid)                 from public, anon;

grant execute on function public.event_balance(uuid)                 to authenticated, service_role;
grant execute on function public.reserve_seats_for_send(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.release_seat_hold(uuid)             to authenticated, service_role;
grant execute on function public.scan_qr(uuid)                       to authenticated, service_role;
grant execute on function public.admin_activate_event(uuid, uuid, transaction_type, text) to authenticated, service_role;
-- دوال RSVP تُستدعى من الخادم فقط (service role) لأن المدعو بلا حساب
grant execute on function public.rsvp_accept(uuid, integer) to service_role;
grant execute on function public.rsvp_decline(uuid)         to service_role;
