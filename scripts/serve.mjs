#!/usr/bin/env node
// 대시보드를 내 컴퓨터에서만 띄운다. GitHub 조회는 화면의 동기화 버튼(또는 자동 새로고침)이 요청할 때만 한다.
//   flow-atlas serve [--port 4173] [--sample]
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, rateLimit } from './collect.mjs';
import { currentLang, pickLang, say } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const port = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 4173);
const sample = argv.includes('--sample');
const lang = sample ? pickLang() : currentLang();
// 예시 데이터는 실제 동기화 결과와 섞이지 않게 따로 둔다.
const out = resolve(sample ? 'dashboard-out/sample' : 'dashboard-out');
const dataFile = join(out, 'data.json');

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const rate = () => { if (sample) return null; try { return rateLimit(); } catch { return null; } };
const message = (e) => String(e.stderr || e.message || e).trim().split('\n').slice(-3).join(' ');

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // 다른 웹사이트가 이 서버를 호출하지 못하게 한다: 주소는 localhost 여야 하고, 동기화는 전용 헤더가 있어야 한다.
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) return send(res, 403, { error: 'forbidden' });
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, readFileSync(join(here, '../dashboard/index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/data.json') {
    return existsSync(dataFile) ? send(res, 200, readFileSync(dataFile, 'utf8')) : send(res, 404, { error: 'not synced yet' });
  }
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { server: true, sample, lang, rate: rate() });
  if (req.method === 'POST' && url.pathname === '/api/sync') {
    if (req.headers['x-dashboard'] !== '1') return send(res, 403, { error: 'forbidden' });
    try {
      const { model } = collect({ sample, out });
      return send(res, 200, { data: model, rate: rate() });
    } catch (e) {
      return send(res, 500, { error: say(lang, `동기화하지 못했다: ${message(e)}`, `Sync failed: ${message(e)}`), rate: rate() });
    }
  }
  send(res, 404, { error: 'not found' });
}).listen(port, '127.0.0.1', () => console.log(say(lang, `대시보드: http://127.0.0.1:${port}  (끝내려면 Ctrl+C)`, `Dashboard: http://127.0.0.1:${port}  (Ctrl+C to stop)`)));
