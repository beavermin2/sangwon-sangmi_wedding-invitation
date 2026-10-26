// 로컬 미리보기 서버 (의존성 없음)
//   node scripts/server.mjs  →  http://localhost:4000/admin/ (관리자), /gallery/ (템플릿 갤러리)
// 정적 파일을 서빙하고, 갤러리의 "대표로 선택"(POST /api/select)과 관리자 API(/api/admin/*)를 처리한다.
// 파일을 고치는 API 가 있으므로 이 PC(127.0.0.1)에서만 접속을 받는다.
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdmin } from './admin-api.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const HOST = '127.0.0.1';
const WEDDING = join(ROOT, 'data', 'wedding.json');
const CATALOG = join(ROOT, 'templates', 'catalog.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf',
};

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function handleSelect(req, res) {
  // 관리자 API 와 같은 기준: 이 PC 의 같은 출처에서 온 요청만
  const local = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
  if (!local.includes(req.headers.host) || !local.map((h) => `http://${h}`).includes(req.headers.origin)) {
    return send(res, 403, { error: 'forbidden' });
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let id;
  try { id = JSON.parse(raw).id; } catch { return send(res, 400, { error: 'invalid json' }); }
  const catalog = await readJson(CATALOG);
  if (!catalog.some((t) => t.id === id)) return send(res, 404, { error: 'unknown template' });
  const wedding = await readJson(WEDDING);
  wedding.template = id;
  await writeFile(WEDDING, JSON.stringify(wedding, null, 2) + '\n', 'utf8');
  send(res, 200, { template: id });
}

// 로컬 테스트용 가짜 Apps Script 저장소(backend/apps-script/Code.gs 와 같은 요청·응답 형식, 메모리에만 저장).
// wedding.json 의 endpoint 에 http://localhost:4000/__mock/apps-script 를 넣으면 실제 시트 없이 확인할 수 있다.
const mock = { rsvp: [], guestbook: [] };
async function handleMock(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    if (url.searchParams.get('action') !== 'guestbook') return send(res, 200, { ok: true });
    const offset = Number(url.searchParams.get('offset')) || 0;
    const limit = Math.min(20, Number(url.searchParams.get('limit')) || 5);
    const rows = mock.guestbook.slice().reverse();
    return send(res, 200, { ok: true, total: rows.length, items: rows.slice(offset, offset + limit) });
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 200, { ok: false, error: 'invalid' }); }
  if (body.website) return send(res, 200, { ok: true });
  const at = new Date().toISOString();
  if (body.type === 'rsvp') mock.rsvp.push({ at, ...body });
  else if (body.type === 'guestbook') mock.guestbook.push({ at, name: body.name, message: body.message });
  else return send(res, 200, { ok: false, error: 'type' });
  console.log(`[mock] ${body.type}:`, JSON.stringify(body));
  send(res, 200, { ok: true, at });
}

async function serveStatic(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return send(res, 403, 'forbidden', 'text/plain');
  if (/^\/\.(git|work)(\/|$)/.test(path)) return send(res, 403, 'forbidden', 'text/plain');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    const data = await readFile(file);
    // 음악·동영상은 Range 요청(구간 읽기)을 지원해야 Safari 재생·탐색이 된다.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && /^(audio|video)\//.test(type)) {
      const size = data.length;
      const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      return res.end(data.subarray(start, end + 1));
    }
    send(res, 200, data, type);
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

const admin = createAdmin({ root: ROOT, port: PORT, send });

createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
    if (await admin(req, res)) return;
    if (req.method === 'POST' && req.url === '/api/select') return await handleSelect(req, res);
    if (req.url.startsWith('/__mock/apps-script')) return await handleMock(req, res);
    if (req.method === 'GET') return await serveStatic(req, res);
    send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(PORT, HOST, () => {
  console.log(`관리자: http://localhost:${PORT}/admin/`);
  console.log(`갤러리: http://localhost:${PORT}/gallery/`);
});
