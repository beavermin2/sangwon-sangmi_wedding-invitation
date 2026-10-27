// 관리자 페이지(/admin/) API. 로컬 서버(scripts/server.mjs)에서만 동작한다.
//   GET    /api/admin/state            wedding.json, 템플릿 목록, data/images 파일 목록, git 브랜치
//   PUT    /api/admin/wedding          wedding.json 저장(검증 후 원자적으로 교체)
//   POST   /api/admin/upload?name=…    파일 1개 저장(본문 = 파일 바이트). 확장자로 종류를 정한다
//                                      사진(jpg/png/webp/gif) → data/images/, 음악(mp3/m4a)·동영상(mp4) → data/media/
//   DELETE /api/admin/image?name=…     위 파일 삭제
//   POST   /api/admin/build            대표 템플릿 빌드 + dist/ 생성(미리보기용)
//   POST   /api/admin/deploy           data/ 변경을 커밋하고 main 이면 push → GitHub Actions 가 배포
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { youtubeId } from './lib/wedding.mjs';
import { photoShareAdmin } from './lib/photo-share-admin.mjs';

const MB = 1024 * 1024;
// 파일 종류별 저장 폴더·크기 제한·내용 확인(확장자만 믿지 않고 파일 앞부분으로 판별)
const ftyp = (b) => b.slice(4, 8).toString('ascii') === 'ftyp';
const KINDS = {
  '.jpg': { dir: 'images', max: 15 * MB, label: '사진', check: (b) => b[0] === 0xff && b[1] === 0xd8 },
  '.jpeg': { dir: 'images', max: 15 * MB, label: '사진', check: (b) => b[0] === 0xff && b[1] === 0xd8 },
  '.png': { dir: 'images', max: 15 * MB, label: '사진', check: (b) => b.slice(1, 4).toString('ascii') === 'PNG' },
  '.webp': { dir: 'images', max: 15 * MB, label: '사진', check: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  // GIF 는 움직임을 지키려고 줄이지 않고 원본 그대로 받는다.
  '.gif': { dir: 'images', max: 15 * MB, label: '사진', check: (b) => /^GIF8[79]a$/.test(b.slice(0, 6).toString('ascii')) },
  '.mp3': { dir: 'media', max: 12 * MB, label: '음악', check: (b) => b.slice(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  '.m4a': { dir: 'media', max: 12 * MB, label: '음악', check: ftyp },
  // GitHub 은 50MB 를 넘는 파일에 경고, 100MB 를 넘으면 거부한다.
  '.mp4': { dir: 'media', max: 45 * MB, label: '동영상', check: ftyp },
};

export function createAdmin({ root, port, send }) {
  const DATA = join(root, 'data');
  const IMAGES = join(DATA, 'images');
  const MEDIA = join(DATA, 'media');
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

  // 파일 이름은 영문·숫자·-_. 만, 확장자는 KINDS 에 있는 것만
  function safeFile(name) {
    const n = basename(String(name || ''));
    const kind = KINDS[extname(n).toLowerCase()];
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(n) || !kind) return null;
    return { name: n, kind, file: join(DATA, kind.dir, n), path: `${kind.dir}/${n}` };
  }

  async function listDir(dir, sub) {
    const out = [];
    for (const f of existsSync(dir) ? await readdir(dir) : []) {
      const kind = KINDS[extname(f).toLowerCase()];
      if (!kind || kind.dir !== sub) continue;
      out.push({ name: f, path: `${sub}/${f}`, size: (await stat(join(dir, f))).size });
    }
    return out;
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
    const music = w.features.music || {};
    if (music.src && !/^media\/[A-Za-z0-9][\w.-]*\.(mp3|m4a)$/.test(music.src)) errors.push('배경음악 파일 경로가 올바르지 않습니다');
    const video = w.features.video || {};
    if (video.src && !/^media\/[A-Za-z0-9][\w.-]*\.mp4$/.test(video.src)) errors.push('동영상 파일 경로가 올바르지 않습니다');
    if (video.youtube && !youtubeId(video.youtube)) errors.push('유튜브 주소를 확인하세요 (예: https://youtu.be/xxxxxxxxxxx)');
    return errors;
  }

  async function state(res) {
    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).out.trim();
    send(res, 200, {
      wedding: await readJson(WEDDING), catalog: await readJson(CATALOG), branch,
      images: await listDir(IMAGES, 'images'), media: await listDir(MEDIA, 'media'),
    });
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
    const f = safeFile(url.searchParams.get('name'));
    if (!f) return send(res, 400, { error: '파일 이름은 영문·숫자로, 사진(jpg/png/webp/gif)·음악(mp3/m4a)·동영상(mp4)만 올릴 수 있습니다' });
    let buf;
    try { buf = await body(req, f.kind.max); } catch (e) {
      if (e.status === 413) return send(res, 413, { error: `${f.kind.label} 파일은 ${f.kind.max / MB}MB 이하만 올릴 수 있습니다` });
      throw e;
    }
    if (!f.kind.check(buf)) return send(res, 400, { error: `${extname(f.name)} ${f.kind.label} 파일이 아닙니다` });
    await mkdir(join(DATA, f.kind.dir), { recursive: true });
    await writeFile(f.file, buf);
    send(res, 200, { ok: true, path: f.path, size: buf.length });
  }

  async function removeFile(res, url) {
    const f = safeFile(url.searchParams.get('name'));
    if (!f) return send(res, 400, { error: '잘못된 파일 이름입니다' });
    if (existsSync(f.file)) await unlink(f.file);
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
      let p = await git('push', 'origin', 'main');
      log.push(p.out);
      // 다른 PC(회사·집)에서 먼저 배포했으면 GitHub 쪽이 앞서 있어 거절된다. 그 변경을 받아 내 커밋을 뒤에 붙이고 다시 올린다.
      if (p.code !== 0 && /rejected|fetch first|non-fast-forward/.test(p.out)) {
        const pull = await git('pull', '--rebase', 'origin', 'main');
        log.push(pull.out);
        if (pull.code !== 0) {
          await git('rebase', '--abort');
          return send(res, 409, { ok: false, log: log.join('\n'),
            error: '다른 PC 에서 같은 항목을 바꿔서 자동으로 합치지 못했습니다. 이 PC 의 변경은 그대로 있습니다. 터미널에서 git pull 후 다시 시도하세요' });
        }
        p = await git('push', 'origin', 'main');
        log.push(p.out);
      }
      if (p.code !== 0) {
        return send(res, 500, { ok: false, error: 'push 에 실패했습니다. wedding-admin.bat 을 다시 실행해 GitHub 로그인을 확인하세요', log: log.join('\n') });
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
      else if (route === 'GET /api/admin/photo-share') send(res,200,await photoShareAdmin(root));
      else if (route === 'PUT /api/admin/photo-share') {
        const settings=JSON.parse((await body(req,4096)).toString('utf8'));
        send(res,200,await photoShareAdmin(root,settings.mode,settings.storageMode));
      }
      else if (route === 'PUT /api/admin/wedding') await saveWedding(req, res);
      else if (route === 'POST /api/admin/upload') await upload(req, res, url);
      else if (route === 'DELETE /api/admin/image') await removeFile(res, url);
      else if (route === 'POST /api/admin/build') await build(res);
      else if (route === 'POST /api/admin/deploy') await deploy(res);
      else send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, e.status || 500, { error: e.status === 413 ? '파일이 너무 큽니다(15MB 이하)' : String(e.message || e) });
    }
    return true;
  };
}
