-- ============================================================
-- برقية — الإعفاء من الدفع (باقة ضيافة)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/exemptions.test.sql
--
-- سوبر أدمن وحده يمنح ويسحب؛ المناسبة تُفعَّل بلا دفع؛ الإرسال يتوقف عند
-- السقف تماماً؛ السحب يُبقي المرسل؛ السقف لا يقلّ عن المستخدم؛ وكل إجراء في السجل.
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

create or replace function pg_temp.expect_error(sql text, code text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm like code || '%' then raise notice 'PASS — %', label; return; end if;
    raise exception 'FAIL — %: خطأ غير متوقع %', label, sqlerrm;
  end;
  raise exception 'FAIL — %: لم يُرفض', label;
end $$;

insert into auth.users (id, email) values
  ('81000000-0000-0000-0000-000000000001', 'ex-super@test.local'),
  ('81000000-0000-0000-0000-000000000002', 'ex-support@test.local'),
  ('81000000-0000-0000-0000-000000000003', 'ex-client@test.local'),
  ('81000000-0000-0000-0000-000000000004', 'ex-other@test.local');

update public.profiles set role = 'admin_owner'   where id = '81000000-0000-0000-0000-000000000001';
update public.profiles set role = 'admin_support' where id = '81000000-0000-0000-0000-000000000002';
update public.profiles set trial_invites_left = 0 where id in ('81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000004');

-- ————— ١) غير السوبر أدمن يُرفض —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 5, 'trial')$$,
  'FORBIDDEN', 'أدمن الدعم لا يمنح إعفاءً');
select pg_temp.expect_error(
  $$select public.revoke_exemption('81000000-0000-0000-0000-000000000003')$$,
  'FORBIDDEN', 'أدمن الدعم لا يسحب إعفاءً');

set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 5, 'trial')$$,
  'FORBIDDEN', 'العميل لا يمنح نفسه إعفاءً');

-- ————— ٢) السوبر أدمن يمنح، والتحقق من المدخلات —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 0, 'trial')$$,
  'INVALID_CAP', 'السقف صفر يُرفض');
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 5, 'gift')$$,
  'INVALID_REASON', 'سبب خارج القائمة يُرفض');
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 5, 'trial', null, now() - interval '1 day')$$,
  'INVALID_EXPIRY', 'تاريخ انتهاء ماضٍ يُرفض');

select pg_temp.assert_eq(
  (select (public.grant_exemption('81000000-0000-0000-0000-000000000003', 3, 'trial', 'تجربة أسبوع')).used),
  0, 'المنح يبدأ بعدّاد صفر');
select pg_temp.assert_eq(public.exemption_state('81000000-0000-0000-0000-000000000003'), 'active', 'الحالة نشطة بعد المنح');
select pg_temp.expect_error(
  $$select public.grant_exemption('81000000-0000-0000-0000-000000000003', 9, 'partner')$$,
  'ALREADY_EXEMPT', 'لا منح ثانٍ لحساب معفى');

-- ————— ٣) الحساب المعفى ينشئ مناسبة مفعّلة بلا دفع —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status, invite_vars)
values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003',
        'wedding', current_date + 30, 'أسرة الضيافة', 0, 'unpaid',
        '{"host":"أسرة الضيافة","occasion":"زواج سعد"}'::jsonb);

select pg_temp.assert_eq(
  (public.activate_event_by_exemption('82000000-0000-0000-0000-000000000001')) ->> 'ok', 'true',
  'التفعيل بالإعفاء ينجح');
select pg_temp.assert_eq(
  (select status::text from public.events where id = '82000000-0000-0000-0000-000000000001'), 'active',
  'المناسبة مفعّلة بلا دفع');
select pg_temp.assert_eq(
  (select exemption_id is not null from public.events where id = '82000000-0000-0000-0000-000000000001'), true,
  'المناسبة مربوطة بالإعفاء');
select pg_temp.assert_eq(
  (select count(*)::int from public.transactions where event_id = '82000000-0000-0000-0000-000000000001' and type::text = 'exemption' and amount = 0),
  1, 'أثر محاسبي بمبلغ صفر');

