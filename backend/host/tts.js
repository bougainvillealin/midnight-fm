'use strict';
/* 念字 —— 自带一份能用的 ElevenLabs 版；也可以整个换成你自己的，只要对外的样子一样。

   用这一份：设环境变量 ELEVENLABS_API_KEY、ELEVENLABS_VOICE_ID 就能念。
     可选 ELEVENLABS_MODEL（默认 eleven_v3，认 [whispers] 这种方括号语气）、ELEVENLABS_STABILITY（默认 0.5）、
     RADIO_TTS_DIR（念好的放哪，默认 backend/data/tts_cache）。
     key 只从环境变量读，不写进任何文件。没配就回 { skipped }，页面照样出字、停一会儿当它念过。

   radio_api 用到的：
   synth(text, opt) → Promise<{ hash, via, align?, skipped? }>
     念好存成 CACHE_DIR/<hash>.mp3，回 hash（40 位十六进制）。页面去 /api/tts/<hash>.mp3 取 ——
     这个地址由你的服务器从 CACHE_DIR 发出去（最好支持 Range：字幕点字的时候才跳得过去，不支持页面会整句拿下来再跳）。
     opt.timestamps：走 ElevenLabs 带时间戳的那条（/with-timestamps），同一次生成多回一份每个字几秒开始、几秒结束，
       原样存在 CACHE_DIR/<hash>.align.json（characters / character_start_times_seconds / character_end_times_seconds），回 align: true。
       逐字字幕靠它（radio_api 的 /api/radio/align 从这里读）。这条回 HTTP 错（401 / 429 除外）就照普通那条再要一次，不哑。
     opt.stability：这一句单独用的稳定度（枕話是 0.75）。
     via：真的用了哪家。换成别家念字时别写 'ElevenLabs'，电台会改用 MiniMax 那种 (sighs) 的写法。
   cfg() → { provider, el_voice_id }：provider 是 'elevenlabs' 且有 el_voice_id 时，电台才把方括号原样送过来。
   CACHE_DIR：念好的声音和逐字时间都在这儿。 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const CACHE_DIR = process.env.RADIO_TTS_DIR || path.join(__dirname, '..', 'data', 'tts_cache');
const FORMAT = 'mp3_44100_128';
const key = () => process.env.ELEVENLABS_API_KEY || '';
const voice = () => process.env.ELEVENLABS_VOICE_ID || '';
const model = () => process.env.ELEVENLABS_MODEL || 'eleven_v3';
const stabilityDefault = () => { const n = Number(process.env.ELEVENLABS_STABILITY); return isFinite(n) && n >= 0 && n <= 1 ? n : 0.5; };

function cfg() { return key() && voice() ? { provider: 'elevenlabs', el_voice_id: voice() } : { provider: 'none' }; }
const hashOf = (text, stability) => crypto.createHash('sha1').update([model(), voice(), stability, text].join('\n')).digest('hex');
const file = hash => path.join(CACHE_DIR, hash + '.mp3');
const alignFile = hash => path.join(CACHE_DIR, hash + '.align.json');

function post(urlPath, body, wantJson) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      host: 'api.elevenlabs.io', path: urlPath, method: 'POST', timeout: 60000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, 'Accept': wantJson ? 'application/json' : 'audio/mpeg', 'xi-api-key': key() },
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) return reject(Object.assign(new Error('HTTP ' + res.statusCode + ' ' + buf.toString('utf8').slice(0, 200)), { status: res.statusCode }));
        resolve(buf);
      });
    });
    req.on('timeout', () => req.destroy(new Error('超时')));
    req.on('error', reject);
    req.end(payload);
  });
}

const pending = new Map();   /* 同一句正在念：第二个请求等同一份，不花两遍额度 */
async function synth(rawText, opt) {
  opt = opt || {};
  const text = String(rawText || '').trim();
  if (!text) return { skipped: '空的' };
  if (!key() || !voice()) return { skipped: '没配 ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID（或者把 backend/host/tts.js 换成你自己的念字）' };
  const stability = opt.stability != null && isFinite(Number(opt.stability)) ? Number(opt.stability) : stabilityDefault();
  const hash = hashOf(text, stability);
  if (fs.existsSync(file(hash))) return { hash, via: 'ElevenLabs', cached: true, align: fs.existsSync(alignFile(hash)) };
  if (pending.has(hash)) return pending.get(hash);
  const job = Promise.resolve().then(async () => {   /* 先登记再开工：出错的 finally 一定在登记之后 */
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const body = { text, model_id: model(), voice_settings: { stability, similarity_boost: 0.75 } };
      const base = '/v1/text-to-speech/' + encodeURIComponent(voice());
      let audio = null;
      if (opt.timestamps) {
        try {
          const j = JSON.parse((await post(base + '/with-timestamps?output_format=' + FORMAT, body, true)).toString('utf8'));
          const buf = Buffer.from(String(j.audio_base64 || ''), 'base64');
          const al = j.alignment || j.normalized_alignment;
          if (buf.length >= 512) {
            audio = buf;
            if (al && Array.isArray(al.characters)) {
              fs.writeFileSync(alignFile(hash), JSON.stringify({ characters: al.characters, character_start_times_seconds: al.character_start_times_seconds, character_end_times_seconds: al.character_end_times_seconds }));
            }
          }
        } catch (e) {
          if (e.status === 401 || e.status === 429) throw e;   /* key 不对、没额度：再要一次也一样 */
        }
      }
      if (!audio) audio = await post(base + '?output_format=' + FORMAT, body, false);   /* 不要时间、或者带时间戳那条没成 */
      if (audio.length < 512) throw new Error('音频太短（' + audio.length + 'B）');
      fs.writeFileSync(file(hash), audio);
      return { hash, via: 'ElevenLabs', cached: false, align: fs.existsSync(alignFile(hash)) };
    } catch (e) {
      return { skipped: 'ElevenLabs：' + ((e && e.message) || e) };
    } finally {
      pending.delete(hash);
    }
  });
  pending.set(hash, job);
  return job;
}

module.exports = { synth, cfg, CACHE_DIR, file, alignFile };
