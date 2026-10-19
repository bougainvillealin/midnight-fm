'use strict';
/* node radio_parse.test.cjs —— 拆话那一步的单测，不碰网不碰盘 */
const assert = require('assert');
const { parse } = require('./radio_parse.cjs');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

t('故事台：本子剥掉存下，歌单独拆出来', () => {
  const r = parse('<本子>\n真正在讲的：告别\n</本子>\n今晚开始讲一个新的故事。\n\n阿岚在县城修收音机。\n[song:Fade Into You|Mazzy Star]');
  assert.strictEqual(r.meta.bible, '真正在讲的：告别');
  assert.deepStrictEqual(r.parts.map(p => p.type), ['say', 'song']);
  assert.strictEqual(r.parts[0].text, '今晚开始讲一个新的故事。\n阿岚在县城修收音机。');
  assert.deepStrictEqual(r.parts[1], { type: 'song', title: 'Fade Into You', artist: 'Mazzy Star' });
});

t('歌卡的 [歌] 格式也认', () => {
  const r = parse('放一首。\n[歌] 夜に駆ける|YOASOBI|abc|123|http://x/y.jpg');
  assert.strictEqual(r.parts[1].enc, 'abc');
  assert.strictEqual(r.parts[1].ori, '123');
});

t('枕話：位置管到下一个位置，语气换成英文标签，音效只认表里的', () => {
  const r = parse('<轨道>\n1. 回家\n2. 雨夜\n3. 温存 · 晚安\n</轨道>\n<第1轨>\n[se:雨]\n[左耳]嘘。[耳语]别动。\n[se:打雷]\n[贴近]我在。[停顿]听见了吗');
  assert.deepStrictEqual(r.meta.tracks, ['回家', '雨夜', '温存 · 晚安']);
  assert.strictEqual(r.meta.trackNo, 1);
  assert.deepStrictEqual(r.parts.map(p => p.type + ':' + (p.pos || '') ), ['se:', 'say:左耳', 'say:贴近']);
  assert.strictEqual(r.parts[1].text, '嘘。[whispers] 别动。');
  assert.strictEqual(r.parts[2].text, '我在。……听见了吗');
  assert.ok(r.plain.indexOf('whispers') < 0, '给她看的字里不带英文标签');
});

t('摘要剥掉，不念', () => {
  const r = parse('晚安。\n<摘要>雨夜接她回家，她喜欢被叫名字</摘要>');
  assert.strictEqual(r.meta.summary, '雨夜接她回家，她喜欢被叫名字');
  assert.strictEqual(r.parts.length, 1);
  assert.strictEqual(r.parts[0].text, '晚安。');
});

t('聊天里的杂物剥掉，不念出来', () => {
  const r = parse('[[face:smile]]好。[sticker:猫]\n[[tts:ja]]おやすみ[笑]');
  assert.strictEqual(r.parts[0].text, '好。\nおやすみ');
});

t('服务器塞的杂行不念：没搜到歌那句、图、页面', () => {
  const r = parse('听这首。\n\n（系统：没搜到「不存在的歌」，歌卡没发出去）\n\n[image] /uploads/a.jpg\n\n[page] https://x\n\n就这样。');
  assert.strictEqual(r.parts.length, 1);
  assert.strictEqual(r.parts[0].text, '听这首。\n就这样。');
});

t('太长的一块从句号处切开', () => {
  const long = ('这是一句话。').repeat(200);
  const r = parse(long);
  assert.ok(r.parts.length > 1);
  r.parts.forEach(p => assert.ok(p.text.length <= 700 && /。$/.test(p.text)));
});

