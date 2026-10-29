// Design previews are additive: the selected invitation and its assets are never changed.
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { injectAddons } from './lib/addons.mjs';
import { backgroundEffect } from './lib/falling-doodles.mjs';
import { escapeHtml as h, kstParts, mapLinks, makeImages, useWedding, parentName, MONTH_EN } from './lib/wedding.mjs';

export async function buildPreviews({ root, dist, wedding: w }) {
  await buildPaperRose({ root, dist, wedding: w });
  console.log('✓ test1.html — paper & rose design preview (original invitation preserved)');
}

// 같은 원본을 시안(test1.html)과 정식 템플릿(index.html)으로 빌드한다.
export async function buildPaperRose({ root, dist, wedding: w, template = false }) {
  const id = 'test1';
  const entry = join(dist, template ? 'index.html' : `${id}.html`);
  const assetPath = template ? 'assets/paper-rose' : `preview-assets/${id}`;
  const assetDir = join(dist, assetPath);
  if (existsSync(entry) || existsSync(assetDir)) throw new Error('Preview output would overwrite existing invitation files');
  await mkdir(assetDir, { recursive: true });
  const base = `./${assetPath}/`;
  const source = join(root, 'previews', id);
  const dataRoot = resolve(root, 'data');
  let imageIndex = 0;
  const copied = new Map();
  async function photo(rel) {
    if (!rel) return '';
    const full = resolve(dataRoot, rel);
    if (!full.startsWith(dataRoot + sep) || !existsSync(full) || !/\.(jpe?g|png|webp|gif)$/i.test(full)) return '';
    if (!copied.has(full)) {
      const name = `photo-${++imageIndex}${extname(full).toLowerCase()}`;
      await copyFile(full, join(assetDir, name));
      copied.set(full, base + name);
    }
    return copied.get(full);
  }
  const cover = await photo(w.gallery.cover);
  const gallery = [];
  for (const rel of w.gallery.photos || []) { const src = await photo(rel); if (src) gallery.push(src); }
  const shareImage = await photo(w.site.ogImage) || cover;
  const ending = gallery.at(-1) || cover;
  // Local reference images and sample captions for the design preview.
  const moments = JSON.parse(await readFile(join(source, 'moments.json'), 'utf8'));
  for (const moment of moments) await copyFile(join(source, 'images', moment.image), join(assetDir, moment.image));
  const weddingGallery = JSON.parse(await readFile(join(source, 'wedding-gallery.json'), 'utf8'));
  for (const item of weddingGallery) {
    const imagePath=join(source,'images',item.image);
    const png=await readFile(imagePath);
    item.width=png.readUInt32BE(16);item.height=png.readUInt32BE(20);
    await copyFile(imagePath,join(assetDir,item.image));
  }
  const galleryColumnHeights=[0,1].map(column=>weddingGallery.reduce((sum,item,i)=>sum+(i%2===column?item.height/item.width:0),0));
  const galleryHeight=Math.max(...galleryColumnHeights);
  const galleryPhotoRatio=(item,i)=>1/(item.height/item.width+(i>=weddingGallery.length-2?galleryHeight-galleryColumnHeights[i%2]:0));
  const d = kstParts(w.ceremony.datetime);
  const displayTime = d.timeKo;
  const weekdayKo = ['일','월','화','수','목','금','토'][d.dow] + '요일';
  // Inclusive day count: 829 days on 2026-10-26 (Korea time).
  const togetherSince = '2024-07-20';
  const weekday = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.dow];
  const venue = [w.venue.name, w.venue.floor, w.venue.hall].filter(Boolean).join(' ');
  const siteRoot = w.site.url || process.env.SITE_URL || '';
  const siteBase = siteRoot ? new URL(siteRoot.endsWith('/') ? siteRoot : siteRoot + '/') : null;
  const publicUrl = siteBase ? new URL(template ? './' : `${id}.html`, siteBase).href : '';
  const ogImage = siteBase && shareImage ? new URL(shareImage, siteBase).href : shareImage;
  const links = mapLinks(w.venue);
  const phone = value => String(value || '').replace(/[^+\d]/g, '');
  // Preview-only fallback, verified at https://ydp.theconvention.co.kr/ on 2026-10-26.
  const venuePhone = w.venue.phone || (String(w.venue.naverPlaceId)==='1241035074' ? '02-6426-5000' : '');
  const multiline = value => h(value).replace(/\n/g, '<br>');
  const keepsakes=[];
  for(const item of JSON.parse(await readFile(join(source,'keepsakes.json'),'utf8'))){
    const src=await photo(item.image);
    if(src)keepsakes.push({...item,src});
  }
  const heading = (en,ko) => `<header class="section-heading"><p class="eyebrow">${en}</p><h2>${h(ko)}</h2></header>`;
  useWedding(w);
  const family = p => `<p class="family-row"><span class="family-parent">${h(parentName(p.parents.father))}</span><span class="dot">${p.parents.father?.name && p.parents.mother?.name ? '·' : ''}</span><span class="family-parent">${h(parentName(p.parents.mother))}</span><span class="parent-of">의</span><span class="relation">${h(p.relation)}</span><strong>${h(p.name)}</strong></p>`;
  const contacts = [];
  for (const [label,p] of [['신랑',w.groom],['신부',w.bride]]) {
    for (const [role,person] of [[label,p],[`${label} 아버지`,p.parents.father],[`${label} 어머니`,p.parents.mother]]) {
      if (!person || person.deceased || !phone(person.phone)) continue;
      contacts.push(`<li><span><small>${role}</small>${h(person.name)}</span><div><a href="tel:${phone(person.phone)}" aria-label="${h(person.name)}에게 전화">전화</a><a href="sms:${phone(person.phone)}" aria-label="${h(person.name)}에게 문자">문자</a></div></li>`);
    }
  }
  const firstDay = new Date(Date.UTC(d.y,d.m-1,1)).getUTCDay();
  const lastDate = new Date(Date.UTC(d.y,d.m,0)).getUTCDate();
  let days = '<span class="empty" aria-hidden="true"></span>'.repeat(firstDay);
  for(let day=1;day<=lastDate;day++) {
    const dow=(firstDay+day-1)%7;
    const holiday=(w.ceremony.holidays||[]).includes(day);
    const heart = day===d.d ? '<svg class="calendar-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21.2C5.6 16.4 2 12.9 2 8.7 2 5.6 4.4 3.2 7.4 3.2c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 3 0 5.4 2.4 5.4 5.5 0 4.2-3.6 7.7-10 12.5z"/></svg>' : '';
    days+=`<span class="calendar-day${day===d.d?' selected':''}${dow===0||holiday?' holiday':''}"${day===d.d?' aria-label="'+h(d.dateKo)+' 결혼식"':''}>${heart}<span class="calendar-number">${day}</span></span>`;
  }
  // 배포된 대표 청첩장과 같은 정보로 표시한다. 시안의 예시 계좌는 사용하지 않는다.
  const previewAccounts=w.accounts;
  const copyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="3" y="8" width="12" height="13" rx="2"/><path d="M9 5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1"/></svg>';
  const payIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4C6.5 4 3 7.2 3 11c0 2.4 1.4 4.4 3.8 5.6l-.9 3.1c-.1.4.2.6.5.4l3.6-2.2c.7.1 1.3.1 2 .1 5.5 0 9-3.2 9-7s-3.5-7-9-7Z"/></svg>';
  const accounts = [['groom','신랑 측',previewAccounts.groom],['bride','신부 측',previewAccounts.bride]].map(([key,label,rows]) => {
    if(!rows.length)return '';
    return `<details class="account"><summary>${label} 계좌번호<svg class="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="account-body">${rows.map(a=>{
      const payUrl=String(a.kakaopay||'').trim();
      if(payUrl&&!/^https:\/\//i.test(payUrl))throw new Error('카카오페이 송금 링크는 HTTPS 주소여야 합니다');
      const pay=payUrl?`<a class="account-pay" href="${h(payUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${h(a.owner)} 카카오페이 송금">${payIcon}</a>`:`<button type="button" class="account-pay" data-pay-pending aria-label="${h(a.owner)} 카카오페이 송금 링크 준비 중">${payIcon}</button>`;
      return `<div class="account-row"><div class="account-info"><button type="button" class="account-copy" data-copy="${h(a.number.replace(/\D/g,''))}" data-copy-message="계좌번호를 복사했습니다" aria-label="${h(a.owner)} 계좌번호 복사">${copyIcon}<strong>${h(a.owner)}</strong></button><p>${h(a.bank)} ${h(a.number)}</p></div>${pay}</div>`;
    }).join('')}</div></details>`;
  }).join('');
  const galleryHtml=`<section id="gallery" class="section gallery-section" aria-label="우리의 작은 기록" aria-roledescription="슬라이드">
    ${heading('OUR DAYS','우리의 작은 기록')}
    <div class="moments-cover" id="moments-cover" hidden>
      <img class="moments-cover-photo" src="${h(ending)}" alt="함께하는 두 사람" loading="lazy" width="280" height="320">
      <div class="moments-cover-lettering"><span>${h(w.groom.nameEn.first)} &amp; ${h(w.bride.nameEn.first)}</span><em>함께여서 더 좋았던 날들</em><p>평범한 하루가 소중한 기억이 되기까지,<br>차곡차곡 모아 온 순간들을 꺼내 봅니다.</p></div>
      <button class="moments-start" id="moments-start" type="button"><span>기록 펼쳐보기</span><span class="moments-start-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></button>
    </div>
    <div id="moments-content">
    <div class="moments-top"><span aria-hidden="true">작은 기록</span><span id="moments-counter" aria-live="polite" aria-atomic="true">01 / ${String(moments.length).padStart(2,'0')}</span></div>
    <div class="moments-track" id="moments-track" tabindex="0" aria-label="사진 슬라이드, 좌우 방향키로 이동">
      ${moments.map((m,i)=>`<article class="moment-slide" role="group" aria-roledescription="슬라이드" aria-label="${i+1} / ${moments.length}">
        <button class="moment-photo" type="button" data-photo="${h(base+m.image)}" aria-label="${h(m.title)} 그림 크게 보기"><img src="${h(base+m.image)}" alt="${h(m.title)} — 치이카와 캐릭터 샘플 그림" loading="lazy" width="280" height="320"></button>
        <h3>${h(m.title)}</h3><p>${multiline(m.description)}</p>
      </article>`).join('')}
    </div>
    <div class="moments-nav"><button id="moments-prev" type="button" aria-label="기록 표지로 돌아가기"><svg viewBox="0 0 16 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="m11 4-6 8 6 8"/></svg></button><button id="moments-next" type="button" aria-label="다음 기록"><svg viewBox="0 0 16 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="m5 4 6 8-6 8"/></svg></button></div>
    </div>
  </section>`;
  const notices=(w.notices||[]).length?`<section id="notices" class="section notice-section"><header class="section-heading info-heading"><h2>안내사항</h2><p class="eyebrow">NOTICE</p></header><div class="notice-list">${w.notices.map(n=>`<article><span class="notice-mark" aria-hidden="true">${n.icon==='atm'?`<img src="${h(base)}notice-atm.webp" alt="" width="22" height="22">`:h(n.icon||'♡')}</span><h3>${h(n.title)}</h3><p>${multiline(n.detail)}</p></article>`).join('')}</div></section>`:'';
  const busGroups=JSON.parse(await readFile(join(source,'transport.json'),'utf8')).find(item=>item.title==='버스')?.rows||[];
  const values={
    PHOTO_SHARE:await readFile(join(source,'photo-share.html'),'utf8'),
    PHOTO_SHARE_FIRST:h(keepsakes[1]?.src||cover), PHOTO_SHARE_SECOND:h(ending),
    KEEPSAKE_ALBUM:keepsakes.length?`<div class="keepsake-album" role="group" aria-label="사진으로 전하는 마지막 인사">${keepsakes.map(item=>`<figure class="keepsake ${item.shape==='square'?'keepsake-square':''}"><div class="keepsake-frame"><img src="${h(item.src)}" alt="${h(item.alt)}" loading="lazy" decoding="async" style="object-position:50% ${Math.max(0,Math.min(100,Number(item.focusY)||50))}%"></div><figcaption>${multiline(item.caption)}</figcaption></figure>`).join('')}</div>`:'',
    RSVP_DATE_TIME:h(`${d.dateDot} (${['일','월','화','수','목','금','토'][d.dow]}) ${displayTime}`),
    RSVP_SECTION_MENU:w.features.rsvp?.enabled?'<a href="#rsvp">참석의사 전달하기</a>':'',
    RSVP:w.features.rsvp?.enabled?await readFile(join(source,'rsvp.html'),'utf8'):'',
    RSVP_MENU:w.features.rsvp?.enabled?'<a href="#rsvp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M8 14l3 3 5-6"/></svg><span>참석의사 전달하기</span></a>':'',
    FALLING_FLOWERS:backgroundEffect(w.options?.backgroundEffect),
    WEDDING_GALLERY:`<section id="wedding-gallery" class="section wedding-gallery-section">${heading('WEDDING GALLERY','웨딩갤러리')}<div class="wedding-gallery-grid">${[0,1].map(column=>`<div class="wedding-gallery-column">${weddingGallery.map((item,i)=>({item,i})).filter(({i})=>i%2===column).map(({item,i})=>`<button type="button" class="wedding-gallery-photo" style="--gallery-ratio:${galleryPhotoRatio(item,i)}" data-photo="${h(base+item.image)}" data-photo-order="${i}" aria-label="${h(item.title)} 크게 보기"><img src="${h(base+item.image)}" alt="${h(item.title)} — 치이카와 샘플 일러스트" loading="lazy" decoding="async" width="${item.width}" height="${item.height}"></button>`).join('')}</div>`).join('')}</div></section>`,
    INTERVIEW_ITEMS:(JSON.parse(await readFile(join(source,'interview.json'),'utf8'))).map((item,i)=>`<article class="interview-item"><h3><span>Q${i+1}.</span>${h(item.question)}</h3><div class="interview-answer"><h4>신랑 ${h(w.groom.name)}</h4><p>${multiline(item.groom)}</p></div><div class="interview-answer"><h4>신부 ${h(w.bride.name)}</h4><p>${multiline(item.bride)}</p></div></article>`).join(''),
    TITLE:h(w.site.title), DESCRIPTION:h(w.site.description), PUBLIC_URL:h(publicUrl), OG_IMAGE:h(ogImage), ASSET:base,
    DATE:`${d.y} / ${String(d.m).padStart(2,'0')} / ${String(d.d).padStart(2,'0')}`, WEEKDAY:weekday,
    TOGETHER_SINCE:togetherSince, TOGETHER_SINCE_DOT:togetherSince.replaceAll('-','.'), CEREMONY_DATE:d.dateIso,
    DATE_DOT:d.dateDot, DATE_TIME:h(`${d.dateKo} ${displayTime}`), TIME:h(`${weekdayKo} ${displayTime}`), YEAR:d.y, MONTH:MONTH_EN[d.m-1], DAY:d.d,
    NAMES:`${h(w.groom.name)}<span class="dot">·</span>${h(w.bride.name)}`, NAME_TEXT:h(`${w.groom.name} · ${w.bride.name}`),
    EN_NAMES:h(`${w.groom.nameEn.first} & ${w.bride.nameEn.first}`), VENUE:h(venue), ADDRESS:h(w.venue.address),
    GROOM_NAME:h(w.groom.name), BRIDE_NAME:h(w.bride.name),
    GROOM_NAME_EN:h(`${w.groom.nameEn.last} ${w.groom.nameEn.first}`.toUpperCase()),
    BRIDE_NAME_EN:h(`${w.bride.nameEn.last} ${w.bride.nameEn.first}`.toUpperCase()),
    VENUE_PHONE:venuePhone?`<p class="venue-phone"><a href="tel:${phone(venuePhone)}" aria-label="${h(w.venue.name)} 전화 ${h(venuePhone)}">Tel. ${h(venuePhone)}</a></p>`:'',
    OPENING_GROOM:h(w.groom.nameEn.first), OPENING_BRIDE:h(w.bride.nameEn.first), OPENING_SECOND:h(ending),
    HERO:cover?`<img class="hero-image" src="${h(cover)}" alt="${h(w.groom.name)}과 ${h(w.bride.name)}의 웨딩 사진" width="1024" height="1536" fetchpriority="high">`:'',
    GREETING_TITLE:h(w.greeting.title), GREETING:multiline(w.greeting.message), FAMILY:family(w.groom)+family(w.bride),
    GREETING_QUOTE:w.greeting.quote?.text?`<blockquote class="greeting-quote"><p>${multiline(w.greeting.quote.text)}</p>${w.greeting.quote.author?`<cite>${h(w.greeting.quote.author)}</cite>`:''}</blockquote>`:'',
    CONTACTS:contacts.join(''), CALENDAR_DAYS:days,
    MAP_NAVER:h(links.naver), MAP_KAKAO:h(links.kakao),
    MAP_TMAP:h(`tmap://route?goalx=${Number(w.venue.lng)}&goaly=${Number(w.venue.lat)}&goalname=${encodeURIComponent(w.venue.name)}`),
    TRANSPORT:(w.venue.transport||[]).map(t=>{
      const type=['subway','bus','car'].includes(t.type)?t.type:'other';
      let detail=multiline(t.detail);
      let rows=[];
      const subway=type==='subway'&&t.detail.match(/^((?:\d+호선(?:,\s*)?)+)\s*(.*)$/);
      if(subway)rows=[...subway[1].matchAll(/(\d+)호선/g)].map(([,line])=>({tone:`line-${line}`,text:`${line}호선 ${subway[2]}`}));
      if(type==='bus'){
        const routes=t.detail.split(',').map(route=>route.trim()).filter(Boolean);
        const known=new Set(busGroups.flatMap(group=>group.text.split(',').map(route=>route.trim())));
        if(routes.every(route=>known.has(route)))rows=busGroups.map(group=>({tone:group.tone,text:`${group.label}버스: ${routes.filter(route=>group.text.split(',').map(value=>value.trim()).includes(route)).join(', ')}`,present:routes.some(route=>group.text.split(',').map(value=>value.trim()).includes(route))})).filter(row=>row.present);
      }
      const content=rows.length?`<ul class="transport-lines">${rows.map(row=>`<li><span class="transport-dot ${h(row.tone)}" aria-hidden="true"></span><span>${h(row.text)}</span></li>`).join('')}</ul>`:`<p>${detail}</p>`;
      return `<article class="transport-${type}"><h3>${h(t.label)}</h3>${content}</article>`;
    }).join(''),
    GALLERY:galleryHtml, NOTICES:notices, ACCOUNTS:accounts, ACCOUNT_NOTE:previewAccounts.note?`<p class="account-note">${multiline(previewAccounts.note)}</p>`:'',
    ENDING:ending?`<img src="${h(ending)}" alt="함께하는 두 사람" width="900" height="1200" loading="lazy">`:'',
    SHARE_BUTTON:w.features.kakaoShare?.enabled&&w.features.kakaoShare.jsKey?'<button class="button share-kakao" type="button" id="kakao-share" aria-label="카카오톡으로 소중한 분께 청첩장 전하기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#FEE500"/><path d="M12 5C7.6 5 4 7.7 4 11c0 2.1 1.5 4 3.8 5.1l-.9 3.2 3.8-2.4 1.3.1c4.4 0 8-2.7 8-6s-3.6-6-8-6Z" fill="#392020"/></svg><span>소중한 분께 청첩장 전하기</span></button>':'',
  };
  let html=await readFile(join(source,'index.html'),'utf8');
  values.RSVP=values.RSVP.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!(key in values))throw new Error(`Unknown RSVP placeholder: ${key}`);return String(values[key]);});
  values.PHOTO_SHARE=values.PHOTO_SHARE.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!(key in values))throw new Error(`Unknown photo share placeholder: ${key}`);return String(values[key]);});
  html=html.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!(key in values))throw new Error(`Unknown preview placeholder: ${key}`);return String(values[key]);});
  await copyFile(join(root,'addons','background-effects.css'),join(assetDir,'background-effects.css'));
  for(const file of ['style.css','drawer.css','opening.css','app.js','guestbook.css','guestbook.js','backend-resilience.js','rsvp.css','rsvp.js','rsvp-entry.js','photo-share.css','photo-share.js','photo-share-core.js'])await copyFile(join(source,file),join(assetDir,file));
  for(const file of ['lottie_svg.min.js','lottie-LICENSE.md','supabase.js','supabase-LICENSE','LaBelleAurore-Regular.ttf','LaBelleAurore-OFL.txt'])await copyFile(join(source,'vendor',file),join(assetDir,file));
  const openingTitle=JSON.parse(await readFile(join(source,'opening-title.json'),'utf8'));
  await writeFile(join(assetDir,'opening-title-data.js'),`window.OPENING_TITLE_DATA = ${JSON.stringify(openingTitle).replace(/</g,'\\u003c')};\n`);
  for(const file of ['profile-groom.png','profile-bride.png','venue-directions.jpg','naver-map.png','tmap.png','kakao-navi.png','chiikawa-wedding-rsvp.png','notice-atm.webp'])await copyFile(join(source,'images',file),join(assetDir,file));
  const config={date:w.ceremony.datetime,dateIso:d.dateIso,names:`${w.groom.name} · ${w.bride.name}`,title:w.site.title,description:w.site.description,venue,address:w.venue.address,lat:w.venue.lat,lng:w.venue.lng,mapKey:w.features.map?.kakaoJsKey||w.features.kakaoShare?.jsKey||'',shareKey:w.features.kakaoShare?.enabled?w.features.kakaoShare.jsKey||'':'',shareImage,publicUrl,gallery};
  config.togetherSince = togetherSince;
  config.rsvp = w.features.rsvp || {enabled:false};
  config.gallery = moments.map(m => base + m.image);
  config.guestbook = JSON.parse(await readFile(join(source,'guestbook-config.json'),'utf8'));
  if(!config.guestbook.publishableKey.startsWith('sb_publishable_'))throw new Error('Guestbook requires a publishable key, never a secret key');
  await writeFile(join(assetDir,'data.js'),`window.PREVIEW_DATA = ${JSON.stringify(config).replace(/</g,'\\u003c')};\n`);
  // Reuse optional RSVP/guestbook/music/video without altering the original addon files.
  const previewWedding=structuredClone(w);
  previewWedding.features.guestbook={enabled:false};
  previewWedding.features.rsvp={enabled:false};
  for(const key of ['rsvp','guestbook'])if(!previewWedding.features[key]?.endpoint)previewWedding.features[key]={enabled:false};
  await writeFile(join(assetDir,'index.html'),html);
  await injectAddons({wedding:previewWedding,id:'preview-test1',out:assetDir,images:makeImages(join(root,'data')),options:{mount:{selector:'#responses'},share:false,accent:'#b8788d',effect:false}});
  html=(await readFile(join(assetDir,'index.html'),'utf8')).replaceAll('src="./addons/',`src="${base}addons/`);
  await writeFile(entry,html);
  await unlink(join(assetDir,'index.html'));
}
