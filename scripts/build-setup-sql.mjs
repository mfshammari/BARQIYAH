#!/usr/bin/env node
/**
 * يبني supabase/setup.sql من ملفات الترحيل بالترتيب،
 * ليُلصق مرة واحدة في SQL Editor بدل تشغيل كل ملف على حدة.
 *   node scripts/build-setup-sql.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const header = `-- ============================================================
-- برقية — الإعداد الكامل لقاعدة البيانات في ملف واحد
--
-- مولّد آلياً من supabase/migrations — لا تعدّله يدوياً.
-- لإعادة توليده: node scripts/build-setup-sql.mjs
--
-- الاستخدام: انسخ هذا الملف كاملاً والصقه في
-- Supabase Studio ← SQL Editor ← New query ← Run
--
-- الملف آمن لإعادة التشغيل: يمكن تنفيذه أكثر من مرة دون ضرر.
-- ============================================================

`;

const body = files
  .map((f) => {
    const sep = `\n\n-- ${'='.repeat(58)}\n-- ملف: ${f}\n-- ${'='.repeat(58)}\n\n`;
    return sep + readFileSync(join(DIR, f), 'utf8').trim() + '\n';
  })
  .join('');

const footer = `

-- ============================================================
-- تم. الخطوة التالية:
--   ١) أنشئ مستخدماً من Authentication ← Add user
--   ٢) اجعله أدمن:
--        update public.profiles p set role = 'admin'
--        from auth.users u
--        where u.id = p.id and u.email = 'البريد-هنا';
--   ٣) (اختياري) شغّل supabase/seed.sql للبيانات التجريبية
-- ============================================================
`;

writeFileSync('supabase/setup.sql', header + body.trimStart() + footer);
console.log(`✓ تم توليد supabase/setup.sql من ${files.length} ملفات:`);
files.forEach((f) => console.log(`  · ${f}`));
