-- ============================================================
-- برقية — اختبارات منطق قاعدة البيانات (الرصيد، الحجز، RSVP، المسح، RLS)
--
-- التشغيل على قاعدة اختبار (ليس الإنتاج!) بعد تطبيق ملفات supabase/migrations:
--   psql "$TEST_DATABASE_URL" -f supabase/tests/logic.test.sql
--
-- كل اختبار يرفع استثناءً عند الفشل، فينتهي التشغيل بخطأ واضح.
-- في نهاية الملف يُلغى كل شيء (rollback) فلا يبقى أثر في القاعدة.
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

-- ————————————— بيانات الاختبار —————————————
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 't-admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 't-owner@test.local'),
  ('33333333-3333-3333-3333-333333333333', 't-scanner@test.local'),
  ('44444444-4444-4444-4444-444444444444', 't-other@test.local');

update public.profiles set role = 'admin'   where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'scanner' where id = '33333333-3333-3333-3333-333333333333';

insert into public.packages (id, name, seats, price)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'باقة اختبار ١٠', 10, 100);

insert into public.events (id, owner_id, package_id, occasion_type, event_date, host_name, seats_quota, status)
values ('eeeeeeee-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-00000000000a', 'wedding', current_date + 10, 'أسرة الاختبار', 10, 'active');

insert into public.inviters (id, event_id, name)
values ('11110000-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a', 'الداعي');

insert into public.guests (id, event_id, inviter_id, name, phone, max_seats) values
  ('99990000-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a', '11110000-0000-0000-0000-00000000000a', 'ضيف أ', '966500000001', 4),
  ('99990000-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000a', '11110000-0000-0000-0000-00000000000a', 'ضيف ب', '966500000002', 5),
  ('99990000-0000-0000-0000-00000000000c', 'eeeeeeee-0000-0000-0000-00000000000a', '11110000-0000-0000-0000-00000000000a', 'ضيف ج', '966500000003', 3);

-- ————————————— ١) الحجز ومنع تجاوز الرصيد —————————————
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare r record; ok_count int := 0; fail_reason text; missing int;
begin
  for r in select * from public.reserve_seats_for_send(
    'eeeeeeee-0000-0000-0000-00000000000a',
    array['99990000-0000-0000-0000-00000000000a',
          '99990000-0000-0000-0000-00000000000b',
          '99990000-0000-0000-0000-00000000000c']::uuid[])
  loop
    if r.ok then ok_count := ok_count + 1;
    else fail_reason := r.reason; missing := r.missing_seats; end if;
  end loop;

  perform pg_temp.assert_eq(ok_count, 2, 'الحجز: نجح مدعوّان فقط (٤+٥ من ١٠)');
  perform pg_temp.assert_eq(fail_reason, 'INSUFFICIENT_SEATS', 'الحجز: الثالث مرفوض لنقص الرصيد');
  perform pg_temp.assert_eq(missing, 2, 'الحجز: عدد المقاعد الناقصة = ٢');
end $$;

do $$
declare b record;
begin
  select * into b from public.event_balance('eeeeeeee-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(b.held, 9, 'الرصيد: المحجوز بعد الإرسال');
  perform pg_temp.assert_eq(b.confirmed, 0, 'الرصيد: المؤكّد قبل الردود');
  perform pg_temp.assert_eq(b.available, 1, 'الرصيد: المتاح');
  perform pg_temp.assert_eq(b.messages_used, 2, 'الرصيد: الرسائل المستخدمة');
end $$;

-- ————————————— ٢) منع الإرسال المكرر —————————————
do $$
declare r record;
begin
  select * into r from public.reserve_seats_for_send(
    'eeeeeeee-0000-0000-0000-00000000000a', array['99990000-0000-0000-0000-00000000000a']::uuid[]);
  perform pg_temp.assert_eq(r.reason, 'ALREADY_SENT', 'منع إعادة إرسال دعوة مُرسلة');
end $$;

-- ————————————— ٣) تأكيد الحضور —————————————
do $$
declare res jsonb; tok uuid;
begin
  select invite_token into tok from public.guests where id = '99990000-0000-0000-0000-00000000000a';

  res := public.rsvp_accept(tok, 6);
  perform pg_temp.assert_eq(res ->> 'reason', 'INVALID_SEATS', 'رفض عدد يتجاوز الحد الأقصى');

  res := public.rsvp_accept(tok, 2);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'قبول عدد صالح');
  perform pg_temp.assert_eq((res ->> 'confirmed_seats')::int, 2, 'حفظ العدد الفعلي المؤكّد');
  perform pg_temp.assert_eq((res ->> 'qr_token') is not null, true, 'توليد رمز الباركود عند التأكيد');
end $$;

