// 관리자 페이지(/admin/) API. 로컬 서버(scripts/server.mjs)에서만 동작한다.
//   GET    /api/admin/state            wedding.json, 템플릿 목록, data/images 파일 목록, git 브랜치
//   PUT    /api/admin/wedding          wedding.json 저장(검증 후 원자적으로 교체)
//   POST   /api/admin/upload?name=…    사진 1장 저장(본문 = 이미지 바이트) → data/images/<name>
//   DELETE /api/admin/image?name=…     data/images/<name> 삭제
//   POST   /api/admin/build            대표 템플릿 빌드 + dist/ 생성(미리보기용)
//   POST   /api/admin/deploy           data/ 변경을 커밋하고 main 이면 push → GitHub Actions 가 배포
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const MAX_UPLOAD = 15 * 1024 * 1024;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function createAdmin({ root, port, send }) {
  const DATA = join(root, 'data');
  const IMAGES = join(DATA, 'images');
  const WEDDING = join(DATA, 'wedding.json');
  const CATALOG = join(root, 'templates', 'catalog.json');
  let busy = false;

  const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

  // 다른 사이트가 브라우저를 통해 localhost API 를 부르는 것(CSRF·DNS 리바인딩)을 막는다.
  function allowed(req) {
    const host = String(req.headers.host || '');
    if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return false;
    if (req.method === 'GET') return true;
    const origin = req.headers.origin;
    return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
  }

  async function body(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  // 파일 이름은 영문·숫자·-_. 만, 확장자는 사진만
  function safeImageName(name) {
    const n = basename(String(name || ''));
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(n) || !IMAGE_EXT.has(extname(n).toLowerCase())) return null;
    return n;
  }

  function run(cmd, args, env) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env } });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('close', (code) => resolve({ code, out: out.slice(-8000) }));
      child.on('error', (e) => resolve({ code: -1, out: String(e) }));
    });
  }
  const git = (...args) => run('git', args, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });

  function validate(w, catalog) {
    const errors = [];
    if (!w || typeof w !== 'object') return ['형식이 올바르지 않습니다'];
    for (const k of ['site', 'groom', 'bride', 'ceremony', 'venue', 'greeting', 'gallery', 'accounts', 'features']) {
      if (!w[k] || typeof w[k] !== 'object') errors.push(`${k} 항목이 없습니다`);
    }
    if (errors.length) return errors;
    if (!catalog.some((t) => t.id === w.template)) errors.push('대표 템플릿이 올바르지 않습니다');
    if (!w.groom.name || !w.bride.name) errors.push('신랑·신부 이름을 입력하세요');
    if (Number.isNaN(new Date(w.ceremony.datetime).getTime())) errors.push('예식 일시가 올바르지 않습니다');
    if (!w.venue.name) errors.push('예식장 이름을 입력하세요');
    for (const f of ['rsvp', 'guestbook']) {
      const e = w.features[f] && w.features[f].endpoint;
      if (e && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(e) && !/^http:\/\/localhost:\d+\/__mock\//.test(e)) {
        errors.push(`${f === 'rsvp' ? '참석 여부' : '방명록'} 저장소 주소는 https://script.google.com/macros/s/…/exec 형식이어야 합니다`);
      }
    }
    return errors;
  }

  async function state(res) {
    const files = existsSync(IMAGES) ? await readdir(IMAGES) : [];
    const images = [];
    for (const f of files) {
      if (!IMAGE_EXT.has(extname(f).toLowerCase())) continue;
      const s = await stat(join(IMAGES, f));
      images.push({ name: f, path: `images/${f}`, size: s.size });
    }
    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).out.trim();
    send(res, 200, { wedding: await readJson(WEDDING), catalog: await readJson(CATALOG), images, branch });
  }

  async function saveWedding(req, res) {
    let w;
    try { w = JSON.parse((await body(req, 1024 * 1024)).toString('utf8')); } catch { return send(res, 400, { errors: ['JSON 을 읽을 수 없습니다'] }); }
    const errors = validate(w, await readJson(CATALOG));
    if (errors.length) return send(res, 400, { errors });
    const tmp = WEDDING + '.tmp';
    await writeFile(tmp, JSON.stringify(w, null, 2) + '\n', 'utf8');
    await rename(tmp, WEDDING);
    send(res, 200, { ok: true });
  }

  async function upload(req, res, url) {
    const name = safeImageName(url.searchParams.get('name'));
    if (!name) return send(res, 400, { error: '파일 이름은 영문·숫자로 된 jpg/png/webp 여야 합니다' });
    const buf = await body(req, MAX_UPLOAD);
    // 확장자만 믿지 않고 파일 앞부분(매직 넘버)으로 사진인지 확인
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf.slice(1, 4).toString('ascii') === 'PNG';
    const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
    if (!isJpg && !isPng && !isWebp) return send(res, 400, { error: '사진 파일(jpg/png/webp)만 올릴 수 있습니다' });
    await writeFile(join(IMAGES, name), buf);
    send(res, 200, { ok: true, path: `images/${name}`, size: buf.length });
  }

  async function removeImage(res, url) {
    const name = safeImageName(url.searchParams.get('name'));
    if (!name) return send(res, 400, { error: '잘못된 파일 이름입니다' });
    const file = join(IMAGES, name);
    if (existsSync(file)) await unlink(file);
    send(res, 200, { ok: true });
  }

  async function exclusive(res, task) {
    if (busy) return send(res, 409, { error: '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요' });
    busy = true;
    try { await task(); } finally { busy = false; }
  }

  async function build(res) {
    await exclusive(res, async () => {
      const r = await run(process.execPath, [join(root, 'scripts', 'dist.mjs'), '--build', '--allow-demo']);
      send(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, log: r.out });
    });
  }

  async function deploy(res) {
    await exclusive(res, async () => {
      const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).out.trim();
      const changed = (await git('status', '--porcelain', '--', 'data')).out.trim();
      const log = [];
      if (changed) {
        // 배포 전 점검(원작 커플 사진 차단 등)을 먼저 통과해야 커밋한다.
        const check = await run(process.execPath, [join(root, 'scripts', 'dist.mjs'), '--build']);
        log.push(check.out);
        if (check.code !== 0) return send(res, 400, { ok: false, error: '배포 전 점검에 실패했습니다', log: log.join('\n') });
        await git('add', '--', 'data');
        const c = await git('commit', '-m', '청첩장 정보 수정 (관리자 페이지)');
        log.push(c.out);
        if (c.code !== 0) return send(res, 500, { ok: false, error: '커밋에 실패했습니다', log: log.join('\n') });
      }
      if (branch !== 'main') {
        return send(res, 200, { ok: true, pushed: false, branch, log: log.join('\n'),
          message: changed ? `${branch} 브랜치에 커밋했습니다. 배포는 main 브랜치에서만 됩니다.` : '커밋할 변경이 없습니다.' });
      }
      const p = await git('push', 'origin', 'main');
      log.push(p.out);
      if (p.code !== 0) {
        return send(res, 500, { ok: false, error: 'push 에 실패했습니다. 터미널에서 git push 로 로그인 상태를 확인하세요', log: log.join('\n') });
      }
      send(res, 200, { ok: true, pushed: true, branch, log: log.join('\n'),
        message: changed ? '커밋하고 GitHub 에 올렸습니다. 2~3분 뒤 배포됩니다.' : '새 변경은 없고, 기존 커밋을 GitHub 에 올렸습니다.' });
    });
  }

  // 처리했으면 true
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (!allowed(req)) { send(res, 403, { error: 'forbidden' }); return true; }
    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/admin/state') await state(res);
      else if (route === 'PUT /api/admin/wedding') await saveWedding(req, res);
      else if (route === 'POST /api/admin/upload') await upload(req, res, url);
      else if (route === 'DELETE /api/admin/image') await removeImage(res, url);
      else if (route === 'POST /api/admin/build') await build(res);
      else if (route === 'POST /api/admin/deploy') await deploy(res);
      else send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, e.status || 500, { error: e.status === 413 ? '파일이 너무 큽니다(15MB 이하)' : String(e.message || e) });
    }
    return true;
  };
}
