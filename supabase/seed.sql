-- ============================================================
-- برقية — بيانات تجريبية (seed)
--
-- الطريقة:
-- 1) أنشئ المستخدمين من Supabase Studio → Authentication → Add user
--    (أو عبر سكربت scripts/seed-users.mjs) بالبُرد التالية:
--      admin@barqiyah.sa    / Barqiyah#2026   → دور admin
--      owner@barqiyah.sa    / Barqiyah#2026   → دور owner
--      scanner@barqiyah.sa  / Barqiyah#2026   → دور scanner
-- 2) شغّل هذا الملف في SQL Editor.
-- ============================================================

-- ضبط الأدوار (الـ trigger ينشئ الـ profile تلقائياً بدور owner)
update public.profiles p set role = 'admin',   full_name = 'مدير المنصة'
  from auth.users u where u.id = p.id and u.email = 'admin@barqiyah.sa';
update public.profiles p set role = 'owner',   full_name = 'محمد العبدالله', phone = '0555123456'
  from auth.users u where u.id = p.id and u.email = 'owner@barqiyah.sa';
update public.profiles p set role = 'scanner', full_name = 'ماسح البوابة الرئيسية'
  from auth.users u where u.id = p.id and u.email = 'scanner@barqiyah.sa';

-- ---------- الباقات ----------
insert into public.packages (name, seats, price, active)
select v.name, v.seats, v.price, true
from (values
  ('باقة ١٠٠ مقعد', 100,  499.00),
  ('باقة ٣٠٠ مقعد', 300, 1299.00),
  ('باقة ٥٠٠ مقعد', 500, 1999.00),
  ('باقة ١٠٠٠ مقعد', 1000, 3499.00)
) as v(name, seats, price)
where not exists (select 1 from public.packages p where p.name = v.name);

-- ---------- القوالب العامة (يبنيها الأدمن) ----------
insert into public.templates (owner_id, name, body_text, status, whatsapp_category, meta_template_name)
select null, v.name, v.body, 'approved'::template_status, v.cat::whatsapp_category, v.meta
from (values
  ('كلاسيكي — ذهبي',
   'يسرّ {{1}} دعوتكم لحضور حفل زواج {{2}}، وذلك يوم {{3}} في {{4}}. حضوركم شرف لنا.',
   'utility', 'barqiyah_invite_classic'),
  ('بسيط — أبيض',
   'بدعوة من {{1}}: نتشرّف بحضوركم مناسبة {{2}} يوم {{3}} — {{4}}.',
   'utility', 'barqiyah_invite_simple'),
  ('مودرن — رمادي',
   '{{1}} تدعوكم لمشاركتهم فرحة {{2}} — {{3}} — {{4}}.',
   'marketing', 'barqiyah_invite_modern')
) as v(name, body, cat, meta)
where not exists (
  select 1 from public.templates t where t.owner_id is null and t.name = v.name
);

-- ---------- مناسبة تجريبية كاملة ----------
do $$
declare
  v_owner   uuid;
  v_pkg     uuid;
  v_tpl     uuid;
  v_event   uuid;
  v_inv_own uuid;
  v_inv_2   uuid;
  v_inv_3   uuid;
  v_scanner uuid;
