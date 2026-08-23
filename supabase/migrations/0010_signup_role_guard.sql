-- ============================================================
-- 0010 — سدّ ثغرة رفع الصلاحية عند التسجيل
--
-- كان handle_new_user يقرأ الدور من raw_user_meta_data، وهي بيانات
-- يرسلها العميل مباشرةً إلى Supabase Auth بالمفتاح العام. أي شخص
-- يستطيع استدعاء signUp بـ role='admin_owner' فيُنشأ له حساب أدمن.
--
-- الآن: كل حساب جديد يُنشأ بدور 'user' مهما أرسل العميل. رفع الدور
-- يتم من قاعدة البيانات (محرّر SQL) أو من أدمن قائم عبر لوحة الفريق.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- الدور لا يُقرأ من بيانات العميل إطلاقاً (ثغرة رفع صلاحية)
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    'user',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- ترقية حساب قائم إلى دور إداري — تُستدعى من محرّر SQL وحده.
--
-- تُمنع من الويب: تتحقق أن المستدعي إما بلا جلسة (محرّر SQL /
-- مفتاح الخدمة) أو أدمن يملك صلاحية إدارة الفريق.
--
-- مثال:  select public.grant_admin('you@example.com', 'admin_owner');
-- ------------------------------------------------------------
create or replace function public.grant_admin(
  p_email text,
  -- الافتراضي يُحسم في الجسم لا في التوقيع: قيم enum الجديدة لا تُستعمل
  -- في نفس المعاملة التي أضافتها (خطأ 55P04)
  p_role  text default null
)
returns table (out_email text, out_role text, out_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'admin_owner');
begin
  if v_role not in ('admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance') then
    raise exception 'INVALID_ROLE'
      using hint = 'الأدوار المتاحة: admin_owner, admin_support, admin_reviewer, admin_finance';
  end if;

  -- من الويب: لا يرقّي إلا أدمن يملك إدارة الفريق. من محرّر SQL: مسموح.
  if auth.uid() is not null and not public.has_permission('manage_team') then
    raise exception 'FORBIDDEN'
      using hint = 'ترقية الأدوار من صلاحية مدير المنصة وحده.';
  end if;

  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'USER_NOT_FOUND'
      using hint = 'سجّل الحساب أولاً من صفحة إنشاء حساب، ثم أعد تنفيذ هذا الأمر.';
  end if;

  -- الحساب قد يكون بلا صف في profiles إن لم يعمل المُشغِّل وقتها
  insert into public.profiles (id, role)
  values (v_id, v_role::user_role)
  on conflict (id) do update set role = excluded.role;

  return query
  select trim(p_email), v_role, v_id;
end;
$$;

revoke all on function public.grant_admin(text, text) from public, anon;
grant execute on function public.grant_admin(text, text) to authenticated, service_role;
