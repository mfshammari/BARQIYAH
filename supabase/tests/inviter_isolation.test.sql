-- ============================================================
-- برقية — اختبار عزل الدعاة (SPEC §8.4)
--
-- «تسريب مقاعد أو مدعوّي طرف لطرف آخر خطأ جسيم — خصوصاً بين أهل
-- العريس وأهل العروس». هذه الاختبارات تثبت أن العزل حقيقي.
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/inviter_isolation.test.sql
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

-- ————— مستخدمون: مالك + داعيان من طرفين + أدمن —————
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'iso-admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'iso-owner@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'iso-groom@test.local'),   -- داعٍ: أهل العريس
  ('a0000000-0000-0000-0000-000000000004', 'iso-bride@test.local');   -- داعٍ: أهل العروس

update public.profiles set role = 'admin_owner' where id = 'a0000000-0000-0000-0000-000000000001';

insert into public.packages (id, name, seats, price)
values ('b0000000-0000-0000-0000-00000000000a', 'باقة عزل', 100, 0);

insert into public.events (id, owner_id, package_id, occasion_type, event_date, host_name, seats_quota, status)
values ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-00000000000a', 'wedding', current_date + 30, 'أسرة العزل', 100, 'active');

insert into public.inviters (id, event_id, profile_id, name, phone, side_label, seats_quota) values
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
   'a0000000-0000-0000-0000-000000000003', 'أم حمودي', '966500000011', 'أهل العريس', 40),
  ('d0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000a',
   'a0000000-0000-0000-0000-000000000004', 'أم سوسو', '966500000012', 'أهل العروس', 30);

insert into public.guests (event_id, inviter_id, name, phone, max_seats) values
  ('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'ضيف العريس ١', '966500001001', 4),
  ('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'ضيف العريس ٢', '966500001002', 2),
  ('c0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000b', 'ضيف العروس ١', '966500002001', 3);

set local role authenticated;

-- ————— ١) كل داعٍ يرى مدعوّيه فقط —————
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 2,
    'داعي العريس يرى مدعوّيه الاثنين فقط');
  perform pg_temp.assert_eq(
    (select count(*)::int from public.guests where name like '%العروس%'), 0,
    'داعي العريس لا يرى أي مدعو من أهل العروس');
end $$;

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 1,
    'داعية العروس ترى مدعوّها الواحد فقط');
end $$;

-- ————— ٢) الداعي لا يعدّل مدعوّي غيره —————
do $$
declare v_changed int;
begin
  update public.guests set name = 'اختراق' where inviter_id = 'd0000000-0000-0000-0000-00000000000a';
  get diagnostics v_changed = row_count;
  perform pg_temp.assert_eq(v_changed, 0, 'RLS تمنع تعديل مدعوّي داعٍ آخر');
end $$;

-- ————— ٣) الداعي لا يغيّر حصته —————
do $$ begin
  begin
    update public.inviters set seats_quota = 90
    where id = 'd0000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL — الداعي رفع حصته بنفسه';
  exception when others then
    if sqlerrm <> 'SEATS_QUOTA_IS_OWNED_BY_EVENT_OWNER' then raise; end if;
    raise notice 'PASS — منع الداعي من تغيير حصته';
  end;
end $$;

-- ————— ٤) الداعي يملك نصّه وقالبه —————
do $$ begin
  update public.inviters
     set invite_vars = '{"host":"أم سوسو","occasion":"زواج ابنتي سوسو"}'::jsonb
   where id = 'd0000000-0000-0000-0000-00000000000b';
  perform pg_temp.assert_eq(
    (select invite_vars ->> 'host' from public.inviters where id = 'd0000000-0000-0000-0000-00000000000b'),
    'أم سوسو', 'الداعي يكتب نصّه بحرية');
end $$;

-- ————— ٥) المالك لا يملك نصّ الداعي —————
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update public.inviters set invite_vars = '{"host":"تعديل المالك"}'::jsonb
    where id = 'd0000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL — المالك عدّل نصّ الداعي';
  exception when others then
    if sqlerrm <> 'INVITER_CONTENT_IS_OWNED_BY_INVITER' then raise; end if;
    raise notice 'PASS — المالك لا يملك تعديل نصّ الداعي';
  end;
end $$;

-- ————— ٦) المالك يوزّع الحصص، ولا يتجاوز رصيد المناسبة —————
do $$ begin
  update public.inviters set seats_quota = 50 where id = 'd0000000-0000-0000-0000-00000000000a';
  perform pg_temp.assert_eq(
    (select seats_quota from public.inviters where id = 'd0000000-0000-0000-0000-00000000000a'),
    50, 'المالك يعدّل حصة الداعي');

  begin
    update public.inviters set seats_quota = 80 where id = 'd0000000-0000-0000-0000-00000000000b';
    raise exception 'FAIL — مجموع الحصص تجاوز رصيد المناسبة';
  exception when others then
    if sqlerrm <> 'QUOTA_EXCEEDS_EVENT_SEATS' then raise; end if;
    raise notice 'PASS — منع تجاوز مجموع الحصص لرصيد المناسبة';
  end;
end $$;

-- ————— ٧) المالك يرى كل المدعوين —————
do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 3,
    'المالك يرى مدعوي كل الدعاة');
