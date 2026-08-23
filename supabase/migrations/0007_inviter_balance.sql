-- ============================================================
-- برقية v2 — رصيد الداعي داخل حصته
--
-- «احجز المقاعد من حصة الداعي» (SPEC §6)، و«حصته بثلاث حالات محسوبة
-- داخل حصته فقط — لا يرى إجمالي المناسبة ولا مقاعد بقية الدعاة» (§8.4).
-- ============================================================

/**
 * رصيد داعٍ بعينه: مؤكّد ومحجوز ومتاح — كلها داخل حصته وحدها.
 * يراه الداعي نفسه، ومالك المناسبة، والأدمن.
 */
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
    from public.guests where inviter_id = i.id and status = 'sent'
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where inviter_id = i.id and status in ('accepted', 'attended')
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

/**
 * حجز المقاعد للإرسال من حصة داعٍ بعينه.
 *
 * يقفل صفّ الداعي فلا يتجاوز إرسالان متزامنان حصته. ويتحقق أيضاً من
 * رصيد المناسبة الكلي: الحصص قد تكون موزّعة بالكامل بينما رصيد المناسبة
 * استُهلك بمقاعد مؤكّدة أكثر مما توقّع المالك.
 */
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
  v_inviter   public.inviters%rowtype;
  v_event     public.events%rowtype;
  v_guest     public.guests%rowtype;
  v_available integer;
  v_event_avail integer;
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
    return query select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
    return;
  end if;

  -- المتاح داخل حصة الداعي
  select v_inviter.seats_quota
         - coalesce((select sum(max_seats) from public.guests
                     where inviter_id = p_inviter_id and status = 'sent'), 0)
         - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                     where inviter_id = p_inviter_id and status in ('accepted','attended')), 0)
    into v_available;

  -- والمتاح في المناسبة كلها (سقف أعلى لا يُتجاوز)
  select v_event.seats_quota
         - coalesce((select sum(max_seats) from public.guests
                     where event_id = v_event.id and status = 'sent'), 0)
         - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                     where event_id = v_event.id and status in ('accepted','attended')), 0)
    into v_event_avail;

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

revoke all on function public.inviter_balance(uuid) from public, anon;
revoke all on function public.reserve_seats_for_inviter(uuid, uuid[]) from public, anon;
grant execute on function public.inviter_balance(uuid) to authenticated, service_role;
grant execute on function public.reserve_seats_for_inviter(uuid, uuid[]) to authenticated, service_role;

/** تحرير حجز مدعو للداعي عند فشل الإرسال. */
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
  if not found then return; end if;

  if v_guest.inviter_id is not null
     and (v_guest.inviter_id = public.my_inviter_id(v_guest.event_id)
          or public.owns_event(v_guest.event_id)
          or public.is_admin()
          or auth.uid() is null) then
    update public.guests set status = 'draft', sent_at = null
     where id = p_guest_id and status::text = 'sent';
  end if;
end;
$$;

revoke all on function public.release_inviter_hold(uuid) from public, anon;
grant execute on function public.release_inviter_hold(uuid) to authenticated, service_role;