-- غير المعفى لا يُفعَّل
insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status, invite_vars)
values ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000004',
        'wedding', current_date + 30, 'أسرة عادية', 0, 'unpaid', '{"host":"أ","occasion":"ب"}'::jsonb);
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select pg_temp.assert_eq(
  (public.activate_event_by_exemption('82000000-0000-0000-0000-000000000002')) ->> 'reason', 'EXEMPTION_NONE',
  'حساب عادي لا يُفعَّل بلا دفع');

-- ————— ٤) الإرسال يتوقف عند السقف تماماً —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
insert into public.guests (id, event_id, name, phone, max_seats)
select ('83000000-0000-0000-0000-00000000000' || i)::uuid, '82000000-0000-0000-0000-000000000001',
       'ضيف ' || i, '96655000000' || i, 4
from generate_series(1, 5) as i;

select pg_temp.assert_eq(
  (public.exemption_can_send('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 3)) ->> 'ok', 'true',
  'فحص الإرسال: ٣ من ٣ مسموح');
select pg_temp.assert_eq(
  (public.exemption_can_send('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 4)) ->> 'reason', 'cap_reached',
  'فحص الإرسال: ٤ من ٣ مرفوض');

do $$
declare r record; ok_count int := 0; exhausted int := 0;
begin
  for r in select * from public.reserve_seats_for_send(
    '82000000-0000-0000-0000-000000000001',
    (select array_agg(id order by id) from public.guests where event_id = '82000000-0000-0000-0000-000000000001'))
  loop
    if r.ok then
      ok_count := ok_count + 1;
      if r.reason <> 'EXEMPTION' then raise exception 'FAIL — السبب % بدل EXEMPTION', r.reason; end if;
    elsif r.reason = 'EXEMPTION_EXHAUSTED' then
      exhausted := exhausted + 1;
    else
      raise exception 'FAIL — سبب غير متوقع %', r.reason;
    end if;
  end loop;
  perform pg_temp.assert_eq(ok_count, 3, 'أُرسلت ٣ دعوات بقدر السقف (مقاعد المدعو لا تُحتسب)');
  perform pg_temp.assert_eq(exhausted, 2, 'ما زاد رُفض بـ EXEMPTION_EXHAUSTED');
end $$;

select pg_temp.assert_eq(
  (select used from public.payment_exemptions where account_id = '81000000-0000-0000-0000-000000000003'), 3,
  'المستخدم ٣ من ٣');
select pg_temp.assert_eq(public.exemption_state('81000000-0000-0000-0000-000000000003'), 'cap_reached', 'الحالة: بلغ السقف');

-- تحرير حجز يعيد دعوة إلى السقف
select public.release_seat_hold('83000000-0000-0000-0000-000000000001');
select pg_temp.assert_eq(
  (select used from public.payment_exemptions where account_id = '81000000-0000-0000-0000-000000000003'), 2,
  'تحرير الحجز يعيد الدعوة إلى السقف');
do $$
declare r record;
begin
  for r in select * from public.reserve_seats_for_send('82000000-0000-0000-0000-000000000001', array['83000000-0000-0000-0000-000000000001'::uuid]) loop
    perform pg_temp.assert_eq(r.ok, true, 'إعادة الإرسال بعد التحرير تنجح');
  end loop;
end $$;

-- ————— ٥) السقف الجديد لا يقلّ عن المستخدم —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select pg_temp.expect_error(
  $$select public.update_exemption_cap('81000000-0000-0000-0000-000000000003', 2)$$,
  'CAP_BELOW_USED', 'السقف ٢ أقل من المستخدم ٣ يُرفض');
select pg_temp.assert_eq(
  (select (public.update_exemption_cap('81000000-0000-0000-0000-000000000003', 4)).cap), 4, 'رفع السقف إلى ٤');
select pg_temp.assert_eq(public.exemption_state('81000000-0000-0000-0000-000000000003'), 'active', 'عاد نشطاً بعد رفع السقف');

-- ————— ٦) السحب يوقف الإرسال الجديد ويُبقي المرسل —————
select pg_temp.assert_eq(
  (select (public.revoke_exemption('81000000-0000-0000-0000-000000000003')).revoked_at is not null), true, 'السحب يسجّل الوقت');
select pg_temp.expect_error(
  $$select public.revoke_exemption('81000000-0000-0000-0000-000000000003')$$,
  'NOT_EXEMPT', 'لا سحب مرّتين');

set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
do $$
declare r record;
begin
  for r in select * from public.reserve_seats_for_send('82000000-0000-0000-0000-000000000001', array['83000000-0000-0000-0000-000000000004'::uuid]) loop
    perform pg_temp.assert_eq(r.reason, 'EXEMPTION_REVOKED', 'بعد السحب: الإرسال الجديد محجوب');
  end loop;
end $$;
select pg_temp.assert_eq(
  (select count(*)::int from public.guests where event_id = '82000000-0000-0000-0000-000000000001' and status = 'sent'), 3,
  'الدعوات المرسلة سابقاً لم تتأثر بالسحب');
select pg_temp.assert_eq(
  (select status::text from public.events where id = '82000000-0000-0000-0000-000000000001'), 'active',
  'المناسبة المفعّلة تبقى مفعّلة بعد السحب');
select pg_temp.assert_eq(
  (public.exemption_can_send('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 1)) ->> 'reason', 'revoked',
  'فحص الإرسال بعد السحب: revoked');

-- مدعو اعتذر ثم أكّد في مناسبة ضيافة: لا يُرفض بنقص المقاعد
select public.rsvp_decline((select invite_token from public.guests where id = '83000000-0000-0000-0000-000000000002'));
select pg_temp.assert_eq(
  (public.rsvp_accept((select invite_token from public.guests where id = '83000000-0000-0000-0000-000000000002'), 4)) ->> 'ok', 'true',
  'تأكيد بعد اعتذار في مناسبة ضيافة لا يتعثّر بالمقاعد');

-- ————— ٧) إعادة المنح بعد السحب تبدأ من الصفر، والانتهاء يُسجَّل مرة واحدة —————
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select pg_temp.assert_eq(
  (select (public.grant_exemption('81000000-0000-0000-0000-000000000003', 10, 'partner', null, now() + interval '1 hour')).used), 0,
  'إعادة المنح بعد السحب تبدأ من الصفر');
update public.payment_exemptions set expires_at = now() - interval '1 minute' where account_id = '81000000-0000-0000-0000-000000000003';
select pg_temp.assert_eq(public.exemption_state('81000000-0000-0000-0000-000000000003'), 'expired', 'الحالة: منتهٍ');
select pg_temp.assert_eq(
  (public.exemption_can_send('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 1)) ->> 'reason', 'expired',
  'فحص الإرسال بعد الانتهاء: expired');
select public.exemption_can_send('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 1);
select pg_temp.assert_eq(
  (select count(*)::int from public.exemption_log where account_id = '81000000-0000-0000-0000-000000000003' and action = 'expire'), 1,
  'الانتهاء يُسجَّل مرة واحدة');

-- ————— ٨) السجل كامل ولا يُحذف منه —————
select pg_temp.assert_eq(
  (select string_agg(action, ',' order by at, id) from public.exemption_log where account_id = '81000000-0000-0000-0000-000000000003'),
  'grant,update,revoke,grant,expire', 'كل منح وتعديل وسحب وانتهاء في السجل');
select pg_temp.assert_eq(
  (select bool_and(admin_id = '81000000-0000-0000-0000-000000000001') from public.exemption_log where action <> 'expire' and account_id = '81000000-0000-0000-0000-000000000003'),
  true, 'الإجراءات اليدوية منسوبة للسوبر أدمن');
select pg_temp.expect_error(
  $$delete from public.exemption_log where account_id = '81000000-0000-0000-0000-000000000003'$$,
  'EXEMPTION_LOG_APPEND_ONLY', 'السجل لا يُحذف منه');
select pg_temp.expect_error(
  $$update public.exemption_log set cap = 999 where account_id = '81000000-0000-0000-0000-000000000003'$$,
  'EXEMPTION_LOG_APPEND_ONLY', 'السجل لا يُعدَّل');

-- ————— ٩) RLS: العميل يرى إعفاءه فقط، والسجل للأدمن وحده —————
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000003';
select pg_temp.assert_eq((select count(*)::int from public.payment_exemptions), 1, 'العميل يرى إعفاءه');
select pg_temp.assert_eq((select count(*)::int from public.exemption_log), 0, 'العميل لا يرى السجل');
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000004';
select pg_temp.assert_eq((select count(*)::int from public.payment_exemptions), 0, 'حساب آخر لا يرى إعفاء غيره');
reset role;

rollback;
