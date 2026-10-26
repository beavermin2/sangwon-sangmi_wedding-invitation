// React/Vue(Vite) 템플릿 공통 빌드 도구
// 원본을 .work/<id>/ 로 복사해 수정한 뒤 Vite 로 빌드하고 결과를 build/<id>/ 에 둔다.
// node_modules 는 .work 에 남겨 두고 package-lock.json 이 바뀔 때만 다시 설치한다.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { cp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const KEEP = new Set(['node_modules', '.lock-hash']);
const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.env', '.env.local']);

export async function prepareWork(id, src) {
  const work = join(ROOT, '.work', id);
  await mkdir(work, { recursive: true });
  for (const f of await readdir(work)) if (!KEEP.has(f)) await rm(join(work, f), { recursive: true, force: true });
  for (const f of await readdir(src)) {
    if (!SKIP.has(f)) await cp(join(src, f), join(work, f), { recursive: true });
  }
  return work;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'npm' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} 실패\n${(r.stdout || '').slice(-2000)}\n${(r.stderr || '').slice(-2000)}`);
  return r.stdout;
}

// WEDDING_SKIP_VITE=1 이면 설치·빌드를 건너뛰고 .work/ 에 패치 결과만 남긴다(패치 점검용).
const SKIP_VITE = process.env.WEDDING_SKIP_VITE === '1';

// 내려받은 템플릿의 의존성이므로 설치 스크립트(postinstall 등)는 실행하지 않는다.
export async function install(work, log) {
  if (SKIP_VITE) return log('WEDDING_SKIP_VITE: 의존성 설치 건너뜀');
  const lock = join(work, 'package-lock.json');
  const hash = createHash('sha1').update(await readFile(lock)).digest('hex');
  const stamp = join(work, '.lock-hash');
  if (existsSync(join(work, 'node_modules')) && existsSync(stamp) && (await readFile(stamp, 'utf8')) === hash) return;
  log('의존성 설치 중 (npm ci --ignore-scripts, 처음 한 번만 오래 걸립니다)');
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], work);
  await writeFile(stamp, hash);
}

export async function writeEnv(work, vars) {
  const body = Object.entries(vars).map(([k, v]) => `${k}=${JSON.stringify(String(v == null ? '' : v))}`).join('\n');
  await writeFile(join(work, '.env'), body + '\n');
}

// 타입 검사(tsc)는 건너뛰고 Vite 만 돌린다. base 를 상대 경로로 두어 어느 하위 경로에서도 열리게 한다.
export function viteBuild(work, out) {
  if (SKIP_VITE) return;
  run(process.execPath, [join(work, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base', './', '--outDir', out, '--emptyOutDir'], work);
}

export async function patch(file, pairs) {
  // 원본마다 줄바꿈(CRLF/LF)이 달라 패턴이 어긋나지 않도록 LF 로 맞춘 뒤 패치한다.
  let s = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    const next = typeof from === 'string' ? s.split(from).join(to) : s.replace(from, to);
    if (next === s) throw new Error(`${file}: 패치 대상을 찾지 못했습니다 → ${String(from).slice(0, 80)}`);
    s = next;
  }
  await writeFile(file, s);
}

// 의존성 없이 JPEG/PNG/WebP 크기를 읽는다(갤러리 라이브러리가 크기를 요구함).
export function imageSize(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(64 * 1024);
  const n = readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  const b = buf.subarray(0, n);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error(`이미지 크기를 읽을 수 없습니다: ${file}`);
}
