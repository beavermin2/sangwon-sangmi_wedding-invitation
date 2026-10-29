// t01-hb4258: wedding.json → config.js (window.CONFIG)
// 템플릿은 config.js 하나만 읽으므로 그 파일을 새로 쓰고, 사진은 assets/ 아래로 옮긴다.
import { readFile, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kstParts, parentName, parentPhone, accountLabel, kakaoKey, venueLine, escapeHtml,
} from '../../scripts/lib/wedding.mjs';
import { ROLES, PARTS, USES, resolveColors } from './text-colors.mjs';

const ICON = { subway: 'M', bus: 'B', car: 'P' };

// 복사본 파일의 정해진 부분을 바꾼다. 원본이 바뀌어 못 찾으면 조용히 넘어가지 않고 빌드를 멈춘다.
async function patch(file, pairs) {
  // Windows 에서 CRLF 로 받은 저장소에서도 같은 문자열로 찾도록 줄바꿈을 맞춘다.
  let text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`${file} 에서 바꿀 부분을 찾지 못했습니다: ${from.trim().slice(0, 60)}`);
    text = text.replace(from, to);
  }
  await writeFile(file, text);
}

// 인용구를 줄바꿈 없이 한 줄에 맞추는 글자 크기(CSS). 글자 폭을 em 으로 어림해
// '화면 폭(최대 480px) - 좌우 여백 56px - 자간' 을 그 폭으로 나누고, 원래 크기(14px)를 넘지 않게 한다.
// 줄바꿈(\n)을 직접 넣은 인용구는 가장 긴 줄을 기준으로 한다.
function fitQuoteSize(text, max = 14, spacing = 1) {
  const em = (ch) => (/[ㄱ-힣一-鿿]/.test(ch) ? 1 : /[A-Z]/.test(ch) ? 0.68 : /[a-z0-9]/.test(ch) ? 0.55 : ch === ' ' ? 0.3 : 0.4);
  const lines = String(text || '').split('\n');
  let widest = 0, chars = 0;
  for (const line of lines) {
    const w = [...line].reduce((s, ch) => s + em(ch), 0);
    if (w > widest) { widest = w; chars = [...line].length; }
  }
  if (!widest) return `${max}px`;
  // 글꼴마다 폭이 조금씩 달라 5% 여유를 둔다
  return `min(${max}px, calc((min(100vw, 480px) - ${56 + chars * spacing}px) / ${(widest * 1.05).toFixed(2)}))`;
}