end $$;

-- ————— ٨) دفتر العناوين خاص بمالكه ولا يراه الأدمن —————
insert into public.contacts (owner_id, name, phone) values
  ('a0000000-0000-0000-0000-000000000002', 'جهة خاصة', '966500009999');

do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.contacts), 1,
    'صاحب الدفتر يرى جهاته');
end $$;

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.contacts), 0,
    'الداعي لا يرى دفتر عناوين المالك');
end $$;

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  perform pg_temp.assert_eq((select count(*)::int from public.contacts), 0,
    'حتى الأدمن لا يرى دفتر عناوين العميل (سياسة البيانات §7)');
end $$;

-- ————— ٩) مصفوفة الصلاحيات —————
do $$ begin
  perform pg_temp.assert_eq(public.has_permission('whatsapp_settings'), true,
    'المدير يملك إعدادات واتساب');
end $$;

update public.profiles set role = 'admin_finance' where id = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  perform pg_temp.assert_eq(public.has_permission('finance'), true, 'المحاسب يملك المالية');
  perform pg_temp.assert_eq(public.has_permission('whatsapp_settings'), false,
    'المحاسب لا يملك إعدادات واتساب');
  perform pg_temp.assert_eq(public.has_permission('review_templates'), false,
    'المحاسب لا يراجع القوالب');
end $$;

update public.profiles set role = 'admin_reviewer' where id = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  perform pg_temp.assert_eq(public.has_permission('review_templates'), true, 'المراجع يراجع القوالب');
  perform pg_temp.assert_eq(public.has_permission('manual_activation'), false,
    'المراجع لا يفعّل المناسبات يدوياً');
end $$;

-- ————— ١٠) رصيد الداعي محسوب داخل حصته وحدها —————
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';

do $$
declare b record;
begin
  select * into b from public.inviter_balance('d0000000-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(b.seats_quota, 50, 'حصة الداعي كما وزّعها المالك');
  perform pg_temp.assert_eq(b.held, 0, 'لا حجز قبل الإرسال');
  perform pg_temp.assert_eq(b.available, 50, 'المتاح = الحصة كاملة');
  perform pg_temp.assert_eq(b.total_guests, 2, 'يرى مدعوّيه الاثنين فقط لا الثلاثة');
end $$;

-- ————— ١١) الحجز يخصم من حصة الداعي —————
do $$
declare r record; okc int := 0;
begin
  for r in select * from public.reserve_seats_for_inviter(
    'd0000000-0000-0000-0000-00000000000a',
    array(select id from public.guests where inviter_id = 'd0000000-0000-0000-0000-00000000000a'))
  loop
    if r.ok then okc := okc + 1; end if;
  end loop;
  perform pg_temp.assert_eq(okc, 2, 'حُجز مدعوّا الداعي (٤+٢ من حصة ٥٠)');
end $$;

do $$
declare b record;
begin
  select * into b from public.inviter_balance('d0000000-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(b.held, 6, 'المحجوز من حصته = ٤+٢');
  perform pg_temp.assert_eq(b.available, 44, 'المتاح له نقص بمقدار المحجوز');
end $$;

-- الداعي لا يقرأ رصيد داعٍ آخر أصلاً (الدالة لا تعيد صفوفاً)
do $$
begin
  perform pg_temp.assert_eq(
    (select count(*)::int from public.inviter_balance('d0000000-0000-0000-0000-00000000000b')),
    0, 'الداعي لا يقرأ رصيد داعٍ آخر');
end $$;

-- والمالك يرى الاثنين: حصة الداعي الآخر لم تتأثر بإرسال غيره
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
do $$
declare b record;
begin
  select * into b from public.inviter_balance('d0000000-0000-0000-0000-00000000000b');
  perform pg_temp.assert_eq(b.held, 0, 'حصة الداعي الآخر لم تتأثر بإرسال غيره');

  select * into b from public.inviter_balance('d0000000-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(b.held, 6, 'المالك يرى رصيد كل داعٍ');
end $$;

-- ————— ١٢) منع تجاوز حصة الداعي —————
insert into public.guests (id, event_id, inviter_id, name, phone, max_seats)
values ('99991111-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
        'd0000000-0000-0000-0000-00000000000b', 'ضيف كبير', '966500003001', 40);

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
do $$
declare r record;
begin
  select * into r from public.reserve_seats_for_inviter(
    'd0000000-0000-0000-0000-00000000000b',
    array['99991111-0000-0000-0000-00000000000a']::uuid[]);
  perform pg_temp.assert_eq(r.reason, 'INSUFFICIENT_QUOTA', 'منع تجاوز حصة الداعي');
  perform pg_temp.assert_eq(r.missing_seats, 10, 'يبيّن كم مقعداً ينقصه (٤٠ - ٣٠)');
end $$;

-- ————— ١٣) الداعي لا يحجز من حصة داعٍ آخر —————
do $$
begin
  begin
    perform public.reserve_seats_for_inviter(
      'd0000000-0000-0000-0000-00000000000a', array[]::uuid[]);
    raise exception 'FAIL — داعٍ حجز من حصة داعٍ آخر';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
    raise notice 'PASS — منع الداعي من الحجز على حصة غيره';
  end;
end $$;

reset role;
rollback;
