// t04(heejin-hwang)와 그 파생작 t05(wkdtjsgur100) 공용 어댑터
// 두 템플릿은 src/data.json 하나를 읽는 같은 구조라 차이(지도 종류, 대표 사진)만 옵션으로 받는다.
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  kstParts, pad2, parentName, venueLine, mapLinks, kakaoMapKey, escapeHtml, DAY_KO,
} from '../../scripts/lib/wedding.mjs';
import { prepareWork, install, writeEnv, viteBuild, patch, imageSize } from '../../scripts/lib/vite.mjs';

const toParents = (p) => [
  { relation: '아버지', name: parentName(p.father), isDeceased: !!(p.father && p.father.deceased) },
  { relation: '어머니', name: parentName(p.mother), isDeceased: !!(p.mother && p.mother.deceased) },
].filter((x) => x.name);

// 구글 캘린더 '일정 추가' 링크 (예식 2시간)
function calendarUrl(w) {
  const start = new Date(w.ceremony.datetime);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${w.groom.name} ♥ ${w.bride.name} 결혼식`,
    dates: `${f(start)}/${f(end)}`,
    location: `${w.venue.address} ${venueLine(w.venue)}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export async function applyHeejin({ wedding: w, src, out, images, log }, opt) {
  const warnings = [];
  const id = opt.id;
  const work = await prepareWork(id, src);
  const when = kstParts(w.ceremony.datetime);
  const links = mapLinks(w.venue);
  const account = (a) => ({
    name: a.owner, relation: a.relation, bank: a.bank, account: a.number,
    kakaopayAccount: a.kakaopay || '', tossAccount: '',
  });
  const notice = (w.notices || []).map((n) => ({ title: `📍 ${n.title}`, desc: n.detail }));

  const data = {
    greeting: {
      title: `${w.groom.name} 💍 ${w.bride.name}\n${w.greeting.title}`,
      message: w.greeting.message,
      host: {
        groom: { name: w.groom.name, relation: w.groom.relation, parents: toParents(w.groom.parents) },
        bride: { name: w.bride.name, relation: w.bride.relation, parents: toParents(w.bride.parents) },
      },
      eventDetail: `${when.y}년 ${when.m}월 ${when.d}일 (${DAY_KO[when.dow]}) ${pad2(when.h24)}:${pad2(when.mi)}\n${venueLine(w.venue)}`,
    },
    hostInfo: [
      { host: '신랑측', accountInfo: w.accounts.groom.map(account) },
      { host: '신부측', accountInfo: w.accounts.bride.map(account) },
    ],
    mapInfo: {
      address1: venueLine(w.venue),
      address2: [w.venue.address, w.venue.phone].filter(Boolean).join('\n'),
      naverMap: links.naver,
      kakaoMap: links.kakao,
      lat: w.venue.lat,
      lon: w.venue.lng,
    },
    locationInfo: (w.venue.transport || []).map((t) => ({ title: `📍 ${t.label}`, desc: t.detail }))
      .concat(notice),
    emojis: ['❤️', '💛', '💌', '🥹', '🥳', '🤍', '✨', '💍', '💒', '💕', '😍', '🔔', '💘'],
    calendarUrl: calendarUrl(w),
  };
  await writeFile(join(work, 'src', 'data.json'), JSON.stringify(data, null, 2));

  // 사진: 갤러리와 대표 사진. 없으면 데모 사진 유지.
  const imgDir = join(work, 'src', 'assets', 'images');
  const photos = images.gallery(w);
  if (photos.length) {
    for (const f of await readdir(imgDir)) await rm(join(imgDir, f));
    const items = [];
    for (let i = 0; i < photos.length; i++) {
      const name = `${pad2(i + 1)}${extname(photos[i]).toLowerCase()}`;
      await images.copy(photos[i], join(imgDir, name));
      const { width, height } = imageSize(join(imgDir, name));
      items.push({ name, width, height });
    }
    await writeFile(join(work, 'src', 'layout', 'Gallery', 'Images.ts'),
      items.map((x, i) => `import image${i} from '@/assets/images/${x.name}';`).join('\n') +
      '\n\nconst images = [\n' +
      items.map((x, i) => `  { alt: 'image${i + 1}', source: image${i}, width: ${x.width}, height: ${x.height} },`).join('\n') +
      '\n];\n\nexport default images;\n');
  } else {
    warnings.push(opt.demoWarning || '갤러리 사진이 없어 데모 사진을 씁니다');
  }
  if (images.has(w.gallery.cover)) {
    const name = `cover${extname(w.gallery.cover).toLowerCase()}`;
    await images.copy(w.gallery.cover, join(imgDir, name));
    await patch(join(work, 'src', 'layout', 'Main', 'Main.tsx'), [[/@\/assets\/images\/[\w.]+'/, `@/assets/images/${name}'`]]);
  } else if (photos.length) {
    // 데모 대표 사진 파일을 지웠으므로 첫 갤러리 사진을 대표로 쓴다.
    await patch(join(work, 'src', 'layout', 'Main', 'Main.tsx'), [[/@\/assets\/images\/[\w.]+'/, `@/assets/images/${pad2(1)}${extname(photos[0]).toLowerCase()}'`]]);
  }
  if (images.has(w.site.ogImage)) await images.copy(w.site.ogImage, join(work, 'public', 'thumbnail.jpg'));

  // 원본의 방명록 폼은 저장 기능이 없거나(t04) 원작자의 Firebase 로 저장한다(t05).
  // 어느 쪽도 쓸 수 없으므로 화면에서 빼고, firebase.ts 는 설정 없는 빈 모듈로 바꾼다.
  await patch(join(work, 'src', 'App.tsx'), [[/\s*<Wrapper>\s*<Heading1>신랑 신부에게<\/Heading1>\s*<Guestbook \/>\s*<\/Wrapper>/, '']]);
  await writeFile(join(work, 'src', 'firebase.ts'),
    "// scripts/build.mjs: 원본의 Firebase 설정은 사용하지 않습니다. 방명록은 공통 모듈이 담당합니다.\n" +
    "import type { Database } from 'firebase/database';\n\nexport const realtimeDb = undefined as unknown as Database;\n");

  // t05 는 하트 버튼의 '좋아요' 수도 Firebase 에 쓴다. 저장소가 없으므로 Firebase 호출만 걷어내고 꽃가루 효과는 남긴다.
  const floating = join(work, 'src', 'layout', 'FloatingBar', 'FloatingBar.tsx');
  if (/^import [^\n]*from 'firebase\/database'/m.test(await readFile(floating, 'utf8'))) {
    await patch(floating, [
      [/import \{ increment, onValue, ref, update \} from 'firebase\/database';\nimport \{ realtimeDb \} from 'firebase\.ts';\n/, ''],
      [/\n  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[\]\);\n/, '\n'],
      [/\n    \/\/ 버튼 클릭시 likes 수 증가[\s\S]*?\}\);\n/, '\n'],
      [/import \{useEffect, useState\} from "react";/, 'import { useState } from "react";'],
    ]);
  }

  // 배경 이미지가 사이트 루트 경로(/background.png)로 적혀 있어 하위 경로 배포 시 깨진다.
  await patch(join(work, 'src', 'layout', 'Container.tsx'), [["url('/background.png')", "url('./background.png')"]]);

  // 모시는 글 아래 버튼: 원작 링크 대신 구글 캘린더 추가 하나만
  await patch(join(work, 'src', 'layout', 'Invitation', 'Invitation.tsx'), [[
    /\{\/\* TODO[^}]*\}\s*(<RoundButton[\s\S]*?<\/RoundButton>\s*)+/,
    '<RoundButton target="_blank" href={data.calendarUrl} rel="noreferrer">\n        구글 캘린더 추가하기\n      </RoundButton>\n    ',
  ]]);

  // 지도: 키가 없으면 지도 영역을 숨기고 네이버/카카오 버튼만 남긴다.
  const mapKey = opt.map === 'kakao' ? kakaoMapKey(w) : (w.features.map && w.features.map.naverClientId) || '';
  await writeEnv(work, opt.map === 'kakao'
    ? { VITE_APP_KAKAOMAP_JAVASCRIPT_KEY: mapKey }
    : { VITE_APP_NAVERMAPS_CLIENT_ID: mapKey });
  if (!mapKey) {
    const tag = opt.map === 'kakao' ? '<KakaoMap />' : '<Map />';
    await patch(join(work, 'src', 'layout', 'Location', 'Location.tsx'), [[tag, '']]);
    warnings.push(`${opt.map === 'kakao' ? '카카오맵 JS 키' : '네이버 지도 Client ID'}가 없어 지도 대신 지도 앱 버튼만 표시합니다`);
  }

  // 공유 미리보기(og)는 빌드 시점에 HTML 에 박는다.
  const desc = `${when.dateTimeKo} ${venueLine(w.venue)}`;
  const og = w.site.url ? new URL('thumbnail.jpg', w.site.url).href : './thumbnail.jpg';
  const html = join(work, 'index.html');
  let page = await readFile(html, 'utf8');
  page = page
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(w.site.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escapeHtml(desc)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${escapeHtml(w.site.url)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escapeHtml(w.site.title)}`)
    .replace(/(<meta name="description" property="og:description" content=")[^"]*/, `$1${escapeHtml(w.site.description || desc)}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${escapeHtml(og)}`);
  await writeFile(html, page);

  await install(work, log);
  log('Vite 빌드 중');
  viteBuild(work, out);
  return warnings;
}