// 글씨 색 부분 나누기: 함수마다 THEME.<묶음> 을 나온 순서대로 세어 USES 표대로 THEME.<부분> 으로 바꾼다.
async function splitTextColors(dir) {
  for (const file of [...new Set(USES.map((u) => u[0]))]) {
    const path = join(dir, file);
    const lines = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n').split('\n');
    const seen = new Map();
    let fn = '';
    for (let i = 0; i < lines.length; i++) {
      const m = /^function (\w+)/.exec(lines[i]);
      if (m) fn = m[1];
      lines[i] = lines[i].replace(/THEME\.(textSoft|textMuted|text|accent)\b/g, (all, role) => {
        const use = USES.find((u) => u[0] === file && u[1] === fn && u[2] === role);
        if (!use) return all;
        const key = `${fn}.${role}`;
        const n = seen.get(key) || 0;
        seen.set(key, n + 1);
        return use[3][n] ? `THEME.${use[3][n]}` : all;
      });
    }
    for (const [f, fnName, role, parts] of USES.filter((u) => u[0] === file)) {
      const n = seen.get(`${fnName}.${role}`) || 0;
      if (n !== parts.length) throw new Error(`${file} ${fnName} 의 THEME.${role} 가 ${parts.length}곳이어야 하는데 ${n}곳입니다 (text-colors.mjs 의 USES 를 고쳐 주세요)`);
    }
    await writeFile(path, lines.join('\n'));
  }
}

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
// 맨 아래 THANK YOU 꼬리말을 빼므로 공유 섹션이 마지막 섹션이다.
export const addons = { mount: { selector: '#root section:last-of-type', where: 'beforebegin' }, share: false, accent: '#9c7a5b', nativeEffect: 'doodles' };

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
    // 'atm' 은 그림 아이콘. 아래 sections-b.jsx 패치가 iconImage 를 그림으로 그린다.
    notices: (w.notices || []).map((n) => (n.icon === 'atm' ? { ...n, icon: '🏧', iconImage: 'assets/notice-atm.webp' } : n)),
    accounts: {
      note: w.accounts.note,
      groom: w.accounts.groom.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
      bride: w.accounts.bride.map((a) => ({ name: accountLabel(a), bank: a.bank, number: a.number })),
    },
    // 자동 탐색은 번호×확장자마다 404 요청을 남기므로 실제 파일 목록을 넘긴다.
    gallery: { files: (await readdir(join(assets, 'gallery'))).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort(), maxScan: 30 },
  };
  if (!config.meta.kakaoAppKey) warn('카카오 JS 키가 없어 카카오 공유·지도가 꺼집니다');

  await writeFile(join(out, 'config.js'),
    '// scripts/build.mjs 가 data/wedding.json 에서 생성했습니다. 직접 고치지 마세요.\n' +
    `window.CONFIG = ${JSON.stringify(config, null, 2)};\n`);

  // 표지: 대표 사진을 자르지 않고 원래 비율대로 보여 주고, 그 위로 손그림 꽃이 흩날리게 한다.
  // 손그림 꽃은 이 템플릿의 기본 장식. 다른 배경 효과를 고르면 공통 모듈이 그 효과를 넣으므로 빼 둔다.
  const ownDoodles = [undefined, '', 'doodles'].includes(w.options && w.options.backgroundEffect);
  if (ownDoodles) await copyFile(fileURLToPath(new URL('falling-doodles.jsx', import.meta.url)), join(out, 'components', 'falling-doodles.jsx'));
  await patch(join(out, 'components', 'sections-a.jsx'), [
    ["height: 360, overflow: 'hidden' }}>", "minHeight: 360, overflow: 'hidden' }}>"],
    ["fontSize: 14, letterSpacing: 8, color: THEME.accent, fontStyle: 'italic',", "fontSize: 14, letterSpacing: 8, paddingLeft: 8, color: THEME.accent, fontStyle: 'italic',"],
    // 인용구: 줄바꿈하지 않고 화면 폭에 맞춰 글자를 줄인다
    [`            fontSize: 14, lineHeight: 2, letterSpacing: 1,
            color: THEME.text, whiteSpace: 'pre-line', fontWeight: 300,`,
     `            fontSize: '${fitQuoteSize(w.greeting.quote && w.greeting.quote.text)}', lineHeight: 2, letterSpacing: 1,
            color: THEME.text, whiteSpace: 'pre', fontWeight: 300,`],
    // 인사말: 줄마다 끝 단어가 혼자 다음 줄로 밀리지 않게 화면 폭에 맞춰 글자를 줄인다(넓은 화면은 원래 15px)
    ['fontSize: 15, lineHeight: 2.2, letterSpacing: 0.5,', "fontSize: 'clamp(11.5px, 3.5vw, 15px)', lineHeight: 2.2, letterSpacing: 0.5,"],
    // 신랑·신부 소개: 작은 화면(320px)에서 두 사람 칸이 사진 폭보다 줄지 못해 화면 밖으로 밀리던 것을 줄어들게 한다
    ["<FadeIn delay={delay} style={{ textAlign: 'center', flex: 1 }}>\n      <Photo src={photo ? _assetPath(photo) : null}",
     "<FadeIn delay={delay} style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>\n      <Photo src={photo ? _assetPath(photo) : null}"],
    ["style={{ margin: '0 auto 20px', borderRadius: 2 }} />", "style={{ margin: '0 auto 20px', borderRadius: 2, maxWidth: '100%' }} />"],
    ['width="100%" height="100%" alt="" eager={true} />', 'width="100%" height="auto" alt="" eager={true} />'],
    ['rgba(251,246,238,0) 55%', 'rgba(251,246,238,0) 82%'],
    // 표지 시간·장소 줄을 굵게
    [`            fontWeight: 300, marginTop: 8,
          }}>{d.date.venueLineKo}</div>`,
    `            fontWeight: 600, marginTop: 8,
          }}>{d.date.venueLineKo}</div>`],
    // 표지 아래쪽의 나뭇가지·꽃 장식은 빼고 흩날리는 손그림 꽃만 남긴다
    [`      <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, height: 100, pointerEvents: 'none' }}>
        <FlowerScatter width={375} height={100} variant={THEME.flowerVariant} density={THEME.flowerDensity * 0.6} />
      </div>
`, ''],
  ]);
  // 글씨 색: 관리자에서 고른 색(options.textColors). 묶음 색은 테마 값을 바꾸고,
  // 부분 색은 테마에 키를 더한 뒤 맨 아래에서 각 부분의 THEME.<묶음> 을 THEME.<부분> 으로 바꾼다(text-colors.mjs).
  const colors = resolveColors(w.options && w.options.textColors);
  const partColors = {};
  for (const [, parts] of PARTS) for (const [k] of parts) partColors[k] = colors[k];
  await patch(join(out, 'components', 'theme.jsx'), [
    ...ROLES.map(([key, , def]) => [`  ${key}: '${def}',`, `  ${key}: '${colors[key]}',`]),
    ['  flowerDensity: 1,\n};', `  flowerDensity: 1,\n};\nObject.assign(THEME, ${JSON.stringify(partColors)});`],
    // 자간은 마지막 글자 뒤에도 붙어 가운데 정렬 제목이 그 절반만큼 왼쪽으로 쏠린다. 왼쪽에 같은 만큼 띄워 맞춘다.
    ["fontSize: 13, letterSpacing: 4, textTransform: 'uppercase',", "fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', paddingLeft: align === 'center' ? 4 : 0,"],
    ['fontSize: 17, letterSpacing: 6, color: THEME.text,', "fontSize: 17, letterSpacing: 6, color: THEME.text, paddingLeft: align === 'center' ? 6 : 0,"],
  ]);
  // 교통편: 합쳐진 안내(줄바꿈)를 줄마다 보여 준다
  // 하객 안내: iconImage 가 있으면 글자 대신 그림 아이콘
  await copyFile(fileURLToPath(new URL('../../previews/test1/images/notice-atm.webp', import.meta.url)), join(assets, 'notice-atm.webp'));
  await patch(join(out, 'components', 'sections-b.jsx'), [
    ["fontSize: 12, color: THEME.textSoft, lineHeight: 1.6, fontWeight: 300 }}>{item.detail}</div>",
     "fontSize: 12, color: THEME.textSoft, lineHeight: 1.6, fontWeight: 300, whiteSpace: 'pre-line' }}>{item.detail}</div>"],
    [`              fontSize: 18, lineHeight: 1,
            }}>{item.icon}</div>`,
     `              fontSize: 18, lineHeight: 1,
            }}>{item.iconImage ? <img src={item.iconImage} alt="" width={24} height={24} style={{ objectFit: 'contain' }} /> : item.icon}</div>`],
  ]);
  // 초대글 아래 혼주 두 줄: 줄마다 가운데 정렬하면 '아들'/'딸' 길이와 국화 유무로 어긋나므로
  // 부모 이름 · '의 아들/딸' · 신랑신부 이름을 같은 칸에 맞춘다(국화는 칸 왼쪽 바깥에 걸린다).
  // 아이폰 Safari 는 auto 칸을 좁게 잡아 한 글자씩 줄바꿈하므로, 칸을 글자 폭(max-content)으로 잡고 줄바꿈을 막는다.
  // 좁은 화면에서는 글자 크기를 화면 폭에 맞춰 줄인다(작은 글자·간격은 em 이라 함께 줄어든다).
  const parentLine = (gp, gm, who) => [
    `          <div>
            {${gp}} <span style={{ color: THEME.textMuted, fontSize: 11 }}>· </span>{${gm}}
            <span style={{ color: THEME.textMuted, fontSize: 11, marginLeft: 8 }}>의 {d.${who}.roleKo}</span>
            <span style={{ color: THEME.accent, fontWeight: 500, marginLeft: 4 }}>{d.${who}.name}</span>
          </div>`,
    // 칸마다 nowrap 을 직접 걸어, 바깥 스타일이 줄바꿈을 다시 켜도 한 줄을 지킨다.
    `          <div style={{ display: 'contents' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{${gp}} <span style={{ color: THEME.textMuted, fontSize: '0.85em' }}>· </span>{${gm}}</span>
            <span style={{ color: THEME.textMuted, fontSize: '0.85em', marginLeft: '0.6em', whiteSpace: 'nowrap' }}>의 {d.${who}.roleKo}</span>
            <span style={{ color: THEME.accent, fontWeight: 500, marginLeft: '0.4em', whiteSpace: 'nowrap' }}>{d.${who}.name}</span>
          </div>`,
  ];
  await patch(join(out, 'components', 'sections-a.jsx'), [
    ['fontSize: 13, lineHeight: 2, color: THEME.text, letterSpacing: 1,',
     "fontSize: 'clamp(11px, 3.4vw, 13px)', lineHeight: 2, color: THEME.text, letterSpacing: 1,\n          display: 'grid', gridTemplateColumns: 'max-content max-content max-content', justifyContent: 'center',\n          alignItems: 'baseline', textAlign: 'left', whiteSpace: 'nowrap', wordBreak: 'keep-all',"],
    parentLine('gf', 'gm', 'groom'),
    parentLine('bf', 'bm', 'bride'),
    // 인용구 위의 장식용 큰 따옴표(“)는 빼고 인용문만
    [`          <div style={{
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: 28, lineHeight: 1.2, color: THEME.accent,
            fontStyle: 'italic', opacity: 0.6, marginBottom: 14,
          }}>“</div>
`, ''],
    // 인용구 출처 앞의 줄표(—) 없이 출처만
    ['}}>— {quote.author}</div>', '}}>{quote.author}</div>'],
    // 달력: 예식일 표시를 파란 원 대신 빨간 하트로
    [`                    <div style={{
                      position: 'absolute', inset: 3,
                      background: THEME.accent, borderRadius: '50%',
                    }} />`,
    `                    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', inset: 1, width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}>
                      <path d="M12 21.2C5.6 16.4 2 12.9 2 8.7 2 5.6 4.4 3.2 7.4 3.2c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 3 0 5.4 2.4 5.4 5.5 0 4.2-3.6 7.7-10 12.5z" fill="#E0414F" />
                    </svg>`],
    ["<span style={{ position: 'relative', zIndex: 1, fontWeight: isTarget ? 500 : 300 }}>",
     "<span style={{ position: 'relative', zIndex: 1, fontWeight: isTarget ? 500 : 300, top: isTarget ? -2 : 0 }}>"],
  ]);
  await splitTextColors(join(out, 'components'));

  // 카카오톡·문자 미리보기는 JS를 실행하지 않으므로 og 태그를 HTML에 직접 박는다.
  const page = join(out, 'index.html');
  let html = await readFile(page, 'utf8');
  const flowersTag = '<script type="text/babel" src="./components/flowers.jsx"></script>';
  if (!html.includes(flowersTag)) throw new Error('index.html 에서 flowers.jsx 스크립트를 찾지 못했습니다');
  if (ownDoodles) html = html.replace(flowersTag, `${flowersTag}\n<script type="text/babel" src="./components/falling-doodles.jsx"></script>`);
  // 손그림 꽃은 표지만이 아니라 화면 전체에 흩날리게 청첩장 맨 앞에 한 번 넣는다.
  if (!/<div className="app-shell">\r?\n/.test(html)) throw new Error('index.html 에서 app-shell 을 찾지 못했습니다');
  if (ownDoodles) html = html.replace(/<div className="app-shell">(\r?\n)/, '<div className="app-shell">$1      <FallingDoodles />$1');
  // 카카오톡 공유 아래의 꽃 장식·THANK YOU 꼬리말은 넣지 않는다.
  if (!/\s*<FooterSection \/>/.test(html)) throw new Error('index.html 에서 <FooterSection /> 을 찾지 못했습니다');
  html = html.replace(/\r?\n\s*<FooterSection \/>/, '');
  // 양가 부모(FAMILY) 섹션은 넣지 않는다. 부모님 성함은 인사말 아래 혼주 줄에 이미 나온다.
  if (!/\s*<ParentsSection \/>/.test(html)) throw new Error('index.html 에서 <ParentsSection /> 을 찾지 못했습니다');
  html = html.replace(/\r?\n\s*<ParentsSection \/>/, '');
  // 아이폰(Safari)과 갤럭시(Chrome)가 같게 보이도록 글자 배치를 맞춘다.
  //  - 한글을 단어 단위로 줄바꿈(글자 중간에서 끊기면 줄 끝이 들쭉날쭉해 정렬이 어긋나 보인다)
  //  - 기울임꼴이 없는 한글을 가짜로 기울이지 않는다(Safari 는 기울인 만큼 오른쪽으로 밀려 보인다)
  //  - 가로로 돌렸을 때 Safari 가 글자를 임의로 키우지 않게 한다
  //  - 가운데 정렬 글(인용구·인사말 등)은 두 줄로 넘어갈 때 줄 길이를 고르게 나눈다(한 단어만 남는 줄 방지).
  //    text-wrap(줄임 속성)은 Safari 에서 줄바꿈 금지(nowrap)까지 풀어 혼주 줄이 깨지므로 text-wrap-style 만 쓴다.
  const typo = `  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .app-shell { word-break: keep-all; overflow-wrap: break-word; font-synthesis: weight; }
  .app-shell section[style*="text-align: center"] div { text-wrap-style: balance; }
</style>`;
  if (!html.includes('</style>')) throw new Error('index.html 에서 </style> 을 찾지 못했습니다');
  html = html.replace('</style>', typo);
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
