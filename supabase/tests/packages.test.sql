-- ============================================================
-- برقية — اختبار الباقات: التسعير التراكمي، رفض الشرائح غير المرتّبة،
--          تجميد السعر لحظة الشراء، وقراءة الزائر (المرحلة ٢)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/packages.test.sql
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
  ('a1000000-0000-0000-0000-000000000001', 'pkg-owner@test.local');

-- باقتان ثابتتان وباقة مخصّصة بثلاث شرائح: ١٠٠٠→١٫٥، ٣٠٠٠→١٫٢، ٧٠٠٠→١٫٠
insert into public.packages (id, name, kind, seats, price, active, sort_order)
values ('a2000000-0000-0000-0000-000000000001', 'أساسية', 'fixed', 200, 1299, true, 1),
       ('a2000000-0000-0000-0000-000000000002', 'موقوفة', 'fixed', 500, 1999, false, 2);

insert into public.packages (id, name, kind, seats, price, active, min_qty, sort_order)
values ('a2000000-0000-0000-0000-000000000003', 'مخصّصة', 'custom', 1000, 0, true, 1000, 9);

select public.set_package_tiers(
  'a2000000-0000-0000-0000-000000000003', 1000,
  '[{"min_qty":1000,"unit_price":1.5},{"min_qty":3000,"unit_price":1.2},{"min_qty":7000,"unit_price":1.0}]'::jsonb);

-- ————— ١) التسعير التراكمي —————
select pg_temp.assert_eq(public.custom_package_price(1500), 2250.00::numeric,
  '١٥٠٠ دعوة داخل الشريحة الأولى = ١٥٠٠ × ١٫٥');
select pg_temp.assert_eq(public.custom_package_price(3500), (2999 * 1.5 + 501 * 1.2)::numeric,
  '٣٥٠٠ دعوة: ٢٩٩٩ بالشريحة الأولى و٥٠١ بالثانية');
select pg_temp.assert_eq(public.custom_package_price(8000), (2999 * 1.5 + 4000 * 1.2 + 1001 * 1.0)::numeric,
  '٨٠٠٠ دعوة تعبر الشرائح الثلاث');
select pg_temp.assert_eq(
  public.custom_package_price(3000) > public.custom_package_price(2999), true,
  'الفاتورة لا تنخفض بزيادة الكمية (تراكمي)');
select pg_temp.assert_eq(public.custom_package_price(0), 0::numeric, 'كمية صفر = صفر');

-- ————— ٢) رفض الشرائح غير المرتّبة —————
do $$
begin
  begin
    perform public.set_package_tiers(
      'a2000000-0000-0000-0000-000000000003', 1000,
      '[{"min_qty":1000,"unit_price":1.5},{"min_qty":3000,"unit_price":1.7}]'::jsonb);
    raise exception 'FAIL — قُبلت شرائح سعرها يرتفع مع الكمية';
  exception when others then
    if sqlerrm not like '%TIERS_INVALID%' then raise; end if;
    raise notice 'PASS — سعر يرتفع مع الكمية يُرفض بـ TIERS_INVALID';
  end;

  begin
    perform public.set_package_tiers(
      'a2000000-0000-0000-0000-000000000003', 1000,
      '[{"min_qty":1500,"unit_price":1.5},{"min_qty":3000,"unit_price":1.2}]'::jsonb);
    raise exception 'FAIL — قُبلت شرائح أولها لا يساوي أقل كمية';
  exception when others then
    if sqlerrm not like '%TIERS_INVALID%' then raise; end if;
    raise notice 'PASS — أول شريحة ≠ min_qty يُرفض بـ TIERS_INVALID';
  end;
end $$;

-- الشرائح الصالحة ما زالت كما هي بعد المحاولات الفاشلة
select pg_temp.assert_eq(
  (select count(*)::int from public.package_tiers where package_id = 'a2000000-0000-0000-0000-000000000003'),
  3, 'المحاولات الفاشلة لم تُتلف الشرائح الصالحة');

-- ————— ٣) تجميد السعر والمقاعد لحظة الشراء —————
insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
        'wedding', current_date + 30, 'أسرة الباقات', 0, 'unpaid');

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';

do $$
declare v_tx uuid; res jsonb;
begin
  v_tx := public.create_pending_payment(
    'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001');

  perform pg_temp.assert_eq((select amount from public.transactions where id = v_tx), 1299.00::numeric,
    'المبلغ جُمّد في العملية');
  perform pg_temp.assert_eq((select seats_added from public.transactions where id = v_tx), 200,
    'المقاعد جُمّدت في العملية');
  perform pg_temp.assert_eq((select type::text from public.transactions where id = v_tx), 'purchase',
    'أول شراء نوعه purchase');

  -- الأدمن يعدّل الباقة بعد بدء العملية
  update public.packages set price = 1999, seats = 999
   where id = 'a2000000-0000-0000-0000-000000000001';

  res := public.activate_event_from_payment(v_tx, 'inv_pkg_001', null);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'الـwebhook فعّل المناسبة');
  perform pg_temp.assert_eq((res ->> 'seats_quota')::int, 200,
    'المقاعد من العملية لا من الباقة المعدَّلة');
  perform pg_temp.assert_eq((select amount from public.transactions where id = v_tx), 1299.00::numeric,
    'الفاتورة كما كانت رغم تعديل الباقة');
end $$;

-- ————— ٤) الشراء المخصّص والترقية التراكمية —————
do $$
declare v_tx uuid;
begin
  insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
  values ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
          'wedding', current_date + 40, 'أسرة المخصّصة', 0, 'unpaid');

  begin
    perform public.create_pending_payment(
      'a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 500);
    raise exception 'FAIL — قُبلت كمية دون الحد الأدنى';
  exception when others then
    if sqlerrm not like '%QTY_BELOW_MIN%' then raise; end if;
    raise notice 'PASS — كمية دون min_qty تُرفض';
  end;

  v_tx := public.create_pending_payment(
    'a3000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 1500);
  perform pg_temp.assert_eq((select amount from public.transactions where id = v_tx), 2250.00::numeric,
    'شراء مخصّص ١٥٠٠ دعوة = ٢٢٥٠');
  perform pg_temp.assert_eq((select seats_added from public.transactions where id = v_tx), 1500,
    'المقاعد المضافة = الكمية');

  -- ترقية على مناسبة رصيدها ٢٠٠: تُسعَّر بالفرق التراكمي
  v_tx := public.create_pending_payment(
    'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 3000);
  perform pg_temp.assert_eq((select type::text from public.transactions where id = v_tx), 'upgrade',
    'الإضافة على مناسبة قائمة ترقية');
  perform pg_temp.assert_eq(
    (select amount from public.transactions where id = v_tx),
    public.custom_package_price(3200) - public.custom_package_price(200),
    'الترقية = سعر الإجمالي التراكمي − سعر الرصيد الحالي');
end $$;

-- ————— ٥) الزائر يقرأ الباقات النشطة وشرائحها —————
reset request.jwt.claim.sub;
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  perform pg_temp.assert_eq(
    (select count(*)::int from public.packages where id in (
      'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000003')),
    2, 'الزائر يرى الباقتين النشطتين فقط');
  perform pg_temp.assert_eq(
    (select count(*)::int from public.package_tiers where package_id = 'a2000000-0000-0000-0000-000000000003'),
    3, 'الزائر يرى شرائح الباقة المخصّصة');
  perform pg_temp.assert_eq(public.custom_package_price(1000), 1500.00::numeric,
    'الزائر يحسب السعر عبر الدالة');
end $$;
reset role;

rollback;
