#!/usr/bin/env node
/**
 * إنشاء مستخدمي التجربة الثلاثة في Supabase Auth (أدمن / صاحب مناسبة / ماسح).
 *
 *   node scripts/seed-users.mjs
 *
 * يقرأ NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY من البيئة
 * أو من ملف .env.local في جذر المشروع. بعد تشغيله، شغّل supabase/seed.sql.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* الملف غير موجود — نكتفي بمتغيّرات البيئة */
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('✗ يلزم ضبط NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD ?? 'Barqiyah#2026';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@barqiyah.sa';

const USERS = [
  { email: ADMIN_EMAIL, role: 'admin_owner', full_name: 'مدير المنصة' },
  { email: 'owner@barqiyah.sa',   role: 'owner',   full_name: 'محمد العبدالله', phone: '0555123456' },
  { email: 'scanner@barqiyah.sa', role: 'scanner', full_name: 'ماسح البوابة الرئيسية' },
];

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const user of USERS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: PASSWORD,
    email_confirm: true,
    // الدور لا يُمرَّر في بيانات المستخدم — المُشغِّل يتجاهله عمداً (منع رفع الصلاحية)
    user_metadata: { full_name: user.full_name, phone: user.phone ?? null },
  });

  let id = data?.user?.id;

  if (error) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users.find((u) => u.email?.toLowerCase() === user.email);
    if (!found) {
      console.error(`✗ ${user.email}: ${error.message}`);
      continue;
    }
    id = found.id;
    console.log(`• ${user.email} موجود مسبقاً — سيُحدَّث دوره فقط`);
  } else {
    console.log(`✓ أُنشئ ${user.email}`);
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id, role: user.role, full_name: user.full_name, phone: user.phone ?? null }, { onConflict: 'id' });

  if (profileError) console.error(`  ✗ تعذّر ضبط الدور: ${profileError.message}`);
  else console.log(`  ✓ الدور: ${user.role}`);
}

console.log(`\nكلمة المرور للجميع: ${PASSWORD}`);
console.log(`حساب الأدمن: ${ADMIN_EMAIL} — الدور admin_owner (كل الصلاحيات).`);
console.log('الخطوة التالية: شغّل supabase/seed.sql في SQL Editor لإنشاء البيانات التجريبية.');
