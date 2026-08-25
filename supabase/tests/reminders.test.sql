-- ============================================================
-- برقية — تذكير واحد لمن لم يردّ (SPEC §4.1)
--
--   psql "$TEST_DATABASE_URL" -f supabase/tests/reminders.test.sql
--
-- الشرطان: مضى ٥ أيام كاملة، وreminded_at فارغ — مرة واحدة أبداً.
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
  ('aaaa0000-0000-0000-0000-000000000001','owner@t.local'),
  ('aaaa0000-0000-0000-0000-000000000002','inv@t.local');
insert into public.packages (id, name, seats, price)
values ('bbbb0000-0000-0000-0000-000000000001','قياسية',300,699);
insert into public.events (id, owner_id, package_id, occasion_type, event_date, host_name, seats_quota, status)
values ('cccc0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001',
        'bbbb0000-0000-0000-0000-000000000001','wedding', current_date+30,'أسرة العبدالله',300,'active');
insert into public.inviters (id, event_id, profile_id, name, role_label, seats_quota)
values ('dddd0000-0000-0000-0000-000000000001','cccc0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000001','المالك','المالك',0),
       ('dddd0000-0000-0000-0000-000000000002','cccc0000-0000-0000-0000-000000000001',
        'aaaa0000-0000-0000-0000-000000000002','أم عبدالله','داعية',100);

-- مدعوون بحالات ومواعيد مختلفة
insert into public.guests (id, event_id, inviter_id, name, phone, max_seats, status, sent_at) values
  ('eeee0000-0000-0000-0000-000000000001','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000001','مضى ٦ أيام','966500000001',3,'sent', now() - interval '6 days'),
  ('eeee0000-0000-0000-0000-000000000002','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000001','مضى ٥ أيام بالضبط','966500000002',2,'sent', now() - interval '5 days'),
  ('eeee0000-0000-0000-0000-000000000003','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000001','مضى ٤ أيام','966500000003',2,'sent', now() - interval '4 days'),
  ('eeee0000-0000-0000-0000-000000000004','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000001','أكّد','966500000004',2,'accepted', now() - interval '7 days'),
  ('eeee0000-0000-0000-0000-000000000005','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000001','مسودة','966500000005',2,'draft', null),
  ('eeee0000-0000-0000-0000-000000000006','cccc0000-0000-0000-0000-000000000001',
   'dddd0000-0000-0000-0000-000000000002','مدعو الداعية','966500000006',4,'sent', now() - interval '9 days');

-- (١) العدّ: المؤهّل من مضى عليه ٥ أيام فأكثر وحالته sent
select pg_temp.assert_eq(
  public.reminder_due_count('cccc0000-0000-0000-0000-000000000001'), 3,
  'المؤهّلون ٣: ٦ أيام و٥ أيام بالضبط ومدعو الداعية — لا ٤ أيام ولا المؤكّد ولا المسودة');

-- (٢) نطاق الداعي: مدعوّوه وحدهم
select pg_temp.assert_eq(
  public.reminder_due_count('cccc0000-0000-0000-0000-000000000001',
                            'dddd0000-0000-0000-0000-000000000002'), 1,
  'الداعية ترى مؤهّلاً واحداً — مدعوّها وحده');

-- (٣) الإرسال يعلّم المؤهّلين فقط
select pg_temp.assert_eq(
  (select count(*)::int from public.mark_reminders_sent('cccc0000-0000-0000-0000-000000000001')), 3,
  'دفعة التذكير علّمت ٣ مدعوّين');

select pg_temp.assert_eq(
  (select reminded_at is not null from public.guests where id='eeee0000-0000-0000-0000-000000000001'),
  true, 'من مضى عليه ٦ أيام صار مذكَّراً');
select pg_temp.assert_eq(
  (select reminded_at is null from public.guests where id='eeee0000-0000-0000-0000-000000000003'),
  true, 'من مضى عليه ٤ أيام لم يُذكَّر');
select pg_temp.assert_eq(
  (select status::text from public.guests where id='eeee0000-0000-0000-0000-000000000001'),
  'sent', 'التذكير لا يغيّر الحالة ولا يحرّر المقاعد المحجوزة');

-- (٤) مرة واحدة أبداً: إعادة الاستدعاء لا تعلّم أحداً
select pg_temp.assert_eq(public.reminder_due_count('cccc0000-0000-0000-0000-000000000001'), 0,
  'بعد الدفعة لا مؤهّل');
select pg_temp.assert_eq(
  (select count(*)::int from public.mark_reminders_sent('cccc0000-0000-0000-0000-000000000001')), 0,
  'الضغط مرّة ثانية لا يذكّر أحداً');

-- (٥) ولو تأخّر أكثر: يبقى غير مؤهّل
update public.guests set sent_at = now() - interval '40 days'
where id = 'eeee0000-0000-0000-0000-000000000001';
select pg_temp.assert_eq(public.reminder_due_count('cccc0000-0000-0000-0000-000000000001'), 0,
  'من ذُكِّر لا يعود مؤهّلاً مهما تأخّر');

rollback;
