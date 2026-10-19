#!/usr/bin/env node
'use strict';
/* 把 prompts/common.md + prompts/<台>.md 拼成每个台的规矩，写到 styles/radio_<台>.md。

   node scripts/build-styles.cjs                      # 拼故事 / 夜話 / 音樂；枕話没补亲密规矩就跳过，并提醒你
   node scripts/build-styles.cjs --intimate my.md     # 连枕話一起拼（my.md 是你自己写的亲密规矩）

   每份规矩里单独一行 --- 下面那一句是「锚点」：宿主把全文放在会话开头一次，之后每一段只带这一句。
   prompts/ 里的 <!-- … --> 是写给人看的说明，拼的时候去掉。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROMPTS = path.join(ROOT, 'prompts');
const OUT = path.join(ROOT, 'styles');
const argv = process.argv.slice(2);
const at = argv.indexOf('--intimate');
const intimateFile = at >= 0 ? argv[at + 1] : null;

const SEP = /\n---[ \t]*(?:\n|$)/;
const sepCount = s => (s.match(/\n---[ \t]*(?=\n|$)/g) || []).length;
const read = f => fs.readFileSync(f, 'utf8').replace(/\r/g, '').replace(/<!--[\s\S]*?-->\n?/g, '').trim();
const die = m => { console.error('✗ ' + m); process.exit(1); };

fs.mkdirSync(OUT, { recursive: true });
const common = read(path.join(PROMPTS, 'common.md'));
if (sepCount('\n' + common)) die('common.md 里不能有单独一行 ---（会被当成锚点分隔线）');

for (const key of ['story', 'talk', 'music', 'pillow']) {
  let body = read(path.join(PROMPTS, key + '.md'));
  if (key === 'pillow') {
    if (!intimateFile) {
      console.warn('\n⚠️  枕話没拼：prompts/pillow.md 里亲密的那一部分是空的，要你自己补。');
      console.warn('    写一份你自己的亲密规矩（节奏、她的反应怎么写、边界、她说停就马上停、每个尺度能写到哪一步），存成一个文件，再跑：');
      console.warn('    node scripts/build-styles.cjs --intimate 你的文件.md\n');
      continue;
    }
    if (!intimateFile || !fs.existsSync(intimateFile)) die('找不到 ' + intimateFile);
    const intimate = fs.readFileSync(intimateFile, 'utf8').replace(/\r/g, '').trim();
    if (!intimate) die(intimateFile + ' 是空的');
    if (sepCount('\n' + intimate)) die(intimateFile + ' 里有单独一行 ---，拼进去会把枕話的规矩切断');
    if (body.split('{{ROOM_INTIMATE}}').length !== 2) die('pillow.md 里要有且只有一处 {{ROOM_INTIMATE}}');
    body = body.replace('{{ROOM_INTIMATE}}', () => intimate);
  }
  const full = common + '\n\n' + body + '\n';
  if (sepCount(full) !== 1) die(key + '.md 拼完要有且只有一行 ---（全文 / 锚点的分隔），现在是 ' + sepCount(full));
  if (!full.split(SEP)[1].trim()) die(key + '.md 的 --- 下面要写锚点那一句');
  fs.writeFileSync(path.join(OUT, 'radio_' + key + '.md'), full, 'utf8');
  console.log('✓ styles/radio_' + key + '.md（' + (Buffer.byteLength(full) / 1024).toFixed(1) + 'KB）');
}
