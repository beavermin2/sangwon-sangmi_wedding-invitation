// t06-juhonamnam: wedding.json → src/const.ts + images/index.ts + .env, Vite 빌드
// 원본은 const.ts 하나에 정보를 모아 두었지만 인사말·식사 안내는 컴포넌트에 직접 적혀 있어 함께 패치한다.
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  kstParts, pad2, parentName, parentPhone, bareName, mapLinks, kakaoKey, noticeOf, escapeHtml,
} from '../../scripts/lib/wedding.mjs';
import { prepareWork, install, writeEnv, viteBuild, patch } from '../../scripts/lib/vite.mjs';

// 공통 모듈: 템플릿의 카카오 공유 버튼 위에 붙이고, 공유 버튼은 템플릿 것을 쓴다.
export const addons = { mount: { selector: '.card-view > .share-button', where: 'beforebegin' }, share: false, accent: '#c27b7f' };

export const copySource = false;

const js = (v) => JSON.stringify(v);
// JSX 텍스트로 안전하게 넣기 위해 문자열 식으로 감싼다.
const jsxText = (s) => `{${js(s)}}`;

function people(p, side) {
  const self = { relation: side, name: p.name, phone: p.phone || '' };
  return [
    self,
    { relation: `${side} 아버지`, name: parentName(p.parents.father), phone: parentPhone(p.parents.father) },
    { relation: `${side} 어머니`, name: parentName(p.parents.mother), phone: parentPhone(p.parents.mother) },
  ].filter((x) => x.name);
}

// 연락처(전화) 목록과 계좌 목록을 원본 형식({relation, name, phone, account})으로 합친다.
function infoList(w, key, side) {
  const list = people(w[key], side).map((x) => ({ ...x, account: '' }));
  for (const a of w.accounts[key]) {
    const hit = list.find((x) => bareName(x.name) === a.owner);
    const text = `${a.bank} ${a.number}`;
    if (hit && !hit.account) hit.account = text;
    else list.push({ relation: a.relation === side ? side : `${side} ${a.relation}`, name: a.owner, phone: '', account: text });
  }
  return list;
}

