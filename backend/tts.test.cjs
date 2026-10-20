'use strict';
/* host/tts.js 的单测：假的 ElevenLabs（换掉 https.request），不联网、不花钱。
   node backend/tts.test.cjs */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfm-tts-'));
process.env.RADIO_TTS_DIR = path.join(tmp, 'tts_cache');
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_VOICE_ID;

const calls = [];
let reply = () => ({ status: 200, body: Buffer.alloc(2048, 1) });
https.request = (opts, cb) => {
  const req = new EventEmitter();
  req.destroy = e => req.emit('error', e);
  req.end = payload => {
    const call = { path: opts.path, key: opts.headers['xi-api-key'], body: JSON.parse(payload.toString('utf8')) };
    calls.push(call);
    setTimeout(() => {
      const r = reply(call);
      const res = new EventEmitter();
      res.statusCode = r.status;
      cb(res);
      res.emit('data', Buffer.isBuffer(r.body) ? r.body : Buffer.from(JSON.stringify(r.body)));
      res.emit('end');
    }, 5);
  };
  return req;
};
const withTs = () => ({ status: 200, body: { audio_base64: Buffer.alloc(2048, 2).toString('base64'),
  alignment: { characters: ['你', '好'], character_start_times_seconds: [0, 0.3], character_end_times_seconds: [0.3, 0.6] } } });

const tts = require('./host/tts.js');
let n = 0;
const ok = m => { n++; console.log('✓ ' + m); };

(async () => {
  let r = await tts.synth('你好');
  assert.ok(r.skipped && !calls.length);
  assert.strictEqual(tts.cfg().provider, 'none');
  ok('没配 key：回 skipped，不联网');

  process.env.ELEVENLABS_API_KEY = 'test-key';
  process.env.ELEVENLABS_VOICE_ID = 'v1';
  assert.deepStrictEqual(tts.cfg(), { provider: 'elevenlabs', el_voice_id: 'v1' });

  reply = c => /with-timestamps/.test(c.path) ? withTs() : { status: 500, body: 'no' };
  r = await tts.synth('你好', { timestamps: true });
  assert.ok(/^[0-9a-f]{40}$/.test(r.hash) && r.via === 'ElevenLabs' && r.align === true, JSON.stringify(r));
  assert.ok(fs.existsSync(tts.file(r.hash)) && fs.statSync(tts.file(r.hash)).size === 2048);
  const al = JSON.parse(fs.readFileSync(path.join(tts.CACHE_DIR, r.hash + '.align.json'), 'utf8'));
  assert.deepStrictEqual(al.characters, ['你', '好']);
  assert.strictEqual(calls[0].key, 'test-key');
  assert.ok(/^\/v1\/text-to-speech\/v1\/with-timestamps\?/.test(calls[0].path));
  ok('要逐字时间：走带时间戳那条，声音和 <hash>.align.json 都存下来');

  const before = calls.length;
  const again = await tts.synth('你好', { timestamps: true });
  assert.ok(again.cached && again.hash === r.hash && again.align === true && calls.length === before);
  ok('同一句再要：直接用存下来的，不再花钱');

  reply = c => /with-timestamps/.test(c.path) ? { status: 400, body: 'model does not support' } : { status: 200, body: Buffer.alloc(1500, 3) };
  r = await tts.synth('换一句', { timestamps: true });
  assert.ok(r.hash && r.align === false && !r.skipped, JSON.stringify(r));
  assert.ok(/with-timestamps/.test(calls[calls.length - 2].path) && !/with-timestamps/.test(calls[calls.length - 1].path));
  ok('带时间戳那条回 400：照普通那条再要一次，有声音、没逐字时间');

  reply = () => ({ status: 401, body: 'bad key' });
  const c0 = calls.length;
  r = await tts.synth('第三句', { timestamps: true });
  assert.ok(r.skipped && /401/.test(r.skipped) && calls.length === c0 + 1, JSON.stringify(r));
  ok('key 不对（401）：不再要第二次，回 skipped');

  reply = () => ({ status: 200, body: Buffer.alloc(1024, 4) });
  const a = await tts.synth('稳一点');
  const b = await tts.synth('稳一点', { stability: 0.75 });
  assert.ok(a.hash !== b.hash);
  assert.strictEqual(calls[calls.length - 1].body.voice_settings.stability, 0.75);
  ok('单句稳定度（枕話 0.75）：换了稳定度就是另一份声音');

  const c1 = calls.length;
  const [x, y] = await Promise.all([tts.synth('同时要'), tts.synth('同时要')]);
  assert.ok(x.hash === y.hash && calls.length === c1 + 1);
  ok('同一句同时要两次：只念一遍');

  console.log('\n' + n + ' 条都过了');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error('✗', e); process.exit(1); });
