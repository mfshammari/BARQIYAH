-- ============================================================
-- 0020 — منطق الاستجابة والتذكير والانتهاء (المرحلة ٩)
--
-- ١) rsvp_accept: من اعتذر/انتهى/فشل ثم حاول التأكيد يتحقق أن المقاعد
--    ما زالت متاحة (من حصة الداعي إن كان له حصة، وإلا من المناسبة) وإلا
--    INSUFFICIENT_SEATS — فلا يتجاوز الرصيد أبداً.
-- ٢) التذكير قالب معتمد لا نصّ حرّ: اسمه في integration_settings.
-- ٣) expire_stale_invites: الدعوات المُرسلة الأقدم من موعد المناسبة تصير
--    expired فتتحرّر مقاعدها — تُستدعى من cron يومي.
-- ============================================================

-- ---------- ١) تأكيد الحضور بعد الاعتذار يتحقق من المتاح ----------
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

  -- خرج من الحجز (اعتذر/انتهى/فشل) ثم عاد يؤكّد: المقاعد لم تعد محجوزة له،
  -- فنتحقق من المتاح الآن. الدعوات التجريبية لا تُحسب على الرصيد أصلاً.
  if v_guest.status::text in ('declined', 'expired', 'failed') and not v_guest.is_trial then
    -- قفل المناسبة لتسلسل التأكيدات المتزامنة
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

-- ---------- ٢) قالب التذكير ----------
alter table public.integration_settings
  add column if not exists reminder_template text;

comment on column public.integration_settings.reminder_template is
  'اسم قالب التذكير المعتمد في Meta — افتراضياً barqiyah_reminder.';

-- ---------- ٣) انتهاء الدعوات بعد موعد المناسبة ----------
-- من لم يردّ حتى مضى موعد المناسبة يصير expired؛ خروجه من sent يحرّر حجزه.
create or replace function public.expire_stale_invites()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  with stale as (
    select g.id
    from public.guests g
    join public.events e on e.id = g.event_id
    where g.status = 'sent'
      and e.event_date < current_date
  )
  update public.guests g
     set status = 'expired'
    from stale
   where g.id = stale.id;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.activity_logs (actor_id, action, target_type, target_id, metadata)
    values (null, 'guests.expired', 'system', null, jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_invites() from public, anon;
grant execute on function public.expire_stale_invites() to authenticated, service_role;