export async function apply({ wedding: w, src, out, images, log }) {
  const warnings = [];
  const work = await prepareWork('t06-juhonamnam', src);
  const when = kstParts(w.ceremony.datetime);
  const links = mapLinks(w.venue);
  const place = [w.venue.name, w.venue.hall].filter(Boolean).join(' ');
  const firstName = (n) => n.slice(1);

  const constTs = `// scripts/build.mjs 가 data/wedding.json 에서 생성했습니다. 직접 고치지 마세요.
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import "dayjs/locale/ko"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale("ko")

export { dayjs }

export const WEDDING_DATE = dayjs.tz(${js(`${when.dateIso} ${pad2(when.h24)}:${pad2(when.mi)}`)}, "Asia/Seoul")
export const WEDDING_DATE_FORMAT = \`YYYY년 MMMM D일 dddd A h시\${WEDDING_DATE.minute() === 0 ? "" : " m분"}\`
export const HOLIDAYS: number[] = ${js((w.ceremony.holidays || []).map(Number))}

export const LOCATION = ${js(place)}
export const LOCATION_ADDRESS = ${js([w.venue.address, w.venue.floor].filter(Boolean).join(', '))}
export const SHARE_ADDRESS = ${js(w.venue.address)}
export const SHARE_ADDRESS_TITLE = LOCATION
export const WEDDING_HALL_POSITION = [${Number(w.venue.lng) || 0}, ${Number(w.venue.lat) || 0}]
export const NMAP_PLACE_ID = ${js(w.venue.naverPlaceId || '')}
export const KMAP_PLACE_ID = ${js(w.venue.kakaoPlaceId || '')}
// 장소 ID 가 없을 때도 열리도록 미리 만든 지도 링크
export const NMAP_WEB_URL = ${js(links.naver)}
export const NMAP_APP_URL = ${js(links.naverApp)}
export const KMAP_WEB_URL = ${js(links.kakao)}

export const BRIDE_FULLNAME = ${js(w.bride.name)}
export const BRIDE_FIRSTNAME = ${js(firstName(w.bride.name))}
export const BRIDE_TITLE = ${js(w.bride.relation)}
export const BRIDE_FATHER = ${js(parentName(w.bride.parents.father))}
export const BRIDE_MOTHER = ${js(parentName(w.bride.parents.mother))}
export const BRIDE_INFO = ${js(infoList(w, 'bride', '신부'))}

export const GROOM_FULLNAME = ${js(w.groom.name)}
export const GROOM_FIRSTNAME = ${js(firstName(w.groom.name))}
export const GROOM_TITLE = ${js(w.groom.relation)}
export const GROOM_FATHER = ${js(parentName(w.groom.parents.father))}
export const GROOM_MOTHER = ${js(parentName(w.groom.parents.mother))}
export const GROOM_INFO = ${js(infoList(w, 'groom', '신랑'))}
`;
  await writeFile(join(work, 'src', 'const.ts'), constTs);

  // 사진: 있으면 images/ 를 비우고 index.ts 를 다시 쓴다.
  const imgDir = join(work, 'src', 'images');
  const photos = images.gallery(w);
  if (photos.length || images.has(w.gallery.cover)) {
    const keepDemoCover = !images.has(w.gallery.cover);
    for (const f of await readdir(imgDir)) {
      if (f === 'index.ts' || (keepDemoCover && f === 'cover.png')) continue;
      if (photos.length) await rm(join(imgDir, f));
    }
    let coverName = 'cover.png';
    if (!keepDemoCover) {
      coverName = `wd-cover${extname(w.gallery.cover).toLowerCase()}`;
      await images.copy(w.gallery.cover, join(imgDir, coverName));
    }
    const gallery = [];
    for (let i = 0; i < photos.length; i++) {
      const name = `wd-${pad2(i + 1)}${extname(photos[i]).toLowerCase()}`;
      await images.copy(photos[i], join(imgDir, name));
      gallery.push(name);
    }
    const galleryNames = gallery.length ? gallery : Array.from({ length: 12 }, (_, i) => `image${i + 1}.png`);
    await writeFile(join(imgDir, 'index.ts'),
      `import coverImage from "./${coverName}"\n` +
      galleryNames.map((n, i) => `import image${i + 1} from "./${n}"`).join('\n') +
      `\n\nexport const COVER_IMAGE = coverImage\n\nexport const GALLERY_IMAGES = [\n` +
      galleryNames.map((_, i) => `  image${i + 1},`).join('\n') + '\n]\n');
  }
  if (!photos.length) warnings.push('갤러리 사진이 없어 데모 사진(AI 생성 이미지)을 씁니다');
  if (images.has(w.site.ogImage)) await images.copy(w.site.ogImage, join(work, 'public', 'preview_image.png'));

  // 인사말: 원본 문구 대신 wedding.json 의 문단으로
  const lines = w.greeting.message.split('\n')
    .map((l) => (l.trim() ? `        <div className="content">${jsxText(l)}</div>` : '        <div className="break" />'))
    .join('\n');
  await patch(join(work, 'src', 'component', 'invitation', 'index.tsx'), [[
    /\{\/\* 초대 문구 \*\/\}[\s\S]*?(\r?\n\s*<div className="break" \/>\s*\{\/\* 혼주 및 신랑 정보 \*\/\})/,
    (m, tail) => `{/* 초대 문구 */}\n${lines}${tail}`,
  ]]);

  // 식사 안내: 원본에 박힌 시간·장소 대신 notices 의 '식사' 항목
  const meal = noticeOf(w, '식사');
  await patch(join(work, 'src', 'component', 'information', 'index.tsx'), [[
    /식사시간: 12시 30분 ~ 14시 30분\s*<br \/>\s*장소: 지하 1층 연회장/,
    meal ? jsxText(meal) : jsxText('예식 후 식사가 준비되어 있습니다.'),
  ]]);
  if (!meal) warnings.push("notices 에 '식사' 항목이 없어 기본 문구를 씁니다");

  // 오시는 길: 원작 예식장의 교통 안내 대신 venue.transport (지하철·버스 → 대중교통, 자가용 → 자가용)
  const tr = w.venue.transport || [];
  const block = (items) => (items.length ? items.map((t) => `<div className="content">
            {${js(`* ${t.label}`)}}
            <br />
            {${js(t.detail)}}
          </div>`).join('\n          <div />\n          ') : '');
  const infoBlock = (icon, heading, items) => (items.length ? `
        <div className="location-info">
          <div className="transportation-icon-wrapper">
            <${icon} className="transportation-icon" />
          </div>
          <div className="heading">${heading}</div>
          <div />
          ${block(items)}
        </div>` : '');
  const parking = noticeOf(w, '주차');
  const car = tr.filter((t) => t.type === 'car').concat(parking ? [{ label: '주차', detail: parking }] : []);
  await patch(join(work, 'src', 'component', 'location', 'index.tsx'), [[
    /(\{\/\* 대중교통 및 자가용 안내 섹션 \*\/\}\n\s*<LazyDiv className="card location">)[\s\S]*?(\n\s*<\/LazyDiv>\n\s*<\/>)/,
    (m, head, tail) => head
      + infoBlock('BusIcon', '대중교통', tr.filter((t) => t.type !== 'car'))
      + infoBlock('CarIcon', '자가용', car) + tail,
  ]]);
  // 원작 결혼식의 실제 하객 메시지가 번들에 포함되지 않도록 비운다.
  await writeFile(join(work, 'src', 'component', 'guestbook', 'offlineGuestBook.json'), '[]\n');

  // 지도: 장소 ID 없이도 열리는 링크로, 네이버 지도 키가 없으면 지도 대신 링크 버튼
  const mapTsx = join(work, 'src', 'component', 'location', 'map.tsx');
  await patch(mapTsx, [
    ['  KMAP_PLACE_ID,\n  LOCATION,\n  NMAP_PLACE_ID,\n', '  KMAP_WEB_URL,\n  LOCATION,\n  NMAP_APP_URL,\n  NMAP_WEB_URL,\n'],
    ['`nmap://place?id=${NMAP_PLACE_ID}`', 'NMAP_APP_URL'],
    ['`https://map.naver.com/p/entry/place/${NMAP_PLACE_ID}`', 'NMAP_WEB_URL'],
    ['`https://map.kakao.com/link/map/${KMAP_PLACE_ID}`', 'KMAP_WEB_URL'],
    ['<div>Map is not available</div>',
      '<div className="navigation"><button onClick={() => window.open(NMAP_WEB_URL, "_blank")}>네이버 지도</button><button onClick={() => window.open(KMAP_WEB_URL, "_blank")}>카카오맵</button></div>'],
  ]);

  // 공유: 원본은 사이트 루트 배포를 가정한다. 하위 경로에서도 맞는 주소가 나오게 현재 위치 기준으로.
  await patch(join(work, 'src', 'component', 'shareButton', 'index.tsx'), [[
    'const baseUrl = import.meta.env.BASE_URL',
    'const baseUrl = window.location.pathname.replace(/\\/[^/]*$/, "")',
  ]]);

  // manifest 를 원본이 고정한 build/ 대신 실제 출력 폴더에 쓴다.
  await patch(join(work, 'vite.config.ts'), [['const distFolder = "build"', `const distFolder = ${js(out.replace(/\\/g, '/'))}`]]);

  // og 와 public 자산 경로를 상대 경로로(하위 경로 배포 대응)
  const desc = `${when.dateTimeKo} ${place}`;
  const og = w.site.url ? new URL('preview_image.png', w.site.url).href : './preview_image.png';
  const html = join(work, 'index.html');
  let page = await readFile(html, 'utf8');
  page = page
    .replace('content="/preview_image.png"', `content="${escapeHtml(og)}"`)
    .replace('content="%BASE_URL%/"', `content="${escapeHtml(w.site.url)}"`)
    .replace('content="<%= DESCRIPTION %>"', `content="${escapeHtml(w.site.description || desc)}"`)
    .replace(/href="\/(MapoGoldenPierA\.woff|AlluraRegular\.woff|manifest\.json|favicon\.ico|font\.css)"/g, 'href="./$1"')
    .replace('<html lang="en">', '<html lang="ko">');
  await writeFile(html, page);

  // 방명록·참석 의사는 원작자 서버(Go)가 있어야 동작하므로 정적 모드로 끄고 공통 모듈이 대신한다.
  await writeEnv(work, {
    VITE_NAVER_MAP_CLIENT_ID: (w.features.map && w.features.map.naverClientId) || '',
    VITE_KAKAO_SDK_JS_KEY: kakaoKey(w),
    VITE_SERVER_URL: '',
    VITE_STATIC_ONLY: 'true',
  });
  if (!kakaoKey(w)) warnings.push('카카오 JS 키가 없어 카카오톡 공유 버튼이 동작하지 않습니다');
  if (!(w.features.map && w.features.map.naverClientId)) warnings.push('네이버 지도 Client ID 가 없어 지도 대신 지도 링크 버튼을 표시합니다');

  await install(work, log);
  log('Vite 빌드 중');
  viteBuild(work, out);
  return warnings;
}
