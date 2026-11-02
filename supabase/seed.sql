-- ============================================================
-- برقية — بيانات تجريبية (seed)
--
-- الطريقة:
-- 1) أنشئ المستخدمين من Supabase Studio → Authentication → Add user
--    (أو عبر سكربت scripts/seed-users.mjs) بالبُرد التالية:
--      admin@barqiyah.sa    / Barqiyah#2026   → دور admin_owner
--      owner@barqiyah.sa    / Barqiyah#2026   → دور user (عميل)
--      scanner@barqiyah.sa  / Barqiyah#2026   → دور scanner
-- 2) شغّل هذا الملف في SQL Editor بعد supabase/setup.sql.
-- ============================================================

-- ضبط الأدوار (الـ trigger ينشئ الـ profile تلقائياً بدور user)
update public.profiles p set role = 'admin_owner', full_name = 'مدير المنصة'
  from auth.users u where u.id = p.id and u.email = 'admin@barqiyah.sa';
update public.profiles p set role = 'user',    full_name = 'محمد العبدالله', phone = '966555123456'
  from auth.users u where u.id = p.id and u.email = 'owner@barqiyah.sa';
update public.profiles p set role = 'scanner', full_name = 'ماسح البوابة الرئيسية'
  from auth.users u where u.id = p.id and u.email = 'scanner@barqiyah.sa';

-- ---------- الباقات: ٣ ثابتة + مخصّصة بثلاث شرائح ----------
insert into public.packages (name, kind, seats, price, active, description, features, is_featured, sort_order)
select v.name, 'fixed', v.seats, v.price, true, v.description, v.features, v.featured, v.sort_order
from (values
  ('أساسية', 100,  299.00, 'مثالية للمناسبات العائلية والقوائم الصغيرة.',
   array['إرسال عبر واتساب', 'باركود لكل مدعو', '٥ دعوات تجريبية مجانية'], false, 1),
  ('قياسية', 300,  699.00, 'الخيار الأنسب لأغلب حفلات الزفاف.',
   array['كل مزايا الباقة الأساسية', 'إدارة الدعاة وتوزيع القوائم', 'حسابات مسح متعددة للأبواب', 'تقارير حضورٍ لحظية'], true, 2),
  ('مميزة', 600, 1199.00, 'للحفلات الكبيرة والقوائم الطويلة.',
   array['كل مزايا الباقة القياسية', 'حدٌّ أعلى للدعاة والماسحين', 'دعمٌ مخصّص طوال المناسبة'], false, 3)
) as v(name, seats, price, description, features, featured, sort_order)
where not exists (select 1 from public.packages p where p.name = v.name);

-- الباقة المخصّصة الواحدة: ١٠٠٠→١٫٥ · ٣٠٠٠→١٫٢ · ٧٠٠٠→١٫٠ (تسعير تراكمي)
insert into public.packages (name, kind, seats, price, active, description, features, min_qty, sort_order)
select 'مخصّصة', 'custom', 1000, 0, true,
       'للقوائم الكبيرة — سعر الدعوة ينخفض كلما زاد العدد.',
       array['كل مزايا الباقة المميزة', 'مدير حساب مخصّص'], 1000, 9
where not exists (select 1 from public.packages where kind = 'custom');

select public.set_package_tiers(
  (select id from public.packages where kind = 'custom'),
  1000,
  '[{"min_qty":1000,"unit_price":1.5},{"min_qty":3000,"unit_price":1.2},{"min_qty":7000,"unit_price":1.0}]'::jsonb
);

-- ---------- القالب الموحّد فقط (يُدرجه الترحيل 0015، ونضمنه هنا) ----------
insert into public.templates
  (owner_id, name, body_text, status, whatsapp_category, meta_template_name, is_default)
select null, 'قالب برقية الموحّد', 'تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}',
       'approved', 'utility', 'barqiyah_invite', true
where not exists (select 1 from public.templates where is_default);