-- ————————————— ٤) الاعتذار يحرّر المقاعد —————————————
do $$
declare res jsonb; b record;
begin
  res := public.rsvp_decline((select invite_token from public.guests where id = '99990000-0000-0000-0000-00000000000b'));
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'تسجيل الاعتذار');

  select * into b from public.event_balance('eeeeeeee-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(b.held, 0, 'الاعتذار والتأكيد حرّرا كل الحجوزات');
  perform pg_temp.assert_eq(b.confirmed, 2, 'المؤكّد = العدد الفعلي فقط');
  perform pg_temp.assert_eq(b.available, 8, 'المتاح بعد تحرير الفائض');
end $$;

-- ————————————— ٥) المسح: أحادي حتى اكتمال المقاعد —————————————
insert into public.scanners (event_id, profile_id, label)
values ('eeeeeeee-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333', 'البوابة');

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare res jsonb;
begin
  res := public.scan_qr((select qr_token from public.guests where id = '99990000-0000-0000-0000-00000000000a'));
  perform pg_temp.assert_eq(res ->> 'reason', 'FORBIDDEN', 'منع المسح من حساب غير مصرّح');
end $$;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare res jsonb; tok uuid; st text; used int;
begin
  select qr_token into tok from public.guests where id = '99990000-0000-0000-0000-00000000000a';

  res := public.scan_qr(tok);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'المسح الأول ناجح');
  perform pg_temp.assert_eq((res ->> 'remaining')::int, 1, 'يتبقى مقعد واحد');

  res := public.scan_qr(tok);
  perform pg_temp.assert_eq((res ->> 'completed')::boolean, true, 'المسح الثاني يُكمل المقاعد');

  res := public.scan_qr(tok);
  perform pg_temp.assert_eq(res ->> 'reason', 'CODE_EXHAUSTED', 'رفض المسح بعد اكتمال المقاعد');

  select status, scans_used into st, used from public.guests where id = '99990000-0000-0000-0000-00000000000a';
  perform pg_temp.assert_eq(st, 'attended', 'الحالة أصبحت «حضر»');
  perform pg_temp.assert_eq(used, 2, 'عدد المسحات = المقاعد المؤكّدة');

  res := public.scan_qr('00000000-0000-0000-0000-0000000000ff');
  perform pg_temp.assert_eq(res ->> 'reason', 'INVALID_CODE', 'رفض رمز غير موجود');
end $$;

-- ————————————— ٦) صلاحيات الأدمن —————————————
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare res jsonb; tx int;
begin
  res := public.admin_activate_event(
    'eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'upgrade', 'اختبار');
  perform pg_temp.assert_eq((res ->> 'seats_quota')::int, 20, 'الترقية تضيف مقاعد فوق الرصيد');

  select count(*)::int into tx from public.transactions where event_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  perform pg_temp.assert_eq(tx, 1, 'تسجيل العملية في transactions');
end $$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    perform public.admin_activate_event(
      'eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a');
    raise exception 'FAIL — سمح لغير الأدمن بالتفعيل';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
    raise notice 'PASS — منع غير الأدمن من التفعيل';
  end;
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
begin
  begin
    perform public.reserve_seats_for_send(
      'eeeeeeee-0000-0000-0000-00000000000a', array['99990000-0000-0000-0000-00000000000c']::uuid[]);
    raise exception 'FAIL — سمح لغير المالك بحجز المقاعد';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
    raise notice 'PASS — منع غير المالك من الحجز';
  end;
end $$;

-- ————————————— ٧) عزل RLS بين المناسبات —————————————
insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
values ('eeeeeeee-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444',
        'wedding', current_date + 20, 'أسرة أخرى', 50, 'active');
insert into public.guests (event_id, name, phone, max_seats)
values ('eeeeeeee-0000-0000-0000-00000000000b', 'ضيف المالك الثاني', '966599999999', 2);

set local role authenticated;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 3, 'المالك أ يرى مدعويه فقط');
  perform pg_temp.assert_eq((select count(*)::int from public.events), 1, 'المالك أ يرى مناسبته فقط');
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
begin
  update public.guests set name = 'اختراق' where event_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  perform pg_temp.assert_eq((select count(*)::int from public.guests where name = 'اختراق'), 0,
                            'RLS تمنع تعديل مدعوي مناسبة أخرى');
end $$;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 3, 'الماسح يرى مدعوي مناسبته فقط');
  perform pg_temp.assert_eq((select count(*)::int from public.integration_settings), 0,
                            'الماسح لا يرى إعدادات واتساب');
end $$;

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  perform pg_temp.assert_eq((select count(*)::int from public.guests), 0, 'الزائر لا يرى أي مدعو');
  perform pg_temp.assert_eq((select count(*)::int from public.events), 0, 'الزائر لا يرى أي مناسبة');
  perform pg_temp.assert_eq((select count(*)::int from public.templates), 0, 'الزائر لا يرى أي قالب');
end $$;
reset role;

rollback;
