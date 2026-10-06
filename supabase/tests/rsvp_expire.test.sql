-- ============================================================
-- برقية — التأكيد بعد الاعتذار والانتهاء (المرحلة ٩)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/rsvp_expire.test.sql
-- ============================================================

begin;
create or replace function pg_temp.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL — %: المتوقع % والفعلي %', label, expected, actual;
  end if;
  raise notice 'PASS — %', label;
end $$;

insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-000000000001', 'rsvp-owner@test.local'),
  ('91000000-0000-0000-0000-000000000002', 'rsvp-inviter@test.local');

insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
        'wedding', current_date + 10, 'أسرة الاستجابة', 6, 'active');

insert into public.inviters (id, event_id, profile_id, name, role_label, seats_quota)
values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000002', 'أم خالد', 'داعية', 3);

-- ضيفان للمالك (بلا داعٍ) وضيف للداعية
insert into public.guests (id, event_id, inviter_id, name, phone, max_seats, status, sent_at) values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', null, 'اعتذر ثم عاد', '966500000001', 3, 'declined', now() - interval '2 days'),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', null, 'محجوز', '966500000002', 4, 'sent', now() - interval '1 day'),
  ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'ضيف الداعية', '966500000003', 3, 'sent', now() - interval '1 day'),
  ('94000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'اعتذر عند الداعية', '966500000004', 2, 'declined', now() - interval '1 day');

-- ————— ١) اعتذر ثم حاول التأكيد بعد نفاد المقاعد → يُرفض بلا تجاوز —————
-- الرصيد: ٦ − محجوز (٤ + ٣) = −١ متاح
do $$
declare res jsonb;
begin
  res := public.rsvp_accept((select invite_token from public.guests where id = '94000000-0000-0000-0000-000000000001'), 2);
  perform pg_temp.assert_eq(res ->> 'reason', 'INSUFFICIENT_SEATS', 'بعد الاعتذار: التأكيد يُرفض حين لا متاح');
  perform pg_temp.assert_eq(
    (select status::text from public.guests where id = '94000000-0000-0000-0000-000000000001'),
    'declined', 'الحالة لم تتغيّر');
end $$;

-- ————— ٢) داعية حصتها ٣ ومحجوز منها ٣: المعتذر لديها لا يؤكّد —————
do $$
declare res jsonb;
begin
  res := public.rsvp_accept((select invite_token from public.guests where id = '94000000-0000-0000-0000-000000000004'), 1);
  perform pg_temp.assert_eq(res ->> 'reason', 'INSUFFICIENT_SEATS', 'التحقق من حصة الداعي إن كان له حصة');
end $$;

-- ————— ٣) بعد تحرير مقاعد: التأكيد يمرّ —————
do $$
declare res jsonb;
begin
  perform public.rsvp_decline((select invite_token from public.guests where id = '94000000-0000-0000-0000-000000000002'));
  res := public.rsvp_accept((select invite_token from public.guests where id = '94000000-0000-0000-0000-000000000001'), 2);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'بعد تحرير ٤ مقاعد يؤكّد المعتذر ٢');
  perform pg_temp.assert_eq(
    (select available from public.event_balance('92000000-0000-0000-0000-000000000001')), 1,
    'الرصيد لم يتجاوز: ٦ − ٣ محجوز − ٢ مؤكّد = ١');
end $$;

-- ————— ٤) المدعو الذي ما زال sent يؤكّد دون فحص (مقاعده محجوزة أصلاً) —————
do $$
declare res jsonb;
begin
  res := public.rsvp_accept((select invite_token from public.guests where id = '94000000-0000-0000-0000-000000000003'), 3);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'المحجوز يؤكّد ضمن حدّه');
end $$;

-- ————— ٥) الانتهاء: sent الأقدم من موعد المناسبة → expired ويتحرّر —————
insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
values ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001',
        'wedding', current_date - 1, 'مناسبة مضت', 10, 'active');
insert into public.guests (id, event_id, name, phone, max_seats, status, sent_at) values
  ('94000000-0000-0000-0000-000000000011', '92000000-0000-0000-0000-000000000002', 'لم يرد', '966500000011', 5, 'sent', now() - interval '9 days'),
  ('94000000-0000-0000-0000-000000000012', '92000000-0000-0000-0000-000000000002', 'أكّد', '966500000012', 2, 'accepted', now() - interval '9 days');

do $$
declare n integer;
begin
  n := public.expire_stale_invites();
  perform pg_temp.assert_eq(n, 1, 'انتهى مدعو واحد فقط (المناسبة التي مضت ولم يردّ)');
  perform pg_temp.assert_eq(
    (select status::text from public.guests where id = '94000000-0000-0000-0000-000000000011'),
    'expired', 'الحالة expired');
  perform pg_temp.assert_eq(
    (select held from public.event_balance('92000000-0000-0000-0000-000000000002')), 0,
    'تحرّر حجزه');
  perform pg_temp.assert_eq(
    (select status::text from public.guests where id = '94000000-0000-0000-0000-000000000003'),
    'accepted', 'المناسبة القادمة لم تُمسّ');
  perform pg_temp.assert_eq(public.expire_stale_invites(), 0, 'الاستدعاء الثاني لا يغيّر شيئاً');
end $$;

rollback;