-- ---------- مناسبة تجريبية كاملة ----------
do $$
declare
  v_owner   uuid;
  v_pkg     uuid;
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

  select id into v_pkg from public.packages where kind = 'fixed' and seats = 300 limit 1;

  select id into v_event from public.events where owner_id = v_owner and host_name = 'أسرة العبدالله' limit 1;
  if v_event is null then
    insert into public.events (owner_id, package_id, occasion_type, event_date, event_date_hijri, event_weekday,
                               event_time, venue, internal_name, host_name, celebrant_primary, celebrant_secondary,
                               buyer_name, buyer_phone, invite_vars, image_mode, seats_quota, status, activated_at)
    values (v_owner, v_pkg, 'wedding', current_date + 30, null, null,
            '21:00', 'قصر ٣٣ للاحتفالات', 'زواج خالد', 'أسرة العبدالله', 'خالد', 'نورة',
            'محمد العبدالله', '966555123456',
            '{"host":"أسرة العبدالله","occasion":"حفل زواج خالد ونورة"}'::jsonb,
            'generated', 300, 'active', now())
    returning id into v_event;
  end if;

  -- الدعاة (بلا تكرار عند إعادة تشغيل الملف) — كلٌّ بمتغيّريه في القالب الموحّد
  select id into v_inv_own from public.inviters where event_id = v_event and role_label = 'المالك';
  if v_inv_own is null then
    insert into public.inviters (event_id, profile_id, name, phone, role_label, seats_quota, invite_vars)
    values (v_event, v_owner, 'محمد العبدالله', '966555123456', 'المالك', 0,
            '{"host":"أسرة العبدالله","occasion":"حفل زواج خالد ونورة"}'::jsonb)
    returning id into v_inv_own;
  end if;

  select id into v_inv_2 from public.inviters where event_id = v_event and name = 'أحمد العبدالله';
  if v_inv_2 is null then
    insert into public.inviters (event_id, name, phone, role_label, side_label, seats_quota, invite_vars)
    values (v_event, 'أحمد العبدالله', '966551000100', 'داعٍ', 'أهل العريس', 80,
            '{"host":"أحمد العبدالله","occasion":"زواج ابن أخي خالد"}'::jsonb)
    returning id into v_inv_2;
  end if;

  select id into v_inv_3 from public.inviters where event_id = v_event and name = 'أم نورة';
  if v_inv_3 is null then
    insert into public.inviters (event_id, name, phone, role_label, side_label, seats_quota, invite_vars)
    values (v_event, 'أم نورة', '966551000200', 'داعٍ', 'أهل العروس', 60, '{}'::jsonb)
    returning id into v_inv_3;
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

  -- سجل الشراء (السعر مجمّد لحظة الشراء)
  insert into public.transactions (event_id, package_id, amount, type, status, method, seats_added, paid_at, note)
  select v_event, v_pkg, 699.00, 'purchase', 'paid', 'gateway', 300, now(), 'بيانات تجريبية'
  where not exists (select 1 from public.transactions where event_id = v_event);

  -- مناسبة ثانية غير مدفوعة لتجربة الدعوات التجريبية الخمس
  if not exists (select 1 from public.events where owner_id = v_owner and host_name = 'أبو سارة') then
    insert into public.events (owner_id, occasion_type, event_date, event_time, venue, internal_name,
                               host_name, celebrant_primary, invite_vars, image_mode, seats_quota, status)
    values (v_owner, 'graduation', current_date + 45, '19:30', 'فندق الفيصلية', 'تخرّج سارة',
            'أبو سارة', 'سارة', '{"host":"أبو سارة","occasion":"حفل تخرّج ابنتي سارة"}'::jsonb,
            'generated', 0, 'unpaid');
  end if;
end $$;

-- ---------- إعدادات التكامل (فارغة = وضع المحاكاة) ----------
insert into public.integration_settings (verify_token, reminder_template)
values ('barqiyah-verify-token', 'barqiyah_reminder')
on conflict (singleton) do update set reminder_template = coalesce(public.integration_settings.reminder_template, excluded.reminder_template);