begin
  select id into v_owner from public.profiles p
    where exists (select 1 from auth.users u where u.id = p.id and u.email = 'owner@barqiyah.sa');
  if v_owner is null then
    raise notice 'تخطّي البيانات التجريبية: مستخدم owner@barqiyah.sa غير موجود';
    return;
  end if;

  select id into v_pkg from public.packages where seats = 300 limit 1;
  select id into v_tpl from public.templates where owner_id is null and status = 'approved' limit 1;

  select id into v_event from public.events where owner_id = v_owner and host_name = 'أسرة العبدالله' limit 1;
  if v_event is null then
    insert into public.events (owner_id, package_id, occasion_type, event_date, host_name,
                               buyer_name, buyer_phone, template_id, seats_quota, status)
    values (v_owner, v_pkg, 'wedding', current_date + 30, 'أسرة العبدالله',
            'محمد العبدالله', '0555123456', v_tpl, 300, 'active')
    returning id into v_event;
  end if;

  -- الدعاة (بلا تكرار عند إعادة تشغيل الملف)
  select id into v_inv_own from public.inviters where event_id = v_event and name = 'محمد العبدالله';
  if v_inv_own is null then
    insert into public.inviters (event_id, name, role_label)
    values (v_event, 'محمد العبدالله', 'المالك') returning id into v_inv_own;
  end if;

  select id into v_inv_2 from public.inviters where event_id = v_event and name = 'أحمد العبدالله';
  if v_inv_2 is null then
    insert into public.inviters (event_id, name, role_label)
    values (v_event, 'أحمد العبدالله', 'داعٍ') returning id into v_inv_2;
  end if;

  select id into v_inv_3 from public.inviters where event_id = v_event and name = 'سعد العبدالله';
  if v_inv_3 is null then
    insert into public.inviters (event_id, name, role_label)
    values (v_event, 'سعد العبدالله', 'داعٍ') returning id into v_inv_3;
  end if;

  insert into public.guests (event_id, inviter_id, name, phone, max_seats, confirmed_seats, status, qr_token, scans_used, sent_at, responded_at)
  values
    (v_event, v_inv_own, 'خالد الفهد',       '966551000001', 4, 2,    'accepted', gen_random_uuid(), 0, now() - interval '3 days', now() - interval '2 days'),
    (v_event, v_inv_2,   'نايف السالم',      '966551000002', 2, 1,    'attended', gen_random_uuid(), 1, now() - interval '3 days', now() - interval '2 days'),
    (v_event, v_inv_own, 'فيصل المطيري',     '966551000003', 7, null, 'sent',     null,              0, now() - interval '1 day',  null),
    (v_event, v_inv_3,   'عبدالله القحطاني', '966551000004', 3, null, 'declined', null,              0, now() - interval '3 days', now() - interval '2 days'),
    (v_event, v_inv_own, 'منصور العنزي',     '966551000006', 6, null, 'expired',  null,              0, now() - interval '9 days', null),
    (v_event, v_inv_2,   'تركي الدوسري',     '966551000005', 5, null, 'draft',    null,              0, null, null)
  on conflict (event_id, phone) do nothing;

  -- ربط حساب الماسح بالمناسبة
  select id into v_scanner from public.profiles p
    where exists (select 1 from auth.users u where u.id = p.id and u.email = 'scanner@barqiyah.sa');
  if v_scanner is not null then
    insert into public.scanners (event_id, profile_id, label)
    values (v_event, v_scanner, 'البوابة الرئيسية')
    on conflict (event_id, profile_id) do nothing;
  end if;

  -- سجل التفعيل اليدوي
  insert into public.transactions (event_id, package_id, amount, type, status, seats_added, note)
  select v_event, v_pkg, 1299.00, 'manual_activation', 'paid', 300, 'تفعيل يدوي — بيانات تجريبية'
  where not exists (select 1 from public.transactions where event_id = v_event);
end $$;

-- ---------- طلب قالب خاص قيد المراجعة ----------
insert into public.templates (owner_id, name, body_text, status, whatsapp_category)
select p.id, 'قالب خاص — أسرة العبدالله',
       'بكل الحب ندعوكم {{1}} لحضور زواج {{2}}.',
       'under_review', 'utility'
from public.profiles p
join auth.users u on u.id = p.id and u.email = 'owner@barqiyah.sa'
where not exists (select 1 from public.templates where owner_id = p.id)
limit 1;

-- ---------- إعدادات التكامل (فارغة = وضع المحاكاة) ----------
insert into public.integration_settings (verify_token) values ('barqiyah-verify-token')
on conflict (singleton) do nothing;
