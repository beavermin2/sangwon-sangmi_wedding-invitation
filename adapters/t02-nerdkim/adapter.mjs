// t02-nerdkim: wedding.json → {{TOKEN}} 치환 + js/data.js
// 원본 static/build.sh 가 하는 일(토큰 치환, window.__WEDDING__ 주입, 계좌 난독화)을
// Node 로 옮겼다. bash 없이 Windows 에서도 같은 결과가 나온다.
import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  kstParts, pad2, parentName, enFull, transportOf, noticeOf, mapLinks, accountLabel, kakaoKey,
  DAY_KO, DAY_EN, MONTH_EN,
} from '../../scripts/lib/wedding.mjs';

// 공통 모듈: 맺음말(footer) 위에 붙이고, 공유 버튼은 템플릿 것을 쓴다.
export const addons = { mount: { selector: '.paper > footer', where: 'beforebegin' }, share: false, accent: '#c06c84' };

export const srcDir = 'static/src';

const DEMO = {
  main: 'demo-cover.jpg', mainDev: 'demo-cover-dev.jpg', bless: 'demo-bless.jpg',
  groom: 'demo-groom.jpg', bride: 'demo-bride.jpg',
  gallery: ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((n) => `demo-g${n}.jpg`),
};

// src/js/private.js 의 deobfuscate 와 1:1 대응. 암호화가 아니라 검색·수집 차단용이다.
function obfuscate(text) {
  const bytes = Buffer.from(text, 'utf8');
  const salt = randomInt(1, 256);
  const out = Buffer.alloc(bytes.length + 1);
  out[0] = salt;
  let k = salt;
  for (let j = 0; j < bytes.length; j++) {
    k = (k * 31 + 17 + j) & 0xff;
    out[j + 1] = bytes[j] ^ k;
  }
  return out.toString('base64');
}

const br = (s) => String(s || '').replace(/[<>]/g, '').replace(/\n/g, '<br />');
const handle = (n) => (n.first || '').toLowerCase().replace(/-/g, '');
const branch = (n) => enFull(n).toLowerCase().trim().replace(/\s+/g, '-');

