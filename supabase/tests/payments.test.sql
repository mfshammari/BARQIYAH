-- ============================================================
-- برقية — اختبار الدفع والتفعيل التلقائي (SPEC §5)
--
-- «اجعل العملية idempotent — البوابات تعيد الإرسال.»
--   psql "$TEST_DATABASE_URL" -f supabase/tests/payments.test.sql
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
  ('f0000000-0000-0000-0000-000000000001', 'pay-owner@test.local');

insert into public.packages (id, name, seats, price)
values ('f1000000-0000-0000-0000-00000000000a', 'باقة دفع', 200, 1299);

insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
values ('f2000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001',
        'wedding', current_date + 30, 'أسرة الدفع', 0, 'unpaid');

-- ————— ١) إنشاء عملية معلّقة —————
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';

do $$
declare v_tx uuid; v_status text;
begin
  v_tx := public.create_pending_payment(
    'f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a');
  perform pg_temp.assert_eq(v_tx is not null, true, 'أُنشئت عملية معلّقة');

  select status::text into v_status from public.transactions where id = v_tx;
  perform pg_temp.assert_eq(v_status, 'pending', 'حالتها معلّقة قبل السداد');

  perform pg_temp.assert_eq(
    (select status::text from public.events where id = 'f2000000-0000-0000-0000-00000000000a'),
    'unpaid', 'المناسبة تبقى غير مدفوعة قبل الـwebhook');

  perform set_config('test.tx_id', v_tx::text, true);
end $$;

-- ————— ٢) الـwebhook يفعّل المناسبة —————
do $$
declare v_tx uuid := current_setting('test.tx_id')::uuid; res jsonb;
begin
  res := public.activate_event_from_payment(v_tx, 'inv_moyasar_001', 1299);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'الـwebhook فعّل المناسبة');
  perform pg_temp.assert_eq((res ->> 'seats_quota')::int, 200, 'أُضيفت مقاعد الباقة');

  perform pg_temp.assert_eq(
    (select status::text from public.events where id = 'f2000000-0000-0000-0000-00000000000a'),
    'active', 'حالة المناسبة صارت مفعّلة');

  perform pg_temp.assert_eq(
    (select activated_by is null from public.events where id = 'f2000000-0000-0000-0000-00000000000a'),
    true, 'المنفّذ فارغ = تفعيل تلقائي من النظام');

  perform pg_temp.assert_eq(
    (select paid_at is not null from public.transactions where id = v_tx),
    true, 'سُجّل وقت السداد');
end $$;

-- ————— ٣) idempotency: إعادة الإرسال لا تضاعف المقاعد —————
do $$
declare v_tx uuid := current_setting('test.tx_id')::uuid; res jsonb;
begin
  res := public.activate_event_from_payment(v_tx, 'inv_moyasar_001', 1299);
  perform pg_temp.assert_eq((res ->> 'ok')::boolean, true, 'إعادة الإرسال تُقبل بهدوء');
  perform pg_temp.assert_eq((res ->> 'idempotent')::boolean, true, 'وتُعلَن كتكرار');

  perform pg_temp.assert_eq(
    (select seats_quota from public.events where id = 'f2000000-0000-0000-0000-00000000000a'),
    200, 'المقاعد لم تتضاعف بإعادة الإرسال');
end $$;

-- إرسال ثالث ورابع (البوابات تعيد المحاولة مراراً)
do $$
declare v_tx uuid := current_setting('test.tx_id')::uuid;
begin
  perform public.activate_event_from_payment(v_tx, 'inv_moyasar_001', 1299);
  perform public.activate_event_from_payment(v_tx, 'inv_moyasar_001', 1299);
  perform pg_temp.assert_eq(
    (select seats_quota from public.events where id = 'f2000000-0000-0000-0000-00000000000a'),
    200, 'أربع محاولات = رصيد واحد');
  perform pg_temp.assert_eq(
    (select count(*)::int from public.transactions where event_id = 'f2000000-0000-0000-0000-00000000000a'),
    1, 'عملية واحدة مسجّلة لا أربع');
end $$;

-- ————— ٤) سجل النشاط يميّز التفعيل التلقائي —————
do $$
begin
  perform pg_temp.assert_eq(
    (select count(*)::int from public.activity_logs
      where action = 'event.activated_by_payment' and actor_id is null),
    1, 'سُجّل التفعيل بمنفّذ = النظام');
end $$;

-- ————— ٥) عملية غير موجودة —————
do $$
declare res jsonb;
begin
  res := public.activate_event_from_payment('00000000-0000-0000-0000-0000000000ff', 'x', 1);
  perform pg_temp.assert_eq(res ->> 'reason', 'TRANSACTION_NOT_FOUND', 'رفض عملية غير موجودة');
end $$;

-- ————— ٦) فشل السداد يُسجَّل ولا يفعّل —————
do $$
declare v_tx2 uuid;
begin
  insert into public.events (id, owner_id, occasion_type, event_date, host_name, seats_quota, status)
  values ('f2000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001',
          'wedding', current_date + 40, 'أسرة أخرى', 0, 'unpaid');

  v_tx2 := public.create_pending_payment(
    'f2000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-00000000000a');

  perform public.fail_payment(v_tx2, 'بطاقة مرفوضة');

  perform pg_temp.assert_eq(
    (select status::text from public.transactions where id = v_tx2), 'failed',
    'العملية صارت فاشلة');
  perform pg_temp.assert_eq(
    (select status::text from public.events where id = 'f2000000-0000-0000-0000-00000000000b'),
    'unpaid', 'المناسبة لم تُفعَّل عند فشل السداد');
end $$;

-- ————— ٧) غير المالك لا ينشئ عملية على مناسبة غيره —————
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000002', 'other@test.local');
set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';
do $$
begin
  begin
    perform public.create_pending_payment(
      'f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL — غير المالك أنشأ عملية دفع';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
    raise notice 'PASS — منع غير المالك من إنشاء عملية دفع';
  end;
end $$;

rollback;
