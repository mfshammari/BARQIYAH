#!/usr/bin/env node
/**
 * يُكمل امتداد `.js` في الاستيرادات النسبية داخل .test-build.
 *
 * tsc بإعداد `moduleResolution: bundler` يترك الاستيراد كما كُتب
 * (`from './permissions'`)، وNode في وضع ESM يرفضه بلا امتداد. المصدر
 * يبقى نظيفاً للمُجمِّع، والاختبارات تعمل بلا لودر خاص.
 *   node scripts/fix-test-build.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.test-build';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const RE = /(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g;
let touched = 0;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const next = src.replace(RE, (m, a, spec, b) =>
    /\.[a-z]+$/i.test(spec) ? m : `${a}${spec}.js${b}`);
  if (next !== src) { writeFileSync(file, next); touched++; }
}

console.log(`✓ .test-build جاهز (${touched} ملف عُدّل)`);
