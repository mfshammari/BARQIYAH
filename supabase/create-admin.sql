-- ============================================================
-- برقية — إنشاء حساب أدمن جاهز (بريد + كلمة مرور) دفعةً واحدة
--
-- الصق هذا الملف كاملاً في Supabase → SQL Editor بعد تطبيق setup.sql.
-- غيّر البريد وكلمة المرور في السطرين أدناه فقط.
--
-- الملف آمن للتكرار: إن كان البريد موجوداً فسيُحدَّث دوره وكلمة مروره
-- بدل أن يفشل. وإن كان الحساب أُنشئ من صفحة التسجيل فسيُرقّى كما هو.
-- ============================================================

-- pgcrypto يسكن schema اسمه extensions في Supabase، وقد يكون في public محلياً
set search_path = public, extensions;

do $$
declare
  -- ————— عدّل هذين السطرين —————
  v_email    text := 'admin@barqiyah.sa';
  v_password text := 'Barqiyah#2026';
  v_name     text := 'مدير المنصة';
  -- ——————————————————————————————

  v_id  uuid;
  v_new boolean := false;
begin
  v_email := lower(trim(v_email));

  if v_password is null or length(v_password) < 8 then
    raise exception 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    v_new := true;

    -- أعمدة الرموز النصية تُترك فارغة لا NULL — GoTrue يتعثّر بالـ NULL
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('full_name', v_name),
      now(), now(),
      '', '', '', ''
    );
  else
    -- الحساب موجود: نضبط كلمة المرور ونؤكّد البريد فقط
    update auth.users
    set encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at         = now()
    where id = v_id;
  end if;

  -- صفّ identities شرط الدخول بالبريد وكلمة المرور. يُضمَن في الحالتين:
  -- الحساب الجديد، والحساب القديم الذي أُنشئ بلا صفّ (يُصلَح هنا).
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  -- الدور: مدير بكل الصلاحيات
  insert into public.profiles (id, role, full_name)
  values (v_id, 'admin_owner'::user_role, v_name)
  on conflict (id) do update
    set role      = 'admin_owner'::user_role,
        full_name = coalesce(profiles.full_name, excluded.full_name);

  raise notice '% حساب الأدمن: %  (الدور admin_owner)',
    case when v_new then 'أُنشئ' else 'حُدِّث' end, v_email;
end $$;

-- تحقّق: يجب أن يظهر صفّ واحد بدور admin_owner
select u.email,
       p.role::text                          as role,
       (u.email_confirmed_at is not null)     as email_confirmed,
       exists (
         select 1 from auth.identities i
         where i.user_id = u.id and i.provider = 'email'
       )                                      as can_login_with_password
from auth.users u
join public.profiles p on p.id = u.id
where p.role::text like 'admin%'
order by u.created_at;
