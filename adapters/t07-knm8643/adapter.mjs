// t07-knm8643: wedding.json → src/wedding.js 생성 후 Vite 빌드
// 원본은 디자인 4종을 고르는 소개 사이트이고 값이 Vue 컴포넌트마다 직접 박혀 있다.
// 벚꽃이 흩날리는 Blooming Plus 디자인 하나만 루트(/)에 띄우고, 쓰는 컴포넌트만
// 공통 데이터 모듈(W)을 읽도록 고친다. 광고·분석·소개 화면은 결과물에서 뺀다.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { prepareWork, install, writeEnv, patch, viteBuild } from '../../scripts/lib/vite.mjs';
import {
  kstParts, pad2, parentName, parentPhone, accountLabel, mapLinks, kakaoKey, kakaoMapKey,
  venueLine, transportOf, noticeOf, escapeHtml as e,
} from '../../scripts/lib/wedding.mjs';

// 공통 모듈: 내부 스크롤 영역(.blooming-wrap) 끝에 붙인다. body 끝에 붙이면 스크롤 영역 밖이라 보이지 않는다.
// 본문 전체가 z-index 1000 의 고정 팝업(.mobile-popup) 안에 그려지므로 배경 효과는 그 위 층에 둔다.
export const addons = { mount: { selector: '.blooming-wrap', where: 'beforeend' }, accent: '#d4788f', effectZ: 1001 };

export const copySource = false;

const C = 'src/components/blooming';
// 원본 데모 사진 (원작 커플 사진)
const DEMO = { cover: '09', groom: '11', bride: '03', highlights: [4, 9, 7] };

