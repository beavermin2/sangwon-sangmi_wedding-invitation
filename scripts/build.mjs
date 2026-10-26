// wedding.json 을 각 템플릿에 적용해 build/<id>/ 에 결과물을 만든다.
//   node scripts/build.mjs            어댑터가 있는 템플릿 전부
//   node scripts/build.mjs t01-hb4258 지정한 템플릿만
// templates/sources/ 의 원본은 건드리지 않는다.
import { readFile, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeImages, useWedding } from './lib/wedding.mjs';
import { injectAddons } from './lib/addons.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const wedding = JSON.parse(await readFile(join(DATA, 'wedding.json'), 'utf8'));
// GitHub Actions 는 Pages 주소를 SITE_URL 로 넘긴다. site.url 이 비어 있을 때만 채운다.
if (!wedding.site.url && process.env.SITE_URL) wedding.site.url = process.env.SITE_URL.replace(/\/*$/, '/');
useWedding(wedding);
const catalog = JSON.parse(await readFile(join(ROOT, 'templates', 'catalog.json'), 'utf8'));

// --addons-only: 템플릿은 다시 빌드하지 않고 기존 build/ 에 공통 모듈만 다시 넣는다(wedding.json 의 기능 설정만 바꿨을 때).
const addonsOnly = process.argv.includes('--addons-only');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = catalog.filter((t) =>
  existsSync(join(ROOT, 'adapters', t.id, 'adapter.mjs')) && (!wanted.length || wanted.includes(t.id)));

if (!targets.length) {
  console.error('빌드할 템플릿이 없습니다. adapters/<id>/adapter.mjs 가 있는지 확인하세요.');
  process.exit(1);
}

let failed = 0;
for (const t of targets) {
  const adapter = await import(pathToFileURL(join(ROOT, 'adapters', t.id, 'adapter.mjs')).href);
  const src = adapter.sourcePath
    ? join(ROOT, adapter.sourcePath)
    : join(ROOT, 'templates', 'sources', t.id, adapter.srcDir || '');
  const out = join(ROOT, 'build', t.id);
  try {
    // 자체 공통 모듈 경로를 사용하는 템플릿은 전체를 재생성해 경로와 설정을 함께 갱신한다.
    if (addonsOnly && !adapter.managesAddons) {
      if (!existsSync(join(out, 'index.html'))) throw new Error('build/ 결과가 없습니다. 먼저 npm run build 를 실행하세요');
      const warnings = await injectAddons({ wedding, id: t.id, out, images: makeImages(DATA), options: adapter.addons });
      console.log(`✓ ${t.id} (공통 모듈만)`);
      warnings.forEach((m) => console.log(`    - ${m}`));
      continue;
    }
    await rm(out, { recursive: true, force: true });
    // Vite 템플릿(copySource = false)은 어댑터가 .work/ 에서 빌드해 out 을 직접 만든다.
    if (adapter.copySource !== false) await cp(src, out, { recursive: true });
    const images = makeImages(DATA);
    const warnings = (await adapter.apply({
      wedding, template: t, src, out, images,
      log: (m) => console.log(`  … ${t.id}: ${m}`),
    })) || [];
    // 참석 여부·방명록·공유 공통 모듈 (WEDDING_SKIP_VITE 로 빌드를 건너뛰어 HTML 이 없으면 생략)
    if (!adapter.managesAddons && existsSync(join(out, 'index.html'))) {
      warnings.push(...await injectAddons({ wedding, id: t.id, out, images, options: adapter.addons }));
    }
    // 원작 라이선스를 보존한다. 자체 템플릿은 어댑터가 포함 라이브러리 고지를 복사한다.
    if (adapter.license !== false) {
      const licenseSource = adapter.sourcePath ? src : join(ROOT, 'templates', 'sources', t.id);
      await cp(join(licenseSource, 'LICENSE'), join(out, 'LICENSE'));
    }
    console.log(`✓ ${t.id}`);
    warnings.forEach((m) => console.log(`    - ${m}`));
  } catch (e) {
    failed++;
    console.error(`✗ ${t.id}: ${e.stack || e}`);
  }
}
process.exit(failed ? 1 : 0);
