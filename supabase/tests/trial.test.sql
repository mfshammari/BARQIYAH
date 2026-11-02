-- ============================================================
-- برقية — الدعوات التجريبية الخمس (المرحلة ٧)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/trial.test.sql
--
-- تُرسل قبل الدفع، ولا تُحسب على رصيد المقاعد، وما زاد يُرفض TRIAL_EXHAUSTED.
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
  ('71000000-0000-0000-0000-000000000001', 'trial-owner@test.local');

select pg_temp.assert_eq(
  (select trial_invites_left from public.profiles where id = '71000000-0000-0000-0000-000000000001'),
  5, 'كل حساب جديد له ٥ دعوات تجريبية');

insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status, invite_vars)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001',
        'wedding', current_date + 30, 'أسرة التجربة', 0, 'unpaid',
        '{"host":"أسرة التجربة","occasion":"زواج خالد"}'::jsonb);

insert into public.guests (id, event_id, name, phone, max_seats)
select ('73000000-0000-0000-0000-00000000000' || i)::uuid, '72000000-0000-0000-0000-000000000001',
       'ضيف ' || i, '96650000000' || i, 3
from generate_series(1, 7) as i;

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

-- ————— ١) ٧ مدعوين على مناسبة غير مدفوعة: ٥ تجريبية و٢ مرفوضان —————
do $$
declare r record; ok_count int := 0; exhausted int := 0;
begin
  for r in select * from public.reserve_seats_for_send(
    '72000000-0000-0000-0000-000000000001',
    (select array_agg(id order by id) from public.guests where event_id = '72000000-0000-0000-0000-000000000001'))
  loop
    if r.ok then
      ok_count := ok_count + 1;
      if r.reason <> 'TRIAL' then raise exception 'FAIL — السبب % بدل TRIAL', r.reason; end if;
    elsif r.reason = 'TRIAL_EXHAUSTED' then
      exhausted := exhausted + 1;
    else
      raise exception 'FAIL — سبب غير متوقع %', r.reason;
    end if;
  end loop;
  perform pg_temp.assert_eq(ok_count, 5, 'أُرسلت ٥ دعوات تجريبية قبل الدفع');
  perform pg_temp.assert_eq(exhausted, 2, 'ما زاد رُفض بـ TRIAL_EXHAUSTED');
end $$;

select pg_temp.assert_eq(
  (select trial_invites_left from public.profiles where id = '71000000-0000-0000-0000-000000000001'),
  0, 'العدّاد نقص لكل مدعو');
select pg_temp.assert_eq(
  (select count(*)::int from public.guests where event_id = '72000000-0000-0000-0000-000000000001' and is_trial),
  5, 'المدعوون التجريبيون معلَّمون is_trial');

-- ————— ٢) لا تُحسب على رصيد المقاعد —————
do $$
declare b record;
begin
  select * into b from public.event_balance('72000000-0000-0000-0000-000000000001');
  perform pg_temp.assert_eq(b.held, 0, 'التجريبية لا تحجز مقاعد');
  perform pg_temp.assert_eq(b.cnt_sent, 5, 'لكنها تُعدّ رسائل مُرسلة');
end $$;

-- تأكيد مدعو تجريبي لا يُحسب مؤكّداً في الرصيد — والباركود يعمل
do $$
declare res jsonb; b record;
begin
  res := public.rsvp_accept((select invite_token from public.guests where id = '73000000-0000-0000-0000-000000000001'), 2);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'المدعو التجريبي يؤكّد ويحصل على باركود');
  perform pg_temp.assert_eq((res ->> 'qr_token') is not null, true, 'له qr_token');
  select * into b from public.event_balance('72000000-0000-0000-0000-000000000001');
  perform pg_temp.assert_eq(b.confirmed, 0, 'تأكيده لا يُحسب على رصيد المقاعد');
end $$;

-- ————— ٣) المصدر المحاسبي: صفّ trial بمبلغ صفر مرة واحدة —————
select pg_temp.assert_eq(
  (select count(*)::int from public.transactions
    where event_id = '72000000-0000-0000-0000-000000000001' and type::text = 'trial' and amount = 0),
  1, 'صفّ trial واحد بمبلغ صفر');

-- ————— ٤) تحرير حجز تجريبي يعيد العدّاد —————
do $$
begin
  perform public.release_seat_hold('73000000-0000-0000-0000-000000000002');
  perform pg_temp.assert_eq(
    (select trial_invites_left from public.profiles where id = '71000000-0000-0000-0000-000000000001'),
    1, 'فشل الإرسال يعيد الدعوة التجريبية');
  perform pg_temp.assert_eq(
    (select is_trial from public.guests where id = '73000000-0000-0000-0000-000000000002'),
    false, 'والمدعو يعود مسودة غير تجريبية');
end $$;

-- ————— ٥) بعد التفعيل يعود الحجز العادي —————
update public.events set status = 'active', seats_quota = 10
 where id = '72000000-0000-0000-0000-000000000001';
do $$
declare r record;
begin
  select * into r from public.reserve_seats_for_send(
    '72000000-0000-0000-0000-000000000001', array['73000000-0000-0000-0000-000000000006']::uuid[]);
  perform pg_temp.assert_eq(r.reason, 'RESERVED', 'بعد التفعيل: حجز عادي من الرصيد');
  perform pg_temp.assert_eq(
    (select held from public.event_balance('72000000-0000-0000-0000-000000000001')), 3,
    'المحجوز = مقاعد المدعو غير التجريبي وحده');
end $$;

rollback;
