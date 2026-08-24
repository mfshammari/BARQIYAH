-- ============================================================
-- برقية — صفة الحساب تجاه المناسبة: مالك أم داعٍ (SPEC §3)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/event_roles.test.sql
--
-- المالك له صفٌّ في inviters بحسابه نفسه، ويجب ألّا يصير بذلك
-- «داعياً في مناسبة غيره» ولا أن يحتلّ صفّ داعٍ حقيقي.
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
  ('bbbbbbbb-0000-0000-0000-000000000001', 'mohammed@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'other@test.local');

insert into public.packages (id, name, seats, price)
values ('cccccccc-0000-0000-0000-000000000001', 'قياسية', 300, 699)
on conflict do nothing;

-- مناسبة يملكها محمد
insert into public.events (id, owner_id, package_id, occasion_type, event_date,
                           host_name, seats_quota, status)
values ('dddddddd-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001',
        'wedding', current_date + 30, 'أسرة العبدالله', 300, 'active');

-- صفّ المالك (كما ينشئه التطبيق)
insert into public.inviters (id, event_id, profile_id, name, role_label, seats_quota)
values ('eeeeeeee-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 'محمد العبدالله', 'المالك', 0);

select pg_temp.assert_eq(
  (select count(*)::int from public.inviters
   where event_id='dddddddd-0000-0000-0000-000000000001'), 1,
  'صفّ المالك يُنشأ بلا اعتراض');

-- داعٍ حقيقي لم ينضم بعد
insert into public.inviters (id, event_id, name, role_label, seats_quota)
values ('eeeeeeee-0000-0000-0000-000000000002',
        'dddddddd-0000-0000-0000-000000000001', 'أم عبدالله الفالح', 'داعية', 100);

-- (١) المالك يحاول احتلال صفّ الداعي بفتح رابطه
do $$
begin
  update public.inviters
  set profile_id = 'bbbbbbbb-0000-0000-0000-000000000001'
  where id = 'eeeeeeee-0000-0000-0000-000000000002';
  raise exception 'FAIL — المالك احتلّ صفّ داعٍ في مناسبته!';
exception when others then
  if sqlerrm not like '%OWNER_ALREADY_INVITER%' then raise; end if;
  raise notice 'PASS — المالك لا يحتلّ صفّ داعٍ في مناسبته';
end $$;

-- (٢) داعٍ حقيقي ينضم بلا مشكلة
update public.inviters
set profile_id = 'bbbbbbbb-0000-0000-0000-000000000002'
where id = 'eeeeeeee-0000-0000-0000-000000000002';

select pg_temp.assert_eq(
  (select profile_id from public.inviters where id='eeeeeeee-0000-0000-0000-000000000002'),
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'الداعي الحقيقي ينضم إلى صفّه');

-- (٣) الحساب نفسه لا يأخذ صفَّين في المناسبة الواحدة
insert into public.inviters (id, event_id, name, role_label, seats_quota)
values ('eeeeeeee-0000-0000-0000-000000000003',
        'dddddddd-0000-0000-0000-000000000001', 'صفّ زائد', 'داعٍ', 10);

do $$
begin
  update public.inviters
  set profile_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  where id = 'eeeeeeee-0000-0000-0000-000000000003';
  raise exception 'FAIL — حساب واحد أخذ صفَّين في المناسبة نفسها!';
exception when others then
  if sqlerrm not like '%inviters_event_profile_key%'
     and sqlerrm not like '%duplicate key%' then raise; end if;
  raise notice 'PASS — حساب واحد لا يأخذ صفَّين في المناسبة الواحدة';
end $$;

-- (٤) نفس الحساب داعياً في مناسبة أخرى: مسموح
insert into public.events (id, owner_id, package_id, occasion_type, event_date,
                           host_name, seats_quota, status)
values ('dddddddd-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000002',
        'cccccccc-0000-0000-0000-000000000001',
        'wedding', current_date + 60, 'أبو فيصل العتيبي', 300, 'active');

insert into public.inviters (id, event_id, profile_id, name, role_label, seats_quota)
values ('eeeeeeee-0000-0000-0000-000000000004',
        'dddddddd-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001', 'محمد العبدالله', 'داعٍ', 80);

select pg_temp.assert_eq(
  (select count(*)::int from public.inviters
   where profile_id='bbbbbbbb-0000-0000-0000-000000000001'), 2,
  'محمد: صفّ في مناسبته وصفّ داعياً في مناسبة غيره');

-- (٥) استعلام «مناسبات أنا داعٍ فيها» يرجع مناسبة واحدة فقط
select pg_temp.assert_eq(
  (select count(*)::int
   from public.inviters i join public.events e on e.id = i.event_id
   where i.profile_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and e.owner_id is distinct from 'bbbbbbbb-0000-0000-0000-000000000001'), 1,
  '«داعٍ فيها» تستبعد مناسبته هو');

rollback;
