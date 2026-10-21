'use strict';
const http = require('http');
const path = require('path');

// 引入原作者真正的 radio_api 核心模块
const radioApi = require('./backend/radio_api.cjs');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // 1. 设置跨域头，彻底解决 Failed to fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 2. 如果是电台接口请求，直接转交给原作者的 handle 处理
  if (req.url.startsWith('/api/radio')) {
    try {
      radioApi.handle(req, res);
    } catch (err) {
      console.error('[Radio API Error]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
    return;
  }

  // 3. 根路径或健康检查
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    name: 'Midnight FM Backend',
    status: 'online',
    author: 'Iain & Vesper',
    hint: 'Radio API is live at /api/radio/*'
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Midnight FM Backend listening on port ${PORT}`);
});
