import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const id = 't08-paper-rose';

test('페이퍼 & 로즈: 선택된 템플릿 빌드, 기능 갱신, 배포와 기존 시안 호환', async () => {
  // 사용자의 대표 선택이나 사진을 바꾸지 않고 별도 프로젝트에서 전체 경로를 확인한다.
  await mkdir(join(root, '.work'), { recursive: true });
  const fixture = await mkdtemp(join(root, '.work', 'paper-rose-test-'));
  try {
    for (const path of ['scripts', 'addons', 'data', 'previews/test1', `adapters/${id}`, 'templates/catalog.json']) {
      await mkdir(dirname(join(fixture, path)), { recursive: true });
      await cp(join(root, path), join(fixture, path), { recursive: true });
    }
    const dataPath = join(fixture, 'data', 'wedding.json');
    const wedding = JSON.parse(await readFile(dataPath, 'utf8'));
    wedding.template = id;
    wedding.site.url = '';
    wedding.site.title = '템플릿 통합 확인';
    await writeFile(dataPath, JSON.stringify(wedding));
    const catalog = JSON.parse(await readFile(join(fixture, 'templates/catalog.json'), 'utf8'));
    assert.equal(catalog.filter(t => t.id === id).length, 1);
    assert.equal(catalog.find(t => t.id === id).preview.local, `build/${id}/index.html`);

    function run(script, ...args) {
      const result = spawnSync(process.execPath, [join(fixture, 'scripts', script), ...args], {
        cwd: fixture, encoding: 'utf8', env: { ...process.env, SITE_URL: 'https://example.com/wedding/' },
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    run('build.mjs', id);
    const built = join(fixture, 'build', id);
    const readConfig = async dir => {
      const context = { window: {} };
      vm.runInNewContext(await readFile(join(dir, 'assets/paper-rose/data.js'), 'utf8'), context);
      return context.window.PREVIEW_DATA;
    };
    assert.equal((await readConfig(built)).publicUrl, 'https://example.com/wedding/');

    // 기능만 갱신해도 공통 모듈 중복이나 기본 경로로의 회귀가 없어야 한다.
    wedding.features.video = { enabled: true, youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: '검증 영상' };
    await writeFile(dataPath, JSON.stringify(wedding));
    run('build.mjs', '--addons-only', id);
    const html = await readFile(join(built, 'index.html'), 'utf8');
    assert.equal((html.match(/<!-- wedding-addons -->/g) || []).length, 1);
    assert.ok(html.includes('./assets/paper-rose/addons/config.js'));
    const addonContext = { window: {} };
    vm.runInNewContext(await readFile(join(built, 'assets/paper-rose/addons/config.js'), 'utf8'), addonContext);
    assert.equal(addonContext.window.__WEDDING_ADDONS__.video.title, '검증 영상');
    assert.equal(addonContext.window.__WEDDING_ADDONS__.guestbook, null);

    run('dist.mjs', '--build');
    const dist = join(fixture, 'dist');
    for (const name of ['index.html', 'test1.html']) {
      const page = await readFile(join(dist, name), 'utf8');
      assert.ok(page.includes('<title>템플릿 통합 확인</title>'));
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(page), '미치환 토큰이 없어야 한다');
      assert.equal((page.match(/<!-- wedding-addons -->/g) || []).length, 1);
      for (const match of page.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
        await access(join(dist, match[1]));
      }
    }
    assert.equal((await readConfig(dist)).publicUrl, 'https://example.com/wedding/');
    const previewContext = { window: {} };
    vm.runInNewContext(await readFile(join(dist, 'preview-assets/test1/data.js'), 'utf8'), previewContext);
    assert.equal(previewContext.window.PREVIEW_DATA.publicUrl, 'https://example.com/wedding/test1.html');
    for (const file of ['style.css', 'app.js', 'guestbook.js', 'lottie-LICENSE.md', 'supabase-LICENSE']) {
      assert.deepEqual(await readFile(join(dist, 'assets/paper-rose', file)), await readFile(join(dist, 'preview-assets/test1', file)));
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