// 원본 파일이 CRLF 라서 패치 전에 LF 로 맞춘다.
async function lf(file) {
  await writeFile(file, (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'));
}

// 컴포넌트에서 W 를 쓸 수 있게 한다(Options API 의 setup 반환값).
const USE_W = ['export default {', "import { W } from '@/wedding.js';\n\nexport default {\n  setup() { return { W }; },"];

function contacts(p, who) {
  return [
    { label: `${who}에게 연락하기`, phone: p.phone || '' },
    { label: `${who}측 혼주 아버지 연락하기`, phone: parentPhone(p.parents.father) },
    { label: `${who}측 혼주 어머니 연락하기`, phone: parentPhone(p.parents.mother) },
  ].filter((c) => c.phone);
}

const sides = (groom, bride) => [{ title: '신랑측', list: groom }, { title: '신부측', list: bride }]
  .filter((s) => s.list.length);

// 사진: 사용자 사진은 src/assets/wd/ 로 복사해 import, 없으면 데모 사진 경로
async function photos(w, work, images, warn) {
  const dir = join(work, 'src', 'assets', 'wd');
  const demo = (n) => `./assets/images/${n}.jpg`;
  const one = async (rel, name, fallback, msg) => {
    if (!images.has(rel)) {
      if (msg) warn(msg);
      return fallback;
    }
    const file = `${name}${extname(rel).toLowerCase()}`;
    await images.copy(rel, join(dir, file));
    return `./assets/wd/${file}`;
  };
  const cover = await one(w.gallery.cover, 'cover', demo(DEMO.cover), '대표 사진이 없어 데모 사진을 씁니다');
  const groom = await one(w.groom.photo, 'groom', demo(DEMO.groom), `${w.groom.name} 사진이 없어 데모 사진을 씁니다`);
  const bride = await one(w.bride.photo, 'bride', demo(DEMO.bride), `${w.bride.name} 사진이 없어 데모 사진을 씁니다`);
  const list = images.gallery(w);
  const gallery = [];
  for (let i = 0; i < list.length; i++) gallery.push(await one(list[i], `g${pad2(i + 1)}`, ''));
  let highlights = [0, 1, 2];
  if (!gallery.length) {
    warn('갤러리 사진이 없어 데모 사진을 씁니다 (원작 커플의 사진이므로 배포 전 반드시 교체하세요)');
    for (let n = 1; n <= 12; n++) gallery.push(demo(pad2(n)));
    highlights = DEMO.highlights;
  }
  return { cover, groom, bride, gallery, highlights };
}

function weddingModule(w, ph) {
  const when = kstParts(w.ceremony.datetime);
  const parking = noticeOf(w, '주차');
  const directions = (w.venue.transport || []).map((t) => ({ label: t.label, detail: t.detail }));
  if (!transportOf(w.venue, 'car')) {
    directions.push({ label: '내비게이션', detail: `내비게이션에 " ${w.venue.name} " 을 검색 후 길 안내를 받으세요.` });
  }
  (w.notices || []).filter((n) => n.detail !== parking)
    .forEach((n) => directions.push({ label: n.title, detail: n.detail }));
  const acc = (list) => (list || []).map((a) => ({
    label: accountLabel(a), bank: a.bank, number: a.number, kakaopay: a.kakaopay || '',
  }));
  const parents = (p) => [parentName(p.parents.father), parentName(p.parents.mother)].filter(Boolean).join(' · ');
  const data = {
    datetime: w.ceremony.datetime,
    dateShort: `${String(when.y).slice(2)}.${pad2(when.m)}.${pad2(when.d)}`,
    dateDot: when.dateDot,
    dateKoShort: `${when.y}년 ${when.m}월 ${when.d}일`,
    dateTimeKo: when.dateTimeKo,
    groom: { name: w.groom.name, relation: w.groom.relation, parents: parents(w.groom) },
    bride: { name: w.bride.name, relation: w.bride.relation, parents: parents(w.bride) },
    // 빈 줄로 문단을 나누고 문단 안은 줄 단위로 둔다(템플릿의 span·br 구조 유지)
    greeting: w.greeting.message.split(/\n\s*\n/).map((p) => p.split('\n')),
    contacts: sides(contacts(w.groom, '신랑'), contacts(w.bride, '신부')),
    accounts: sides(acc(w.accounts.groom), acc(w.accounts.bride)),
    venue: {
      name: w.venue.name, line: venueLine(w.venue), address: w.venue.address,
      lat: w.venue.lat || '', lng: w.venue.lng || '', parking,
    },
    directions,
    links: mapLinks(w.venue),
    kakaoMapKey: kakaoMapKey(w),
  };
  const imgs = [ph.cover, ph.groom, ph.bride].concat(ph.gallery);
  const imports = imgs.map((p, i) => `import img${i} from '${p}';`).join('\n');
  const galleryRefs = ph.gallery.map((p, i) => `img${i + 3}`).join(', ');
  return `// scripts/build.mjs 가 data/wedding.json 으로 생성했습니다. 직접 고치지 마세요.
${imports}

export const W = ${JSON.stringify(data, null, 2)};

W.cover = img0;
W.groomPhoto = img1;
W.bridePhoto = img2;
W.gallery = [${galleryRefs}];

// 사진 목록: 앞 3장은 문구와 함께 크게, 5번째부터는 '추가 사진 보기' 그리드(원본 구조)
const caps = ['사진을<br/> 클릭해보세요', '저희<br/> 결혼합니다!', '함께<br/>해주세요!'];
const hl = ${JSON.stringify(ph.highlights)};
W.photoList = caps.map((text, i) => ({ src: W.gallery[hl[i] % W.gallery.length], alt: '사진', text }))
  .concat([{ src: W.gallery[0], alt: '사진', text: '' }])
  .concat(W.gallery.map((src, i) => ({ src, alt: '사진 ' + (i + 1), text: '' })));
`;
}

// 루트(/)에 Blooming Plus 하나만 띄운다. 레이아웃은 MobilePopup 과 같다.
const VIEW = `<template>
  <div class="mobile-popup">
    <div class="popup-content">
      <BloomingPlus/>
    </div>
  </div>
</template>

<script>
import BloomingPlus from '@/components/blooming/BloomingPlus.vue';

export default {
  name: 'WeddingView',
  components: { BloomingPlus },
};
</script>

<style scoped lang="scss">
.mobile-popup {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #f0f0f0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;

  .popup-content {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 -4px 6px rgba(0, 0, 0, 0.1);
    height: 100%;
    width: 100%;
    overflow-y: scroll;
    max-width: 475px;
    position: relative;
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}
</style>
`;

function head(w, og) {
  const tags = [
    `<title>${e(w.site.title)}</title>`,
    `<meta name="description" content="${e(w.site.description)}">`,
    `<meta property="og:title" content="${e(w.site.title)}">`,
    `<meta property="og:description" content="${e(w.site.description)}">`,
    og ? `<meta property="og:image" content="${e(og)}">` : null,
    w.site.url ? `<meta property="og:url" content="${e(w.site.url)}">` : null,
    '<meta property="og:type" content="website">',
    '<link rel="icon" href="favicon.png">',
    '',
    '<!-- 카카오 SDK (초기화는 src/main.js 에서 키가 있을 때만) -->',
    '<script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"',
    '        integrity="sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka" crossorigin="anonymous"></script>',
    '',
    '<!-- 공용 CSS -->',
  ].filter((t) => t !== null);
  return tags.join('\n      ');
}

// 작업 사본을 고친다(설치·빌드 전 단계).
export async function patchWork({ wedding: w, work, images, warn }) {
  const f = (rel) => join(work, rel);
  const files = [
    'index.html', 'src/App.vue', 'src/main.js', 'src/router/index.js',
    `${C}/BloomingPlus.vue`, `${C}/bigBanner/BigBannerPlus.vue`, `${C}/intro/IntroPlus.vue`,
    `${C}/intro/IntroPlusFont.vue`, `${C}/photo/PhotoPlus.vue`, `${C}/photo/PhotoPlusList.vue`,
    `${C}/calender/CalenderPlus.vue`, `${C}/calender/CalenderPlusTemplate.vue`,
    `${C}/address/AddressPlus.vue`, `${C}/letter/LetterDefault.vue`,
  ];
  for (const rel of files) await lf(f(rel));

  // 데이터 모듈과 루트 화면
  const ph = await photos(w, work, images, warn);
  await writeFile(f('src/wedding.js'), weddingModule(w, ph));
  await writeFile(f('src/WeddingView.vue'), VIEW);

  // 공유 썸네일·파비콘은 public/ 에 둔다
  let og = '';
  const ogSrc = images.has(w.site.ogImage) ? w.site.ogImage : images.has(w.gallery.cover) ? w.gallery.cover : '';
  if (ogSrc) {
    og = `og${extname(ogSrc).toLowerCase()}`;
    await images.copy(ogSrc, f(`public/${og}`));
    if (w.site.url) og = new URL(og, w.site.url).href;
  } else {
    warn('공유 썸네일(site.ogImage) 사진이 없어 og:image 를 넣지 않았습니다');
  }
  if (images.has(w.site.favicon)) {
    if (extname(w.site.favicon).toLowerCase() !== '.png') warn('파비콘은 PNG 로 넣어 주세요 (favicon.png 로 복사됨)');
    await images.copy(w.site.favicon, f('public/favicon.png'));
  } else {
    warn('파비콘이 없어 원작 사이트의 파비콘을 씁니다');
  }
  // 원작자의 AdSense 인증 파일
  await rm(f('public/ads.txt'), { force: true });

  // index.html: 원작 메타·GA·AdSense·EmailJS CDN 제거, wedding.json 메타로 교체
  await patch(f('index.html'), [
    [/<title>[\s\S]*?<!-- 공용 CSS -->/, head(w, og)],
  ]);

  // 원작자 콘솔 배너(연락처) 제거
  await patch(f('src/App.vue'), [
    [/\n<script>\nexport default \{\n {2}mounted\(\) \{[\s\S]*?\n<\/script>\n/, '\n'],
  ]);

  // 카카오 SDK: 키가 없으면 초기화하지 않는다
  await patch(f('src/main.js'), [
    ["app.mount('#app');", "const kakaoKey = import.meta.env.VITE_KAKAO_API_KEY;\nif (kakaoKey && window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(kakaoKey);\n\napp.mount('#app');"],
  ]);

  // 라우터: 소개 사이트 대신 청첩장 하나, 하위 경로에서도 열리도록 해시 라우팅
  await patch(f('src/router/index.js'), [
    ['createWebHistory', 'createWebHashHistory'],
    ["import MainView from '../views/MainViews.vue';\nimport MobilePopup from '../components/MobilePopup.vue';",
      "import WeddingView from '../WeddingView.vue';"],
    [/const routes = \[[\s\S]*?\n\];/, "const routes = [\n    { path: '/', name: 'WeddingView', component: WeddingView },\n    { path: '/:pathMatch(.*)*', redirect: '/' },\n];"],
  ]);

  // 원본의 편지 보내기(EmailJS) 폼은 붙이지 않는다. 참석 여부·방명록은 공통 모듈(addons/)이 담당한다.

  // 대표 사진
  await patch(f(`${C}/bigBanner/BigBannerPlus.vue`), [
    ['src="../../../assets/images/09.jpg"', ':src="W.cover"'],
    USE_W,
  ]);

  // 날짜
  await patch(f(`${C}/intro/IntroPlus.vue`), [
    ['      25.11.21\n', '      {{ W.dateShort }}\n'],
    USE_W,
  ]);

  // 신랑·신부 사진과 이름
  await patch(f(`${C}/photo/PhotoPlus.vue`), [
    ['src="../../../assets/images/11.jpg"', ':src="W.groomPhoto"'],
    ['<p>충디딥</p>', '<p>{{ W.groom.name }}</p>'],
    ['<p>유디딥</p>', '<p>{{ W.bride.name }}</p>'],
    ['src="../../../assets/images/03.jpg"', ':src="W.bridePhoto"'],
    USE_W,
  ]);

  // 갤러리
  await patch(f(`${C}/photo/PhotoPlusList.vue`), [
    [/import img1 from[\s\S]*?import img12 from "@\/assets\/images\/12.jpg";\n/, ''],
    [/ {6}images: \[[\s\S]*?\n {6}\],/, '      images: W.photoList,'],
    USE_W,
  ]);

  // 인사말·혼주·연락처
  await patch(f(`${C}/intro/IntroPlusFont.vue`), [
    [/<div class="font-wrap">[\s\S]*?<\/div>/, `<div class="font-wrap">
        <template v-for="(para, i) in W.greeting" :key="i">
          <br v-if="i"/>
          <span><template v-for="(line, j) in para" :key="j"><br v-if="j"/>{{ line }}</template></span>
        </template>
      </div>`],
    [/<p>김두환 · 홍길동<\/p>\s*<span>의 아들<\/span>\s*<p>충디딥<\/p>/,
      '<p v-if="W.groom.parents">{{ W.groom.parents }}</p>\n        <span v-if="W.groom.parents">의 {{ W.groom.relation }}</span>\n        <p>{{ W.groom.name }}</p>'],
    [/<p>이두환<\/p>\s*<span>의 딸<\/span>\s*<p>유디딥<\/p>/,
      '<p v-if="W.bride.parents">{{ W.bride.parents }}</p>\n        <span v-if="W.bride.parents">의 {{ W.bride.relation }}</span>\n        <p>{{ W.bride.name }}</p>'],
    [/<div class="content-box">\s*<button @click="openPopup">/, '<div class="content-box" v-if="W.contacts.length">\n        <button @click="openPopup">'],
    [/<!-- 신랑측 -->[\s\S]*?(?=\n\s*<!-- 닫기 버튼 -->)/, `<div class="pop-wrap" v-for="side in W.contacts" :key="side.title">
            <h3>&lt;{{ side.title }}&gt;</h3>
            <div class="pop-sub-wrap" v-for="c in side.list" :key="c.label">
              <span>{{ c.label }}</span>
              <p>
                <a :href="'tel:' + c.phone" class="contact-link">
                  <i class="fas fa-phone-alt"></i>
                </a>
                <a :href="'sms:' + c.phone" class="contact-link">
                  <i class="fas fa-sms"></i>
                </a>
              </p>
            </div>
          </div>`],
    USE_W,
  ]);

  // 예식장·달력
  await patch(f(`${C}/calender/CalenderPlus.vue`), [
    [/<p>서울 용산구 이태원로 29<\/p>\s*<span>로얄파크컨벤션<\/span>\s*<p>주차 가능 \(발렛 서비스 제공\)<\/p>/,
      '<p>{{ W.venue.address }}</p>\n      <span>{{ W.venue.line }}</span>\n      <p v-if="W.venue.parking">{{ W.venue.parking }}</p>'],
    [":days=\"'2025.11.21'\"", ':days="W.dateDot"'],
    USE_W,
  ]);
  await patch(f(`${C}/calender/CalenderPlusTemplate.vue`), [
    ['<h2>2025년 11월 21일</h2>', '<h2>{{ W.dateKoShort }}</h2>'],
    ['<p>2025년 11 21일 토요일 오후 01시 30분</p>', '<p>{{ W.dateTimeKo }}</p>'],
    ["new Date('2025-01-04T00:00:00')", 'new Date(W.datetime)'],
    ["const tmp = this.days.replaceAll('.','-') + 'T00:00:00'", 'const tmp = W.datetime'],
    USE_W,
  ]);

  // 지도·교통·계좌
  await patch(f(`${C}/address/AddressPlus.vue`), [
    ['<div class="address-map">', '<div class="address-map" v-if="W.kakaoMapKey">'],
    [/<div class="address-directions">[\s\S]*?\n {4}<\/div>\n/, `<div style="text-align:center;padding:16px 0 0;">
      <a :href="W.links.naver" target="_blank" rel="noopener" style="display:inline-block;margin:0 4px;padding:8px 16px;border:1px solid #f3c1c1;border-radius:20px;font-size:14px;color:#df8585;text-decoration:none;">네이버 지도</a>
      <a :href="W.links.kakao" target="_blank" rel="noopener" style="display:inline-block;margin:0 4px;padding:8px 16px;border:1px solid #f3c1c1;border-radius:20px;font-size:14px;color:#df8585;text-decoration:none;">카카오맵</a>
    </div>

    <div class="address-directions">
      <div class="address-item" v-for="d in W.directions" :key="d.label">
        <p><strong>{{ d.label }}</strong></p>
        <span>{{ d.detail }}</span>
      </div>
    </div>
`],
    [/<div class="content-box">\s*<button @click="isPopOpen = true">/, '<div class="content-box" v-if="W.accounts.length">\n      <button @click="isPopOpen = true">'],
    [/<div class="gift-info-wrap">[\s\S]*?<p class="close-popup">닫기<\/p>/, `<div class="gift-info-wrap">
          <div class="font-wrap" v-for="side in W.accounts" :key="side.title">
            <h3>{{ side.title }}</h3>
            <p v-for="a in side.list" :key="a.label + a.number">
              {{ a.label }} : {{ a.number }} ({{ a.bank }})
              <i class="fas fa-copy copy-icon" @click="copyToClipboard(a.bank + ' ' + a.number, $event)"></i>
              <a v-if="a.kakaopay" :href="a.kakaopay" target="_blank" rel="noopener" @click.stop>카카오페이</a>
            </p>
          </div>
          <p class="close-popup">닫기</p>`],
    ["latitude: '',\n      longitude: '',", 'latitude: W.venue.lat,\n      longitude: W.venue.lng,'],
    ["const name = '서울특별시 용산구 용산동 1가 8번지'", 'const name = W.venue.name'],
    ["typeof window.Kakao !== 'undefined' && window.Kakao.Navi", "typeof window.Kakao !== 'undefined' && window.Kakao.isInitialized() && window.Kakao.Navi"],
    ["alert('카카오 내비 SDK가 로드되지 않았습니다.');", '// 카카오 키가 없으면 카카오맵 링크로 연다\n            window.location.href = W.links.kakao;'],
    ['const kakaoApiKey = import.meta.env.VITE_KAKAO_API_KEY;', 'const kakaoApiKey = W.kakaoMapKey;\n      if (!kakaoApiKey) return;'],
    ['new kakao.maps.LatLng(33.450701, 126.570667)', 'new kakao.maps.LatLng(W.venue.lat || 37.5665, W.venue.lng || 126.978)'],
    ['// 주소-좌표 변환 객체를 생성합니다', `// 좌표가 있으면 바로 표시하고, 없으면 주소로 찾는다
          if (W.venue.lat && W.venue.lng) {
            const pos = new kakao.maps.LatLng(W.venue.lat, W.venue.lng);
            new kakao.maps.Marker({ map: this.map, position: pos });
            this.map.setCenter(pos);
            return;
          }

          // 주소-좌표 변환 객체를 생성합니다`],
    ["const param = '서울특별시 용산구 용산동 1가 8번지'", 'const param = W.venue.address'],
    USE_W,
  ]);

  // 편지 보내기: 원작자의 EmailJS 서비스·템플릿 ID 를 지우고 키가 없으면 보내지 않는다
  await patch(f(`${C}/letter/LetterDefault.vue`), [
    ['import emailjs from "emailjs-com";', "import emailjs from \"emailjs-com\";\n\n// 공통 RSVP 모듈로 교체 예정. 직접 쓰려면 본인 EmailJS 값을 넣는다\nconst EMAILJS = { key: import.meta.env.VITE_EMAILJS_API_KEY || '', service: '', template: '' };"],
    [/emailjs\.init\(import\.meta\.env\.VITE_EMAILJS_API_KEY\);\s*emailjs\s*\.send\("service_portfolio", "template_5lovp15", \{/, `if (!EMAILJS.key || !EMAILJS.service || !EMAILJS.template) {
          this.btnFlag = false;
          alert('편지 보내기는 아직 준비 중입니다.');
          return false;
        }
        emailjs.init(EMAILJS.key);
        emailjs
            .send(EMAILJS.service, EMAILJS.template, {`],
    ["from_name: 'chungrimi.com',", 'from_name: document.title,'],
  ]);
}

export async function apply({ wedding: w, src, out, images, log }) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const work = await prepareWork('t07-knm8643', src);
  await patchWork({ wedding: w, work, images, warn });
  await writeEnv(work, { VITE_KAKAO_API_KEY: kakaoKey(w), VITE_EMAILJS_API_KEY: '' });
  if (!kakaoMapKey(w)) warn('카카오맵 키가 없어 지도 대신 네이버·카카오 지도 링크만 표시합니다');
  await install(work, log);
  log('Vite 빌드 중');
  viteBuild(work, out);
  return warnings;
}