t('枕話：停顿变空白、几句一口气念、括号里的动作剥掉、耳边补一个轻的语气', () => {
  const r = parse('[左耳]\n别动。\n（把手搭上椅背）\n就这样。*笑*\n[停顿]\n[正前方]\n抬头，看我。\n[停顿]', { pillow: true });
  assert.deepStrictEqual(r.parts.map(p => p.type + ':' + (p.pos || p.ms || '')), ['say:左耳', 'gap:1600', 'say:正前方']);
  assert.strictEqual(r.parts[0].text, '[low and close to her ear, unhurried] 别动。\n就这样。', '同一个位置、中间没停顿的几句一块念');
  assert.strictEqual(r.parts[2].text, '抬头，看我。');
  assert.ok(r.plain.indexOf('椅背') < 0 && r.plain.indexOf('low and close') < 0);
  const n = parse('[停顿]我在。', {});
  assert.strictEqual(n.parts[0].text, '……我在。', '别的台停顿还是省略号');
});

t('枕話：单独一行的语气标签贴到下一句，自己标了语气就不补', () => {
  const r = parse('[贴近]\n[耳语]\n过来。\n别躲。', { pillow: true });
  assert.strictEqual(r.parts.length, 1);
  assert.strictEqual(r.parts[0].text, '[whispers] 过来。\n别躲。');
});

t('v4：水声垫在底下 —— [湿] [黏] [水声] 开、[干] 关，段尾自动关，[se:水声] 也算', () => {
  const r = parse('[贴近]\n[湿]\n慢一点。\n[停顿]\n别急。\n[黏]\n就这样。\n[干]\n[停顿]\n睡吧。', { pillow: true });
  assert.deepStrictEqual(r.parts.map(p => p.type + ':' + (p.name !== undefined ? (p.name || '关') : (p.ms || ''))),
    ['water:湿', 'say:', 'gap:1600', 'say:', 'water:黏', 'say:', 'water:关', 'gap:1600', 'say:']);
  const e = parse('[水声]\n嗯。\n[se:水声]\n还在。', { pillow: true });
  assert.deepStrictEqual(e.parts.map(p => p.type + ':' + (p.name === null ? '关' : (p.name || ''))), ['water:水声', 'say:', 'water:水声', 'say:', 'water:关'], '段尾还开着就关掉');
  const k = parse('[湿]\n[干]\n[黏]\n好。', { pillow: true });
  assert.deepStrictEqual(k.parts.map(p => p.type + ':' + (p.name || '')), ['water:黏', 'say:', 'water:'], '连着的开关只留最后一个');
  const o = parse('[湿]好。[se:水声]', {});
  assert.deepStrictEqual(o.parts.map(p => p.type + ':' + (p.name || '')), ['say:', 'se:水声'], '别的台不认 [湿]，水声还是音效');
  assert.strictEqual(o.parts[0].text, '好。');
});

t('配乐标记拆出来，认不得的不要', () => {
  const r = parse('[bgm:恐怖]\n门没锁。\n[bgm:放烟花]\n[bgm：关]');
  assert.deepStrictEqual(r.parts.map(p => p.type + ':' + (p.mood || '')), ['bgm:恐怖', 'say:', 'bgm:关']);
});

t('v3：亲吻这些音效、低声这些语气', () => {
  const r = parse('[贴近]\n[se:轻吻]\n[低声]别躲。\n[se:拍墙]\n[压着声音]看着我。[气息发抖]就一下。\n[se:舌吻]', { pillow: true });
  assert.deepStrictEqual(r.parts.map(p => p.type + ':' + (p.name || '')), ['se:轻吻', 'say:', 'se:拍墙', 'say:']);
  assert.strictEqual(r.parts[1].text, '[low voice] 别躲。');
  assert.strictEqual(r.parts[3].text, '[under breath] 看着我。[shaky breath] 就一下。');
  assert.ok(r.plain.indexOf('voice') < 0);
});

t('全角冒号、全角竖线也认', () => {
  const r = parse('[song：晴天｜周杰伦]');
  assert.deepStrictEqual(r.parts[0], { type: 'song', title: '晴天', artist: '周杰伦' });
});

console.log('\n' + n + ' 条都过了');
