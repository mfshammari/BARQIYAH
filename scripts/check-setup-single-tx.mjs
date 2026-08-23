#!/usr/bin/env node
/**
 * يمنع تكرار خطأ 55P04.
 *
 * محرر SQL في Supabase ينفّذ الملف الملصوق كمعاملة واحدة، وPostgres
 * يمنع استخدام قيمة enum أُضيفت في نفس المعاملة. فحص ثابت يكشف كل
 * قيمة enum جديدة تُستخدم في نفس الملف المجمّع دون تحويلها إلى نص.
 *
 *   node scripts/check-setup-single-tx.mjs
 */
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/setup.sql', 'utf8');

// القيم المضافة إلى أنواع قائمة عبر ALTER TYPE ... ADD VALUE
const added = new Map();          // القيمة → النوع
for (const m of sql.matchAll(/alter\s+type\s+(\w+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'/gi)) {
  added.set(m[2], m[1]);
}

if (added.size === 0) {
  console.log('✓ لا توجد قيم enum مضافة — لا خطر.');
  process.exit(0);
}

const problems = [];
const lines = sql.split('\n');

/**
 * أجسام دوال plpgsql لا تُحلَّل عند الإنشاء، فاستخدام قيمة enum جديدة
 * داخلها لا يفشل — التنفيذ يقع في معاملة لاحقة. أما دوال language sql
 * والسياسات والقيود فتُحلَّل فوراً، وهي وحدها الخطرة.
 */
let inPlpgsqlBody = false;
let recentLanguage = '';

lines.forEach((line, i) => {
  const trimmed = line.trim();

  const lang = /language\s+(plpgsql|sql)\b/i.exec(trimmed);
  if (lang) recentLanguage = lang[1].toLowerCase();

  // بداية جسم الدالة أو نهايته
  if (/\$\$/.test(trimmed)) {
    const markers = (trimmed.match(/\$\$/g) ?? []).length;
    if (markers % 2 === 1) {
      if (!inPlpgsqlBody && recentLanguage === 'plpgsql') inPlpgsqlBody = true;
      else if (inPlpgsqlBody) { inPlpgsqlBody = false; recentLanguage = ''; }
    }
  }

  if (inPlpgsqlBody) return;
  if (trimmed.startsWith('--')) return;
  // سطر الإضافة نفسه ليس استخداماً
  if (/alter\s+type\s+\w+\s+add\s+value/i.test(trimmed)) return;
  // تعريف نوع جديد ليس استخداماً لقيمة مضافة لنوع قائم
  if (/create\s+type\s+\w+\s+as\s+enum/i.test(trimmed)) return;

  for (const [value, type] of added) {
    // استخدام القيمة كنص حرفي
    const re = new RegExp(`'${value}'`);
    if (!re.test(trimmed)) continue;

    // آمن إن قورن كنص صراحةً (::text) في نفس السطر
    if (/::text/.test(trimmed)) continue;
    // آمن داخل دالة plpgsql (لا تُحلَّل عند الإنشاء) — نتحقق تقريبياً
    problems.push({ line: i + 1, value, type, text: trimmed.slice(0, 100) });
  }
});

if (problems.length > 0) {
  console.error('✗ استخدام غير آمن لقيم enum جديدة في نفس المعاملة (سيفشل بـ 55P04):\n');
  for (const p of problems) {
    console.error(`  سطر ${p.line}: القيمة '${p.value}' من النوع ${p.type}`);
    console.error(`    ${p.text}`);
    console.error(`    الحل: قارن كنص — العمود::text = '${p.value}'\n`);
  }
  process.exit(1);
}

console.log(`✓ ${added.size} قيمة enum مضافة، وكلها مستخدمة بأمان (مقارنة نصية).`);
