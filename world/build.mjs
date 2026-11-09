// 把 RL-data 原样打包成一个快照文件（无损：原始 JSON 全文保留，不做任何压缩或摘要）。
// 用法: node world/build.mjs ../rl-data
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const src = process.argv[2] || '../rl-data';
const dataDir = path.join(src, 'data');
if (!fs.existsSync(dataDir)) { console.error('找不到 ' + dataDir); process.exit(1); }

const files = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) {
      const rel = path.relative(dataDir, p).split(path.sep).join('/');
      const text = fs.readFileSync(p, 'utf8');
      try { files[rel] = JSON.parse(text); }
      catch (err) { console.error('解析失败 ' + rel + '：' + err.message); process.exit(1); }
    }
  }
})(dataDir);

import {execSync} from 'node:child_process';
let head = '';
try { head = execSync('git -C ' + src + ' rev-parse HEAD').toString().trim(); } catch (e) {}

const snap = {
  meta: {
    source: 'rl-data/data',
    generatedAt: new Date().toISOString(),
    commit: head || null,
    fileCount: Object.keys(files).length,
    note: '原始 JSON 全文无损保留。认知关系层不存在这个文件里，另存于 cognition 存储。'
  },
  files
};
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'snapshot.json');
fs.writeFileSync(out, JSON.stringify(snap));
const bytes = fs.statSync(out).size;
console.log('写出 ' + out + '（' + Object.keys(files).length + ' 个文件，' + (bytes / 1024).toFixed(0) + ' KB）');
for (const k of Object.keys(files).sort()) {
  const t = JSON.stringify(files[k]);
  console.log('  ' + k.padEnd(34) + (t.length + '').padStart(8) + ' bytes  sha1:' + crypto.createHash('sha1').update(t).digest('hex').slice(0, 8));
}
