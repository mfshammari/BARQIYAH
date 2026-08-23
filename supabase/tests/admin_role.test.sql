-- ============================================================
-- برقية — اختبارات دور الأدمن: منع رفع الصلاحية عند التسجيل، والترقية الآمنة
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/admin_role.test.sql
--
-- كل اختبار يرفع استثناءً عند الفشل، وينتهي الملف بـ rollback.
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

-- ١) مهاجم يسجّل نفسه بـ role='admin_owner' في بيانات التسجيل
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'attacker@evil.test',
   '{"role":"admin_owner","full_name":"مهاجم"}'::jsonb);

select pg_temp.assert_eq(
  (select role::text from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'user', 'التسجيل بدور admin_owner يُتجاهل ويُنشأ الحساب كعميل');

select pg_temp.assert_eq(
  (select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'مهاجم', 'بقية بيانات التسجيل تُحفَظ كما هي');

-- ٢) ترقية حساب حقيقي من محرّر SQL (بلا جلسة)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Owner@Barqiyah.SA');

select public.grant_admin('owner@barqiyah.sa', 'admin_owner');

select pg_temp.assert_eq(
  (select role::text from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'admin_owner', 'الترقية من محرّر SQL تنجح ولو اختلف حرف البريد');

-- ٣) بريد غير مسجّل يرفع خطأً واضحاً
do $$
begin
  perform public.grant_admin('ghost@nowhere.test');
  raise exception 'FAIL — بريد غير مسجّل كان يجب أن يُرفض';
exception when others then
  if sqlerrm not like '%USER_NOT_FOUND%' then raise; end if;
  raise notice 'PASS — بريد غير مسجّل يُرفض برسالة واضحة';
end $$;

-- ٤) دور غير إداري يُرفض
do $$
begin
  perform public.grant_admin('owner@barqiyah.sa', 'scanner');
  raise exception 'FAIL — دور غير إداري كان يجب أن يُرفض';
exception when others then
  if sqlerrm not like '%INVALID_ROLE%' then raise; end if;
  raise notice 'PASS — دور غير إداري يُرفض';
end $$;

-- ٥) عميل مسجَّل الدخول لا يستطيع ترقية نفسه
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  perform public.grant_admin('attacker@evil.test', 'admin_owner');
  raise exception 'FAIL — عميل رقّى نفسه!';
exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  raise notice 'PASS — عميل مسجَّل الدخول لا يرقّي نفسه';
end $$;
reset request.jwt.claim.sub;

-- ٦) أدمن يملك إدارة الفريق يستطيع الترقية من الويب
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'boss@barqiyah.sa'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'newstaff@barqiyah.sa');
update public.profiles set role = 'admin_owner'
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';

set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select public.grant_admin('newstaff@barqiyah.sa', 'admin_finance');
reset request.jwt.claim.sub;

select pg_temp.assert_eq(
  (select role::text from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'admin_finance', 'مدير المنصة يستطيع ترقية عضو فريق');

rollback;
