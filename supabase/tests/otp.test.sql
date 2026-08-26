-- ============================================================
-- برقية — دخول العميل بالجوال: الرمز وحدوده
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/otp.test.sql
--
-- يثبت: البصمة لا النص، الصلاحية، القفل بعد ٥ محاولات،
-- حد ٣ طلبات/ساعة، وإبطال الرمز القديم عند إصدار جديد.
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

-- (١) طلب رمز ينجح ويخزّن بصمة لا نصّاً
select pg_temp.assert_eq((select ok from public.request_otp('966555000001','123456')), true,
  'الطلب الأول ينجح');
select pg_temp.assert_eq(
  (select code_hash = '123456' from public.otp_requests where phone='966555000001'), false,
  'المخزَّن بصمة لا نصّ الرمز');

-- (٢) رمز خاطئ يُرفض وينقص المحاولات
select pg_temp.assert_eq((select reason from public.verify_otp('966555000001','000000')), 'INVALID_CODE',
  'رمز خاطئ يُرفض');
select pg_temp.assert_eq((select attempts_left from public.verify_otp('966555000001','000001')), 3,
  'المحاولات المتبقية تنقص');

-- (٣) الرمز الصحيح ينجح ويُستهلك فلا يصلح ثانيةً
select pg_temp.assert_eq((select ok from public.verify_otp('966555000001','123456')), true,
  'الرمز الصحيح ينجح');
select pg_temp.assert_eq((select reason from public.verify_otp('966555000001','123456')), 'EXPIRED',
  'الرمز المستهلَك لا يصلح مرة ثانية');

-- (٤) القفل بعد خمس محاولات خاطئة
select public.request_otp('966555000002','654321');
select public.verify_otp('966555000002','111111');
select public.verify_otp('966555000002','222222');
select public.verify_otp('966555000002','333333');
select public.verify_otp('966555000002','444444');
select pg_temp.assert_eq((select reason from public.verify_otp('966555000002','555555')),
  'TOO_MANY_ATTEMPTS', 'القفل بعد خمس محاولات');
select pg_temp.assert_eq((select reason from public.verify_otp('966555000002','654321')),
  'EXPIRED', 'حتى الرمز الصحيح لا ينفع بعد القفل');

-- (٥) انتهاء الصلاحية
select public.request_otp('966555000003','777777', 60);
update public.otp_requests set expires_at = now() - interval '1 second'
where phone = '966555000003';
select pg_temp.assert_eq((select reason from public.verify_otp('966555000003','777777')), 'EXPIRED',
  'الرمز المنتهي لا يصلح');

-- (٦) حد المعدّل: ثلاثة طلبات في الساعة
select public.request_otp('966555000004','111111');
select public.request_otp('966555000004','222222');
select public.request_otp('966555000004','333333');
select pg_temp.assert_eq((select reason from public.request_otp('966555000004','444444')),
  'RATE_LIMITED', 'الطلب الرابع في الساعة يُرفض');

-- (٧) الرمز الأحدث وحده يصلح
select public.request_otp('966555000005','111111');
select public.request_otp('966555000005','222222');
select pg_temp.assert_eq((select ok from public.verify_otp('966555000005','111111')), false,
  'الرمز القديم بطل بإصدار رمز جديد');
select pg_temp.assert_eq((select ok from public.verify_otp('966555000005','222222')), true,
  'الرمز الأحدث يصلح');

-- (٨) بصمة الرمز مملّحة بالجوال
select pg_temp.assert_eq(
  public.otp_hash('966555000001','123456') = public.otp_hash('966555000009','123456'), false,
  'الرمز نفسه لجوالين بصمتان مختلفتان');

-- (٩) رمز الاسترجاع يُخزَّن مبصوماً
insert into auth.users (id, email) values ('99990000-0000-0000-0000-000000000001','r@t.local');
select public.set_recovery_code('99990000-0000-0000-0000-000000000001','ABCD-EFGH-IJKL');
select pg_temp.assert_eq(
  (select recovery_hash = 'ABCD-EFGH-IJKL' from public.profiles
   where id='99990000-0000-0000-0000-000000000001'), false,
  'رمز الاسترجاع مخزَّن كبصمة لا كنص');
select pg_temp.assert_eq(
  (select recovery_hash is not null from public.profiles
   where id='99990000-0000-0000-0000-000000000001'), true,
  'بصمة رمز الاسترجاع محفوظة');

rollback;
