// Design previews are additive: the selected invitation and its assets are never changed.
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { injectAddons } from './lib/addons.mjs';
import { escapeHtml as h, kstParts, mapLinks, makeImages, useWedding, parentName, MONTH_EN } from './lib/wedding.mjs';

export async function buildPreviews({ root, dist, wedding: w }) {
  const id = 'test1';
  const entry = join(dist, `${id}.html`);
  const assetDir = join(dist, 'preview-assets', id);
  if (existsSync(entry) || existsSync(assetDir)) throw new Error('Preview output would overwrite existing invitation files');
  await mkdir(assetDir, { recursive: true });
  const base = `./preview-assets/${id}/`;
  const source = join(root, 'previews', id);
  const dataRoot = resolve(root, 'data');
  let imageIndex = 0;
  const copied = new Map();
  async function photo(rel) {
    if (!rel) return '';
    const full = resolve(dataRoot, rel);
    if (!full.startsWith(dataRoot + sep) || !existsSync(full) || !/\.(jpe?g|png|webp)$/i.test(full)) return '';
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
  const d = kstParts(w.ceremony.datetime);
  const weekday = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.dow];
  const venue = [w.venue.name, w.venue.floor, w.venue.hall].filter(Boolean).join(' ');
  const siteRoot = w.site.url || process.env.SITE_URL || '';
  const siteBase = siteRoot ? new URL(siteRoot.endsWith('/') ? siteRoot : siteRoot + '/') : null;
  const publicUrl = siteBase ? new URL(`${id}.html`, siteBase).href : '';
  const ogImage = siteBase && shareImage ? new URL(shareImage, siteBase).href : shareImage;
  const links = mapLinks(w.venue);
  const phone = value => String(value || '').replace(/[^+\d]/g, '');
  const multiline = value => h(value).replace(/\n/g, '<br>');
  const heading = (en,ko) => `<header class="section-heading"><p class="eyebrow">${en}</p><h2>${h(ko)}</h2></header>`;
  useWedding(w);
  const family = p => `<p>${[parentName(p.parents.father),parentName(p.parents.mother)].filter(Boolean).map(h).join('<span class="dot">·</span>')}<span class="relation">의 ${h(p.relation)}</span><strong>${h(p.name)}</strong></p>`;
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
    days+=`<span class="calendar-day${day===d.d?' selected':''}${dow===0||holiday?' holiday':''}"${day===d.d?' aria-label="'+h(d.dateKo)+' 결혼식"':''}>${day}</span>`;
  }
  const accounts = [['groom','신랑측',w.accounts.groom],['bride','신부측',w.accounts.bride]].map(([key,label,rows]) => {
    if(!rows.length)return '';
    return `<details class="account"><summary>${label} 계좌번호<span aria-hidden="true">＋</span></summary><div class="account-body">${rows.map(a=>`<div class="account-row"><div><strong>${h(a.owner)}</strong><p>${h(a.bank)}<br>${h(a.number)}</p></div><button type="button" class="copy-button" data-copy="${h(a.number.replace(/\D/g,''))}" data-copy-message="계좌번호를 복사했습니다" aria-label="${h(a.owner)} 계좌번호 복사">복사</button></div>`).join('')}</div></details>`;
  }).join('');
  const galleryHtml=gallery.length?`<section id="gallery" class="section gallery-section">${heading('GALLERY','우리의 소중한 순간')}<div class="gallery-grid ${gallery.length===1?'single':''}">${gallery.map((src,i)=>`<button class="gallery-photo" type="button" data-photo="${h(src)}" aria-label="웨딩 사진 ${i+1} 크게 보기"><img src="${h(src)}" alt="웨딩 사진 ${i+1}" loading="lazy" width="900" height="1200"><span aria-hidden="true">＋</span></button>`).join('')}</div><p class="subtle">사진을 누르면 크게 볼 수 있습니다.</p></section>`:'';
  const notices=(w.notices||[]).length?`<section class="section notice-section">${heading('NOTICE','전해드리는 안내')}<div class="notice-list">${w.notices.map(n=>`<article><span class="notice-mark" aria-hidden="true">${h(n.icon||'♡')}</span><h3>${h(n.title)}</h3><p>${multiline(n.detail)}</p></article>`).join('')}</div></section>`:'';
  const values={
    TITLE:h(w.site.title), DESCRIPTION:h(w.site.description), PUBLIC_URL:h(publicUrl), OG_IMAGE:h(ogImage), ASSET:base,
    DATE:`${d.y} / ${String(d.m).padStart(2,'0')} / ${String(d.d).padStart(2,'0')}`, WEEKDAY:weekday,
    DATE_DOT:d.dateDot, DATE_TIME:h(d.dateTimeKo), TIME:h(d.timeKo), YEAR:d.y, MONTH:MONTH_EN[d.m-1], DAY:d.d,
    NAMES:`${h(w.groom.name)}<span class="dot">·</span>${h(w.bride.name)}`, NAME_TEXT:h(`${w.groom.name} · ${w.bride.name}`),
    EN_NAMES:h(`${w.groom.nameEn.first} & ${w.bride.nameEn.first}`), VENUE:h(venue), ADDRESS:h(w.venue.address),
    HERO:cover?`<img class="hero-image" src="${h(cover)}" alt="${h(w.groom.name)}과 ${h(w.bride.name)}의 웨딩 사진" width="1024" height="1536" fetchpriority="high">`:'',
    GREETING_TITLE:h(w.greeting.title), GREETING:multiline(w.greeting.message), FAMILY:family(w.groom)+family(w.bride),
    CONTACTS:contacts.join(''), CALENDAR_DAYS:days,
    MAP_NAVER:h(links.naver), MAP_KAKAO:h(links.kakao),
    TRANSPORT:(w.venue.transport||[]).map(t=>`<article><h3>${h(t.label)}</h3><p>${multiline(t.detail)}</p></article>`).join(''),
    GALLERY:galleryHtml, NOTICES:notices, ACCOUNTS:accounts, ACCOUNT_NOTE:multiline(w.accounts.note),
    ENDING:ending?`<img src="${h(ending)}" alt="함께하는 두 사람" width="900" height="1200" loading="lazy">`:'',
    SHARE_BUTTON:w.features.kakaoShare?.enabled&&w.features.kakaoShare.jsKey?'<button class="button share-kakao" type="button" id="kakao-share">카카오톡으로 초대장 보내기</button>':'',
  };
  let html=await readFile(join(source,'index.html'),'utf8');
  html=html.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!(key in values))throw new Error(`Unknown preview placeholder: ${key}`);return String(values[key]);});
  for(const file of ['style.css','app.js'])await copyFile(join(source,file),join(assetDir,file));
  const config={date:w.ceremony.datetime,dateIso:d.dateIso,names:`${w.groom.name} · ${w.bride.name}`,title:w.site.title,description:w.site.description,venue,address:w.venue.address,lat:w.venue.lat,lng:w.venue.lng,mapKey:w.features.map?.kakaoJsKey||w.features.kakaoShare?.jsKey||'',shareKey:w.features.kakaoShare?.enabled?w.features.kakaoShare.jsKey||'':'',shareImage,publicUrl,gallery};
  await writeFile(join(assetDir,'data.js'),`window.PREVIEW_DATA = ${JSON.stringify(config).replace(/</g,'\\u003c')};\n`);
  // Reuse optional RSVP/guestbook/music/video without altering the original addon files.
  const previewWedding=structuredClone(w);
  for(const key of ['rsvp','guestbook'])if(!previewWedding.features[key]?.endpoint)previewWedding.features[key]={enabled:false};
  await writeFile(join(assetDir,'index.html'),html);
  await injectAddons({wedding:previewWedding,id:'preview-test1',out:assetDir,images:makeImages(join(root,'data')),options:{mount:{selector:'#responses'},share:false,accent:'#b8788d'}});
  html=(await readFile(join(assetDir,'index.html'),'utf8')).replaceAll('src="./addons/',`src="${base}addons/`);
  await writeFile(entry,html);
  await unlink(join(assetDir,'index.html'));
  console.log('✓ test1.html — paper & rose design preview (original invitation preserved)');
}
