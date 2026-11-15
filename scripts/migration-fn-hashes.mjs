#!/usr/bin/env node
/**
 * يتحقّق أن أجسام الدوال في القاعدة مطابقة لملفات الترحيل حرفياً.
 *
 * يستخرج جسم كل دالة ($$…$$) من ملفات الترحيل ويطبع md5 له، لتُقارن
 * بناتج هذا الاستعلام على القاعدة:
 *   select proname, md5(prosrc) from pg_proc p
 *   join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
 * أي اختلاف = خطأ نقل عند لصق SQL — يُعاد تطبيق الملف.
 *
 *   node scripts/migration-fn-hashes.mjs supabase/migrations/0014_*.sql …
 *   node scripts/migration-fn-hashes.mjs            # كل الترحيلات (الأحدث يغلب)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIR = 'supabase/migrations';
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => join(DIR, f));

const hashes = new Map();
for (const file of files) {
  const sql = readFileSync(file, 'utf8');
  const re = /create or replace function public\.(\w+)\s*\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g;
  for (const m of sql.matchAll(re)) {
    hashes.set(m[1], createHash('md5').update(m[2]).digest('hex'));
  }
}

for (const [name, h] of [...hashes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${name.padEnd(32)} ${h}`);
}
console.error(`\n${hashes.size} دالة من ${files.length} ملف.`);
