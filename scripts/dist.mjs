// 배포본 만들기: wedding.json 의 대표 템플릿(template) 하나만 dist/ 루트에 둔다.
// 갤러리·다른 템플릿·원본 소스는 배포에 포함하지 않는다.
//   node scripts/dist.mjs           이미 있는 build/<template>/ 로 dist/ 생성
//   node scripts/dist.mjs --build   대표 템플릿을 먼저 빌드(GitHub Actions 가 이렇게 실행)
//   --allow-demo                    원작 커플 사진이 남아 있어도 진행(테스트 배포용)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImages } from './lib/wedding.mjs';
import { buildPreviews } from './build-previews.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const args = process.argv.slice(2);
const wedding = JSON.parse(await readFile(join(ROOT, 'data', 'wedding.json'), 'utf8'));
const catalog = JSON.parse(await readFile(join(ROOT, 'templates', 'catalog.json'), 'utf8'));
const id = wedding.template;
const template = catalog.find((t) => t.id === id);

// 데모 사진이 원작 커플의 실제 웨딩 사진인 템플릿
const REAL_PHOTO_DEMOS = ['t03-yoon-ena', 't05-wkdtjsgur100', 't07-knm8643'];

const errors = [];
const warnings = [];
if (!template) {
  console.error(`✗ wedding.json 의 template "${id}" 가 templates/catalog.json 에 없습니다.`);
  process.exit(1);
}

if (args.includes('--build')) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs'), id], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status || 1);
}
const out = join(ROOT, 'build', id);
if (!existsSync(join(out, 'index.html'))) {
  console.error(`✗ build/${id} 가 없습니다. npm run build 를 먼저 실행하거나 --build 를 붙이세요.`);
  process.exit(1);
}

// ── 배포 전 점검 ──────────────────────────────────────────────
const images = makeImages(join(ROOT, 'data'));
if (!images.gallery(wedding).length) {
  const msg = `갤러리 사진이 없어 ${template.title}(${id})의 데모 사진이 배포됩니다`;
  if (REAL_PHOTO_DEMOS.includes(id) && !args.includes('--allow-demo')) errors.push(`${msg}. 데모 사진은 원작 커플의 실제 사진이므로 data/images 에 사진을 넣으세요 (테스트 배포만 하려면 --allow-demo)`);
  else warnings.push(msg);
}
if (!images.has(wedding.gallery.cover)) warnings.push('대표 사진(gallery.cover)이 없습니다');
const accounts = wedding.accounts.groom.concat(wedding.accounts.bride);
if (accounts.some((a) => a.bank === '은행명' || /^[0-]+$/.test(a.number))) warnings.push('계좌 정보가 아직 예시 값(은행명 / 000-…)입니다');
if (!wedding.site.url && !process.env.SITE_URL) warnings.push('site.url 이 비어 있어 공유 미리보기 이미지가 절대 주소로 들어가지 않습니다 (GitHub Actions 배포에서는 자동으로 채워집니다)');
const f = wedding.features || {};
if (f.rsvp && f.rsvp.enabled && !f.rsvp.endpoint) warnings.push('참석 여부 저장소 주소가 없어 배포본에서 참석 여부 칸이 숨겨집니다 (backend/README.md)');
if (f.guestbook && f.guestbook.enabled && !f.guestbook.endpoint) warnings.push('방명록 저장소 주소가 없어 배포본에서 방명록이 숨겨집니다 (backend/README.md)');
if (f.kakaoShare && f.kakaoShare.enabled && !f.kakaoShare.jsKey) warnings.push('카카오 JS 키가 없어 카카오톡 공유 대신 주소 복사만 됩니다');

warnings.forEach((m) => console.log(`  ! ${m}`));
if (errors.length) {
  errors.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}

// ── dist/ 만들기 ──────────────────────────────────────────────
await rm(DIST, { recursive: true, force: true });
await cp(out, DIST, { recursive: true });
// 원본 저장소의 안내 파일은 사이트에 필요 없다(LICENSE 는 MIT 고지로 남긴다).
for (const name of await readdir(DIST)) {
  if (/^(README.*|\.gitignore|\.github|\.vscode|AGENTS\.md|CLAUDE\.md)$/i.test(name)) await rm(join(DIST, name), { recursive: true, force: true });
}
// Jekyll 처리 끄기(_ 로 시작하는 파일 보존)
await writeFile(join(DIST, '.nojekyll'), '');
// 청첩장은 링크를 받은 사람만 보면 되므로 검색 엔진 수집을 막는다.
await writeFile(join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
for (const page of (await readdir(DIST)).filter((n) => n.endsWith('.html'))) {
  const file = join(DIST, page);
  const html = await readFile(file, 'utf8');
  if (!/name="robots"/.test(html)) await writeFile(file, html.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="robots" content="noindex, nofollow">'));
}

console.log(`✓ dist/ ← ${template.title} (${id})`);
await buildPreviews({ root: ROOT, dist: DIST, wedding });
