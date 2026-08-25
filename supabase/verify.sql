-- ============================================================
-- برقية — تحقّق من أن كل الترحيلات طُبِّقت على قاعدتك
--
-- الصقه في Supabase → SQL Editor ونفّذه. لا يغيّر شيئاً — يقرأ فقط.
-- يرجع صفّاً لكل ترحيل: ✓ مطبَّق أو ✗ ناقص، وسطراً أخيراً بالخلاصة.
--
-- إن ظهر أي ✗ فالحل واحد: الصق supabase/setup.sql كاملاً ثم أعد
-- تنفيذ هذا الملف. setup.sql آمن للتكرار ولا يُتلف بياناتك.
-- ============================================================

with checks(ord, migration, proves, ok) as (
  values
    (1, '0001_init', 'الجداول العشرة ومُشغِّل إنشاء الحساب',
      to_regclass('public.events')   is not null
      and to_regclass('public.guests')   is not null
      and to_regclass('public.inviters') is not null
      and exists (select 1 from pg_trigger where tgname = 'on_auth_user_created')),

    (2, '0002_rls', 'حماية الصفوف على كل جدول',
      (select count(*) = 0 from pg_tables t
        where t.schemaname = 'public'
          and t.tablename in ('profiles','packages','templates','events','inviters',
                              'guests','scanners','integration_settings','transactions','message_logs')
          and not t.rowsecurity)
      and to_regproc('public.is_admin') is not null),

    (3, '0003_functions', 'الرصيد والحجز والردّ والمسح',
      to_regproc('public.event_balance')          is not null
      and to_regproc('public.reserve_seats_for_send') is not null
      and to_regproc('public.rsvp_accept')            is not null
      and to_regproc('public.scan_qr')                is not null),

    (4, '0004_profile_safety', 'حاجز تغيير الدور من الويب',
      to_regproc('public.ensure_profile') is not null
      and exists (select 1 from pg_trigger where tgname = 'profiles_guard_role')),

    (5, '0005_v2_schema', 'أدوار الإدارة ودفتر العناوين وحقول المناسبة',
      exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
               where t.typname = 'user_role' and e.enumlabel = 'admin_owner')
      and to_regclass('public.contacts') is not null
      and exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='events'
                     and column_name='internal_name')),

    (6, '0006_v2_rls', 'عزل الداعي ومصفوفة الصلاحيات',
      to_regproc('public.has_permission') is not null
      and to_regproc('public.my_inviter_id') is not null),

    (7, '0007_inviter_balance', 'رصيد الداعي وحجزه داخل حصته',
      to_regproc('public.inviter_balance') is not null
      and to_regproc('public.reserve_seats_for_inviter') is not null),

    (8, '0008_payments', 'الدفع والتفعيل التلقائي',
      to_regproc('public.create_pending_payment') is not null
      and to_regproc('public.activate_event_from_payment') is not null),

    (9, '0009_support', 'تذاكر الدعم وصفحة الرؤى',
      to_regclass('public.support_tickets') is not null
      and to_regproc('public.platform_insights') is not null),

    (10, '0010_signup_role_guard', 'منع رفع الصلاحية عند التسجيل + grant_admin',
      to_regproc('public.grant_admin') is not null
      and exists (select 1 from pg_proc
                   where proname = 'handle_new_user'
                     and prosrc not like '%raw_user_meta_data ->> ''role''%')),

    (11, '0011_owner_not_inviter', 'المالك لا يُحسب داعياً في مناسبته',
      exists (select 1 from pg_indexes
               where schemaname='public' and indexname='inviters_event_profile_key')
      and to_regproc('public.guard_owner_inviter_claim') is not null)
)
select
  case when ok then '✓' else '✗' end as "حالة",
  migration                          as "الترحيل",
  proves                             as "ما يثبته",
  case when ok then 'مطبَّق' else 'ناقص' end as "النتيجة"
from checks
order by ord;

-- الخلاصة
with checks(ok) as (
  values
    (to_regclass('public.events') is not null
      and exists (select 1 from pg_trigger where tgname = 'on_auth_user_created')),
    ((select count(*) = 0 from pg_tables t
       where t.schemaname='public'
         and t.tablename in ('profiles','packages','templates','events','inviters',
                             'guests','scanners','integration_settings','transactions','message_logs')
         and not t.rowsecurity)
      and to_regproc('public.is_admin') is not null),
    (to_regproc('public.event_balance') is not null
      and to_regproc('public.reserve_seats_for_send') is not null
      and to_regproc('public.rsvp_accept') is not null
      and to_regproc('public.scan_qr') is not null),
    (to_regproc('public.ensure_profile') is not null
      and exists (select 1 from pg_trigger where tgname='profiles_guard_role')),
    (exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
              where t.typname='user_role' and e.enumlabel='admin_owner')
      and to_regclass('public.contacts') is not null),
    (to_regproc('public.has_permission') is not null
      and to_regproc('public.my_inviter_id') is not null),
    (to_regproc('public.inviter_balance') is not null
      and to_regproc('public.reserve_seats_for_inviter') is not null),
    (to_regproc('public.create_pending_payment') is not null
      and to_regproc('public.activate_event_from_payment') is not null),
    (to_regclass('public.support_tickets') is not null
      and to_regproc('public.platform_insights') is not null),
    (to_regproc('public.grant_admin') is not null
      and exists (select 1 from pg_proc where proname='handle_new_user'
                   and prosrc not like '%raw_user_meta_data ->> ''role''%')),
    (exists (select 1 from pg_indexes
              where schemaname='public' and indexname='inviters_event_profile_key')
      and to_regproc('public.guard_owner_inviter_claim') is not null)
)
select
  count(*) filter (where ok) || ' من ' || count(*) || ' ترحيل مطبَّق'
    as "الخلاصة",
  case when count(*) filter (where not ok) = 0
       then 'قاعدتك محدَّثة بالكامل ✓'
       else 'الصق supabase/setup.sql كاملاً ثم أعد تنفيذ هذا الملف'
  end as "الخطوة التالية"
from checks;

-- حسابات الإدارة الموجودة الآن (إن لم يظهر شيء فلا يوجد أدمن بعد)
select u.email                              as "بريد الأدمن",
       p.role::text                         as "الدور",
       (u.email_confirmed_at is not null)    as "البريد مؤكَّد",
       exists (select 1 from auth.identities i
                where i.user_id = u.id and i.provider = 'email')
                                            as "يستطيع الدخول بكلمة مرور"
from public.profiles p
join auth.users u on u.id = p.id
where p.role::text like 'admin%'
order by u.created_at;
