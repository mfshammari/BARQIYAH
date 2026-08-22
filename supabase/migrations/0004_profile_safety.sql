-- ============================================================
-- برقية — حماية الأدوار وشبكة أمان لإنشاء الملف الشخصي
--
-- المسار الأساسي هو تريغر on_auth_user_created على auth.users.
-- لكن إن تعذّر إنشاء التريغر (صلاحيات المشروع)، أو أُنشئ مستخدم
-- بطريقة أخرى، يبقى المستخدم بلا profile فيتعذّر عليه الدخول نهائياً.
-- هذا الملف يفتح مساراً بديلاً آمناً.
-- ============================================================

-- يسمح للمستخدم بإنشاء ملفه الشخصي هو فقط، وبدور owner حصراً
-- (فلا يستطيع أحد ترقية نفسه إلى admin أو scanner من هنا).
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'owner');

/**
 * تُستدعى بعد تسجيل الدخول: تُعيد ملف المستخدم، وتُنشئه بدور owner
 * إن لم يكن موجوداً. لا تلمس ملفاً قائماً، فلا تُغيّر دور أحد.
 */
create or replace function public.ensure_profile(p_full_name text default null)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if found then
    return v_profile;
  end if;

  insert into public.profiles (id, role, full_name)
  values (auth.uid(), 'owner', p_full_name)
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

revoke all on function public.ensure_profile(text) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated, service_role;


-- ============================================================
-- منع ترقية الصلاحيات (privilege escalation)
--
-- سياسة profiles_update_self تسمح للمستخدم بتعديل صفّه هو، لكن RLS
-- لا تستطيع تقييد عمود بعينه — فكان بإمكان أي مستخدم مسجّل تنفيذ:
--     update profiles set role = 'admin' where id = auth.uid();
-- ويصبح أدمن على المنصة كلها. هذا التريغر يسدّ الثغرة.
-- ============================================================

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- كود الخادم الموثوق (service role) لا يمرّ بجلسة مستخدم:
  -- إنشاء حسابات الماسحين يحتاج ضبط الدور، فيُسمح له.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN'
      using hint = 'تغيير الدور من صلاحية الأدمن وحده.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();