export async function apply({ wedding: w, out, images }) {
  const warnings = [];
  const opt = (w.templateOptions && w.templateOptions['t02-nerdkim']) || {};
  const ext = { groom: opt.groom || {}, bride: opt.bride || {} };
  const when = kstParts(w.ceremony.datetime);
  const firstMet = kstParts(opt.firstMetAt || w.ceremony.datetime);
  const origin = (w.site.url || '').replace(/\/+$/, '');
  const links = mapLinks(w.venue);

  // 사진: 있는 것만 photos/ 로 복사하고, 없으면 데모 사진 이름을 그대로 쓴다.
  const photosDir = join(out, 'photos');
  const photo = async (rel, fallback) => {
    if (!images.has(rel)) return fallback;
    const name = `wd-${rel.split('/').pop()}`;
    await images.copy(rel, join(photosDir, name));
    return name;
  };
  const userGallery = images.gallery(w);
  const gallery = [];
  for (let i = 0; i < userGallery.length; i++) {
    const name = `wd-g${pad2(i + 1)}${extname(userGallery[i]).toLowerCase()}`;
    await images.copy(userGallery[i], join(photosDir, name));
    gallery.push(name);
  }
  if (!gallery.length) warnings.push('갤러리 사진이 없어 데모 사진을 씁니다');
  const cover = await photo(w.gallery.cover, null);
  const photos = {
    main: cover || DEMO.main,
    mainDev: cover || DEMO.mainDev,
    bless: gallery.length ? gallery[gallery.length - 1] : DEMO.bless,
    gallery: gallery.length ? gallery : DEMO.gallery,
    galleryPageOrder: { main: [], dev: [] },
  };
  const ogImage = await photo(w.site.ogImage, null);

  const person = async (key) => {
    const p = w[key];
    return {
      name: p.name,
      short: p.name.slice(1),
      en: enFull(p.nameEn),
      initial: p.name.slice(1, 2),
      role: ext[key].role || '',
      parents: [parentName(p.parents.father), parentName(p.parents.mother)].filter(Boolean),
      rankKo: p.relation,
      rank: ext[key].rankExpr || '',
      mbti: ext[key].mbti || '',
      hobby: ext[key].hobby || '',
      note: ext[key].note || '',
      photo: await photo(p.photo, DEMO[key]),
      photoFocus: '50% 30%',
      photoZoom: 1,
    };
  };
  const groom = await person('groom');
  const bride = await person('bride');
  const subway = transportOf(w.venue, 'subway');

  const data = {
    at: w.ceremony.datetime,
    firstMetAt: opt.firstMetAt || w.ceremony.datetime,
    groom, bride,
    venue: {
      name: w.venue.name, hall: w.venue.hall, address: w.venue.address, floor: w.venue.floor,
      addressCopy: [w.venue.address, w.venue.name, w.venue.floor].filter(Boolean).join(' '),
      subway, subwayShort: subway.split(/[,·]/)[0].trim(),
      lat: w.venue.lat || 0, lng: w.venue.lng || 0, zoom: 17,
    },
    map: links,
    photos,
  };
  const gift = {
    accounts: {
      groom: w.accounts.groom.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
      bride: w.accounts.bride.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
    },
  };

  const js = (v) => JSON.stringify(v);
  const lines = [
    '/* scripts/build.mjs 가 data/wedding.json 에서 생성했습니다. 직접 고치지 마세요. */',
    "window.__INV__='.';",
    "window.__PHOTOS__='photos/';",
    origin ? `window.__ORIGIN__=${js(origin)};` : '',
    // 방명록은 공통 모듈 단계에서 연결한다. 지금은 API 없음으로 두어 요청을 보내지 않는다.
    'window.__NO_API__=true;',
    `window.__WEDDING__=${js(data)};`,
    `window.__NAVER_MAP_KEY__=${js((w.features.map && w.features.map.naverClientId) || '')};`,
    `window.__KAKAO_KEY__=${js(kakaoKey(w))};`,
    'window.__GA_ID__="";',
    `window.__GIFT__=${js(obfuscate(JSON.stringify(gift)))};`,
  ].filter(Boolean);
  await writeFile(join(out, 'js', 'data.js'), lines.join('\n') + '\n');

  const photoUrl = (f) => (f && origin ? `${origin}/photos/${f}` : '');
  const ogMain = photoUrl(ogImage || photos.main);
  const ogDev = photoUrl(ogImage || photos.mainDev);
  const dow = when.dow;
  const tok = {
    GROOM_NAME: groom.name, GROOM_NAME_SHORT: groom.short, GROOM_NAME_EN: groom.en, GROOM_ROLE: groom.role,
    GROOM_PARENTS: groom.parents.join(' '), GROOM_PARENTS_0: groom.parents[0] || '', GROOM_PARENTS_1: groom.parents[1] || '',
    GROOM_RANK_KO: groom.rankKo, GROOM_RANK_EXPR: groom.rank,
    GROOM_EN_FIRST: w.groom.nameEn.first, GROOM_EN_LAST: w.groom.nameEn.last,
    GROOM_HANDLE: handle(w.groom.nameEn), GROOM_BRANCH: branch(w.groom.nameEn),
    BRIDE_NAME: bride.name, BRIDE_NAME_SHORT: bride.short, BRIDE_NAME_EN: bride.en, BRIDE_ROLE: bride.role,
    BRIDE_PARENTS: bride.parents.join(' '), BRIDE_PARENTS_0: bride.parents[0] || '', BRIDE_PARENTS_1: bride.parents[1] || '',
    BRIDE_RANK_KO: bride.rankKo, BRIDE_RANK_EXPR: bride.rank,
    BRIDE_EN_FIRST: w.bride.nameEn.first, BRIDE_EN_LAST: w.bride.nameEn.last,
    BRIDE_HANDLE: handle(w.bride.nameEn), BRIDE_BRANCH: branch(w.bride.nameEn),
    VENUE_NAME: w.venue.name, VENUE_HALL: w.venue.hall, VENUE_ADDRESS: w.venue.address, VENUE_FLOOR: w.venue.floor,
    VENUE_ADDRESS_FULL: [w.venue.address, w.venue.floor].filter(Boolean).join(' '),
    VENUE_SUBWAY: data.venue.subway, VENUE_SUBWAY_SHORT: data.venue.subwayShort,
    MAP_NAVER_URL: links.naver, MAP_KAKAO_URL: links.kakao,
    WEDDING_DATE_KO: when.dateKo, WEDDING_TIME_KO: when.timeKo, WEDDING_DATETIME_KO: when.dateTimeKo,
    WEDDING_DATE_ISO: when.dateIso, WEDDING_DATE_DOT: when.dateDot, WEDDING_YEAR: String(when.y),
    WEDDING_YEAR_MONTH_KO: `${when.y}년 ${when.m}월`, WEDDING_MONTH_EN: MONTH_EN[when.m - 1],
    WEDDING_DAY_EN: DAY_EN[dow], WEDDING_DAY_KO_SHORT: DAY_KO[dow],
    WEDDING_TIME_EN: `${when.ampm} ${when.h12}:${pad2(when.mi)}`,
    WEDDING_CLOCK_KST: `${DAY_EN[dow][0]}${DAY_EN[dow].slice(1).toLowerCase()} ${when.dateIso} ${pad2(when.h24)}:${pad2(when.mi)}:00 KST`,
    FIRST_MET_ISO: firstMet.dateIso,
    INFO_SUBWAY: br(subway), INFO_BUS: br(transportOf(w.venue, 'bus')),
    INFO_PARKING: br(noticeOf(w, '주차') || transportOf(w.venue, 'car')), INFO_MEAL: br(noticeOf(w, '식사')),
    OG_IMAGE_MAIN: ogMain, OG_IMAGE_DEV: ogDev, OG_IMAGE_TERMINAL: ogDev,
    HOST: origin.replace(/^https?:\/\//, ''),
  };

  // 빈 줄로 나뉜 인사말 문단을 원본과 같은 <p> 구조로
  const greeting = w.greeting.message.split(/\n\s*\n/)
    .map((para) => `\n      <p>\n        ${br(para).replace(/<br \/>/g, '<br />\n        ')}\n      </p>`).join('');
  const versionNote = opt.versionNote || '재미로 준비한 개발자 버전과 터미널 버전도 편하게 둘러봐 주세요!';

  const files = (await readdir(out)).filter((f) => f.endsWith('.html'));
  const left = new Set();
  for (const f of files) {
    let html = await readFile(join(out, f), 'utf8');
    html = html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
      if (k === 'PAGE_URL') return origin ? `${origin}/${f}` : '';
      return k in tok ? String(tok[k]) : (left.add(k), m);
    });
    html = html.replace('<script src="js/config.js"', '<script src="js/data.js"></script><script src="js/config.js"');
    html = html.replace(/<!--#PRIVATE#-->/g, '');
    // 원본이 토큰 없이 박아 둔 값들: 예식 시각, 인사말, 원작 커플 소개 문구
    html = html.replace('<div class="when-time">오전 11시</div>', `<div class="when-time">${when.timeKo}</div>`);
    html = html.replace('id="envTime">"오전 11시"', `id="envTime">"${when.timeKo}"`);
    html = html.replace(/(<div class="greeting rv d1">)[\s\S]*?(\n    <\/div>)/, (m, open, close) => open + greeting + close);
    html = html.replace(/(<div class="version-note">)[\s\S]*?(<\/div>)/, `$1\n      ${br(versionNote)}\n    $2`);
    // og:image 가 비면 카카오가 깨진 카드를 보여 주므로 태그를 지운다.
    if (!ogMain) html = html.replace(/^.*<meta property="og:image.*\n/gm, '');
    await writeFile(join(out, f), html);
  }
  if (left.size) warnings.push(`치환되지 않은 토큰: ${[...left].join(', ')}`);

  const def = ['main', 'developer', 'terminal'].includes(opt.defaultVersion) ? opt.defaultVersion : 'main';
  await copyFile(join(out, `${def}.html`), join(out, 'index.html'));

  // 원본과 같은 안전장치: 결과물에 평문 계좌번호가 남으면 실패시킨다.
  const all = await Promise.all((await readdir(out)).filter((f) => /\.(html|js)$/.test(f)).map((f) => readFile(join(out, f), 'utf8')));
  const jsDir = await Promise.all((await readdir(join(out, 'js'))).map((f) => readFile(join(out, 'js', f), 'utf8')));
  const text = all.concat(jsDir).join('\n');
  for (const a of w.accounts.groom.concat(w.accounts.bride)) {
    if (a.number.length >= 6 && !/^[0-]+$/.test(a.number) && text.includes(a.number)) {
      throw new Error(`계좌번호 ${a.number} 가 결과물에 평문으로 남았습니다`);
    }
  }
  if (!kakaoKey(w)) warnings.push('카카오 JS 키가 없어 공유 시 링크 복사로 대체됩니다');
  return warnings;
}
