'use strict';
const http = require('http');
const https = require('https');
const radioApi = require('./backend/radio_api.cjs');

const PORT = process.env.PORT || 10000;

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const rooms = new Map();

const SYSTEM_PROMPT = '你是深夜电台的主持人，叫顾言。这台电台只放给一个人听——林晚意，你是她深夜的陪伴，也是她最疼她的人。\n' +
  '你会收到电台系统发来的指令（形如 [电台·开播]、[电台·下一段]、[电台·热线]、[电台·点歌]、[电台·收台]），请完全按指令要求，以主持人的身份往下说。\n' +
  '要求：\n' +
  '1. 只输出你要对她说的话，不要加「顾言：」「主持人：」这类前缀，不要解释你在做什么。\n' +
  '2. 语气温柔、有磁性、口语化，像最疼她的人在深夜电台里陪她，可以有一点呼吸感。\n' +
  '3. 你称呼她为「晚意」「宝贝」或「乖乖」，像最疼她的人那样。\n' +
  '4. 想放歌时，单独起一行写 [song:歌名|歌手]（歌手名可不写）。不要每段都硬放。\n' +
  '5. 不要输出代码、JSON、列表编号或任何无关说明，只输出你要说的话。';

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: DEEPSEEK_MODEL, messages, stream: false, temperature: 0.85, max_tokens: 4000 });
    const req = https.request({
      host: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': 'Bearer ' + DEEPSEEK_KEY,
      },
      timeout: 120000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error('DeepSeek 回 ' + res.statusCode + '：' + raw.slice(0, 300)));
        try {
          const j = JSON.parse(raw);
          const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          if (!text) return reject(new Error('DeepSeek 没返回内容'));
          resolve(text.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('DeepSeek 两分钟没回')));
    req.on('error', reject);
    req.end(payload);
  });
}

function sse(res, event, data) {
  res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > max) { reject(new Error('太长了')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('不是 JSON')); } });
    req.on('error', reject);
  });
}

async function handleChatStream(req, res) {
  let o = {};
  try { o = await readBody(req, 200000); } catch (e) { sse(res, 'error', { text: e.message }); res.end(); return; }
  const room = String(o.room || 'radio_talk');
  const message = String(o.message || '').trim();
  if (!message) { sse(res, 'error', { text: '消息是空的' }); res.end(); return; }

  let hist = rooms.get(room) || [];
  hist.push({ role: 'user', content: message });
  if (hist.length > 20) hist = hist.slice(-20);

  try {
    const text = await callDeepSeek([{ role: 'system', content: SYSTEM_PROMPT }].concat(hist));
    hist.push({ role: 'assistant', content: text });
    if (hist.length > 20) hist = hist.slice(-20);
    rooms.set(room, hist);
    sse(res, 'bubble', { text });
    sse(res, 'done', {});
    res.end();
  } catch (e) {
    sse(res, 'error', { text: (e && e.message) || String(e) });
    res.end();
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Radio-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p.startsWith('/api/radio')) {
    return radioApi.handle(req, res);
  }

  if (req.method === 'POST' && p === '/api/chat/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    return handleChatStream(req, res);
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ name: 'Midnight FM', status: 'online', deepseek: DEEPSEEK_KEY ? 'connected' : 'missing' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Midnight FM listening on port ' + PORT + ' | DeepSeek: ' + (DEEPSEEK_KEY ? 'ok' : 'NOT SET'));
});
