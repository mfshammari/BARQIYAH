-- ============================================================
-- 0016 — صورة الدعوة: تُولَّد تلقائياً أو يرفعها المستخدم
--
-- image_mode على events وinviters: 'generated' (افتراضي — بطاقة برقية
-- الخضراء الذهبية من بيانات الدعوة) أو 'uploaded' (صورة المستخدم).
-- image_url يبقى: للمرفوعة مسار الملف في Storage، وللمولَّدة null.
-- لا حقل «رابط صورة» في أي مكان.
-- ============================================================

alter table public.events
  add column if not exists image_mode text not null default 'generated';
alter table public.inviters
  add column if not exists image_mode text not null default 'generated';

do $$ begin
  alter table public.events
    add constraint events_image_mode_check check (image_mode in ('generated', 'uploaded'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inviters
    add constraint inviters_image_mode_check check (image_mode in ('generated', 'uploaded'));
exception when duplicate_object then null; end $$;

-- الصور القديمة بروابط نصّية تبقى مرفوعة (رابط كامل) حتى يعيد المستخدم اختياره
update public.events   set image_mode = 'uploaded' where image_url is not null and image_mode = 'generated';
update public.inviters set image_mode = 'uploaded' where image_url is not null and image_mode = 'generated';

-- ---------- Storage: bucket عام للقراءة ----------
-- الحجم ≤ ٥ MB، الأنواع jpeg/png/webp. المسار {auth.uid()}/{eventId|inviterId}/{timestamp}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invite-images', 'invite-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- القراءة للجميع (واتساب يجلب الصورة برابط عام)
drop policy if exists invite_images_read on storage.objects;
create policy invite_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'invite-images');

-- الكتابة للمصادق على مساره {auth.uid()}/… فقط
drop policy if exists invite_images_insert on storage.objects;
create policy invite_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'invite-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists invite_images_update on storage.objects;
create policy invite_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'invite-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'invite-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists invite_images_delete on storage.objects;
create policy invite_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'invite-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
