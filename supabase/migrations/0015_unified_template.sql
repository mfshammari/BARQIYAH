-- ============================================================
-- 0015 — القالب الموحّد: قالب واتساب واحد للمنصة كلها
--
--   تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}
--
-- {{1}} و{{2}} يكتبهما المالك والداعي كلٌّ لنفسه، و{{3}} يُحقن آلياً من
-- بيانات المناسبة. تُلغى مكتبة القوالب واختيارها وطلب القالب الخاص من
-- واجهات العميل نهائياً. اسم القالب في Meta وتصنيفه يحرّرهما الأدمن.
-- ============================================================

-- متغيّرات دعوة المالك {host, occasion} — كما للداعي في inviters.invite_vars
alter table public.events
  add column if not exists invite_vars jsonb not null default '{}'::jsonb;

comment on column public.events.invite_vars is
  'متغيّرا القالب الموحّد للمالك: {"host": …, "occasion": …}. الموعد يُحقن آلياً.';

alter table public.templates
  add column if not exists is_default boolean not null default false;

create unique index if not exists templates_single_default
  on public.templates(is_default) where is_default;

-- صف القالب الموحّد (مرة واحدة)
insert into public.templates
  (owner_id, name, body_text, status, whatsapp_category, meta_template_name, is_default)
select null, 'قالب برقية الموحّد', 'تتشرّف {{1}} بدعوتكم لحضور {{2}} — {{3}}',
       'approved', 'utility', 'barqiyah_invite', true
where not exists (select 1 from public.templates where is_default);

-- إخفاء بقية القوالب العامة عن العملاء (تبقى للتاريخ فقط)
update public.templates
   set status = 'draft'
 where is_default = false and owner_id is null and status::text = 'approved';
