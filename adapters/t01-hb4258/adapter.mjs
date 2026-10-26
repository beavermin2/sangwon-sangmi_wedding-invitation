// t01-hb4258: wedding.json → config.js (window.CONFIG)
// 템플릿은 config.js 하나만 읽으므로 그 파일을 새로 쓰고, 사진은 assets/ 아래로 옮긴다.
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  kstParts, parentName, parentPhone, accountLabel, kakaoKey, venueLine, escapeHtml,
} from '../../scripts/lib/wedding.mjs';

const ICON = { subway: 'M', bus: 'B', car: 'P' };

function person(p, images, warn, fallbackPhoto) {
  if (!images.has(p.photo)) warn(`${p.name} 사진이 없어 데모 사진을 씁니다`);
  return {
    name: p.name,
    nameEn: { first: p.nameEn.first, full: `${p.nameEn.last} ${p.nameEn.first}`.toUpperCase() },
    roleKo: p.relation,
    parents: {
      father: parentName(p.parents.father),
      mother: parentName(p.parents.mother),
      fatherRole: '아버지',
      motherRole: '어머니',
      fatherPhone: parentPhone(p.parents.father),
      motherPhone: parentPhone(p.parents.mother),
    },
    phone: p.phone,
    photo: images.has(p.photo) ? `wd/${p.photo.split('/').pop()}` : fallbackPhoto,
  };
}

// 공통 모듈: 템플릿의 카카오 공유 섹션 바로 위에 붙이고, 공유 버튼은 템플릿 것을 쓴다.
export const addons = { mount: { selector: '#root section:nth-last-of-type(2)', where: 'beforebegin' }, share: false, accent: '#9c7a5b' };

export async function apply({ wedding: w, out, images }) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const assets = join(out, 'assets');

  // 사진: 있는 것만 assets/wd/ 로 복사, 없으면 템플릿 기본 파일명 유지
  const wd = (rel, fallback) => {
    if (!images.has(rel)) return fallback;
    return `wd/${rel.split('/').pop()}`;
  };
  for (const rel of [w.gallery.cover, w.groom.photo, w.bride.photo, w.site.ogImage, w.site.favicon]) {
    await images.copy(rel, join(assets, 'wd', String(rel).split('/').pop()));
  }
  const groom = person(w.groom, images, warn, 'groom.jpg');
  const bride = person(w.bride, images, warn, 'bride.jpg');

  // 갤러리: 사진이 하나라도 있으면 데모 사진을 지우고 01, 02 … 로 채운다.
  const photos = images.gallery(w);
  if (photos.length) {
    const dir = join(assets, 'gallery');
    for (const f of await readdir(dir)) await rm(join(dir, f));
    for (let i = 0; i < photos.length; i++) {
      await images.copy(photos[i], join(dir, String(i + 1).padStart(2, '0') + extname(photos[i]).toLowerCase()));
    }
  } else {
    warn('갤러리 사진이 없어 데모 사진을 씁니다');
  }

  const when = kstParts(w.ceremony.datetime);
  const config = {
    meta: {
      title: w.site.title,
      description: w.site.description,
      siteUrl: w.site.url || 'https://YOURNAME.github.io/',
      ogImage: wd(w.site.ogImage, 'og.jpg'),
      favicon: wd(w.site.favicon, 'favicon.png'),
      heroImage: wd(w.gallery.cover, 'hero.jpg'),
      kakaoAppKey: kakaoKey(w),
    },
    quote: { text: w.greeting.quote.text || '', author: w.greeting.quote.author || '' },
    groom,
    bride,
    date: { datetime: w.ceremony.datetime },
    venue: {
      name: w.venue.name,
      hall: w.venue.hall,
      floor: w.venue.floor,
      address: w.venue.address,
      addressDetail: w.venue.addressDetail,
      phone: w.venue.phone,
      lat: w.venue.lat,
      lng: w.venue.lng,
    },
    invitation: w.greeting.message,
    transport: (w.venue.transport || []).map((t) => ({ label: t.label, icon: ICON[t.type] || '•', detail: t.detail })),
    notices: w.notices || [],
    accounts: {
      note: w.accounts.note,
      groom: w.accounts.groom.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
      bride: w.accounts.bride.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
    },
    // 자동 탐색은 번호×확장자마다 404 요청을 남기므로 실제 파일 목록을 넘긴다.
    gallery: { files: (await readdir(join(assets, 'gallery'))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort(), maxScan: 30 },
  };
  if (!config.meta.kakaoAppKey) warn('카카오 JS 키가 없어 카카오 공유·지도가 꺼집니다');

  await writeFile(join(out, 'config.js'),
    '// scripts/build.mjs 가 data/wedding.json 에서 생성했습니다. 직접 고치지 마세요.\n' +
    `window.CONFIG = ${JSON.stringify(config, null, 2)};\n`);

  // 카카오톡·문자 미리보기는 JS를 실행하지 않으므로 og 태그를 HTML에 직접 박는다.
  const page = join(out, 'index.html');
  let html = await readFile(page, 'utf8');
  const og = {
    'og:title': w.site.title,
    'og:description': w.site.description || `${when.dateTimeKo} · ${venueLine(w.venue)}`,
    'og:url': w.site.url,
    'og:image': w.site.url ? new URL(`assets/${config.meta.ogImage}`, w.site.url).href : `./assets/${config.meta.ogImage}`,
  };
  for (const [k, v] of Object.entries(og)) {
    html = html.replace(new RegExp(`(<meta property="${k}" content=")[^"]*(")`), `$1${escapeHtml(v)}$2`);
  }
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(og['og:description'])}$2`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(w.site.title)}</title>`);
  await writeFile(page, html);
  return warnings;
}
