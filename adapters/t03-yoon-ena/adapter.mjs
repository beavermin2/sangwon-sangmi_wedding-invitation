// t03-yoon-ena: wedding.json → index.html, common/js/default.js 재생성
// 원본은 값이 HTML·JS 에 직접 박혀 있고(날짜·지도는 이미지), 원작 커플의 계좌와 이스터에그가
// 들어 있다. 마크업 구조와 클래스는 그대로 두고 값이 들어가는 부분만 데이터로 다시 그린다.
import { writeFile, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  kstParts, pad2, mapLinks, escapeHtml as e, nl2br, venueLine, deceasedMark,
} from '../../scripts/lib/wedding.mjs';

const DEMO_GALLERY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
  .map((n) => `wedding_${n}.jpg`);

const COPY_ICON = '<svg aria-hidden="true" width="46.08" height="46.08" viewBox="0.48 0.48 23.04 23.04" fill="#222F3D" class="ov-icon" style="font-size: 2.88em;"><path fill="none" d="M0 0h24v24H0z"></path><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>';
const ARROW = '<div class="arrow"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>';
const LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"></path></svg>';

// 원본은 고인을 <i>(故)</i> 로 표시했다. 같은 자리에 공통 고인 표시(기본 🌼)를 쓴다.
const parent = (p) => (p && p.name ? (p.deceased ? `<i>${e(deceasedMark())}</i> ${e(p.name)}` : e(p.name)) : '');

function calendar(y, m, day) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<td><span></span></td>');
  for (let d = 1; d <= last; d++) {
    cells.push(d === day
      ? `<td class="d-day">\n<span>${d}</span>\n<div class="pulsating-circle"></div>\n</td>`
      : `<td><span>${d}</span></td>`);
  }
  while (cells.length % 7) cells.push('<td><span></span></td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>\n${cells.slice(i, i + 7).join('\n')}\n</tr>`);
  return rows.join('\n');
}

function accountBlock(title, list) {
  const items = list.map((a) => `
                                <li>
                                    <div>
                                        <span><i>${e(a.bank)}</i> ${e(a.number)}</span>
                                        <span>${e(a.owner)}</span>
                                    </div>
                                    <button type="button" data-copy="${e(`${a.bank} ${a.number}`)}" data-msg="복사되었습니다. 필요하신 곳에 붙여넣기 하세요!">
                                        ${COPY_ICON}
                                        복사
                                    </button>
                                </li>`).join('');
  return `
                        <div class="account">
                            <div class="account_title">
                                <span>${title}</span>
                                ${ARROW}
                            </div>
                            <ul class="account_list">${items}
                            </ul>
                        </div>`;
}

// 공통 모듈: 하단 복사 버튼 영역(footer) 위에 붙인다. 카카오 공유는 모듈 것을 쓴다.
export const addons = { mount: { selector: '.wedding-card > footer', where: 'beforebegin' }, accent: '#222f3d' };

export async function apply({ wedding: w, out, images }) {
  const warnings = [];
  const when = kstParts(w.ceremony.datetime);
  const links = mapLinks(w.venue);
  const img = join(out, 'common', 'image');

  // 사진: 사용자 사진이 있으면 wd- 접두어로 복사, 없으면 데모 사진 유지
  const cover = images.has(w.gallery.cover) ? `wd-cover${extname(w.gallery.cover).toLowerCase()}` : 'wedding_1.jpg';
  await images.copy(w.gallery.cover, join(img, cover));
  const userGallery = images.gallery(w);
  const gallery = [];
  for (let i = 0; i < userGallery.length; i++) {
    const name = `wd-g${pad2(i + 1)}${extname(userGallery[i]).toLowerCase()}`;
    await images.copy(userGallery[i], join(img, name));
    gallery.push(name);
  }
  if (!gallery.length) warnings.push('갤러리 사진이 없어 데모 사진을 씁니다');
  let ogImage = `./common/image/${cover}`;
  if (images.has(w.site.ogImage)) {
    const name = `wd-og${extname(w.site.ogImage).toLowerCase()}`;
    await images.copy(w.site.ogImage, join(img, name));
    ogImage = `./common/image/${name}`;
  }
  if (w.site.url) ogImage = new URL(ogImage, w.site.url).href;

  const place = venueLine(w.venue);
  const info = `${when.dateTimeKo} ${place}`;
  const greeting = w.greeting.message.split('\n').map((l) => (l ? `<span>${e(l)}</span>` : '')).join('<br>\n                            ');
  const galleryItems = (gallery.length ? gallery : DEMO_GALLERY).map((f) => `
                            <div class="gallery-item">
                                <div>
                                    <a href="./common/image/${f}" class="thumbnail">
                                        <span>
                                            <img src="./common/image/${f}" loading="lazy" alt="">
                                        </span>
                                    </a>
                                </div>
                            </div>`).join('\n');
  const boxes = [{ label: '주소', detail: `${w.venue.address}\n${place}` }].concat(w.venue.transport || [])
    .map((b) => `
                        <div class="box">
                            <b>${e(b.label)}</b>
                            <span>${nl2br(b.detail)}</span>
                        </div>`).join('');
  const mapBtn = 'display:inline-block;margin:0 4px;padding:10px 18px;border:1px solid #d9d9d9;border-radius:20px;font-size:14px;color:#222F3D;text-decoration:none;';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta property="og:title" content="${e(w.site.title)}">
    <meta property="og:description" content="${e(w.site.description || info)}">
    <meta property="og:image" content="${e(ogImage)}">
    <meta property="og:url" content="${e(w.site.url)}">
    <link type="text/css" rel="stylesheet" href="./common/css/reset.css" />
    <link type="text/css" rel="stylesheet" href="./common/css/maplestory_font.css" />
    <link type="text/css" rel="stylesheet" href="./common/css/style.css" />
    <link type="text/css" rel="stylesheet" href="./common/js/plug-in/aos.css" />
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/magnific-popup.js/1.1.0/magnific-popup.min.css">

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/magnific-popup.js/1.1.0/jquery.magnific-popup.min.js"></script>

    <title>${e(w.site.title)}</title>
</head>
<body>
    <div class="wedding-card__wrapper">
        <div class="wedding-card">
            <div class="main" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <div class="main_image">
                        <img src="./common/image/${cover}" alt="">
                    </div>
                    <div class="main_date" style="font-size:40px;letter-spacing:4px;text-align:center;margin-top:24px;color:#222F3D;">
                        ${when.dateDot}
                    </div>
                </div>
            </div><!-- /main  -->

            <div class="contents contents_01" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <div class="who">
                        <span>${e(w.groom.name)}</span>
                        <span>${e(w.bride.name)}</span>
                    </div>
                    <div class="where">
                        <p>${e(when.dateTimeKo)}<br>${e(place)}</p>
                    </div>
                    <div class="invite">
                        <p>
                            ${greeting}
                        </p>
                    </div>
                </div>
            </div><!-- /contents_01  -->

            <div class="contents contents_02" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <div class="who_wrapper">
                        <div class="who">
                            <span>${[parent(w.groom.parents.father), parent(w.groom.parents.mother)].filter(Boolean).join('·')}</span>의 ${e(w.groom.relation)} <b>${e(w.groom.name)}</b>
                        </div>
                        <div class="who">
                            <span>${[parent(w.bride.parents.father), parent(w.bride.parents.mother)].filter(Boolean).join('·')}</span>의 ${e(w.bride.relation)} <b>${e(w.bride.name)}</b>
                        </div>
                    </div>
                </div>
            </div><!-- /contents_02  -->

            <div class="contents contents_03" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <h6>갤러리</h6>
                    <div class="image-gallery">
                        <div class="image-gallery-items">${galleryItems}
                        </div><!-- /image-gallery-items  -->
                    </div><!-- /image-gallery  -->
                </div>
            </div><!-- /contents_03  -->

            <div class="contents contents_04" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <h6>
                        <img src="./common/image/subtext.png" alt="">
                        <span style="display:block;font-size:22px;margin-top:8px;">${when.y}. ${pad2(when.m)}</span>
                    </h6>
                    <div class="calendar-table__wrapper">
                        <table class="calendar_table">
                            <thead>
                                <tr>
                                    <th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th>
                                </tr>
                            </thead>
                            <tbody>
${calendar(when.y, when.m, when.d)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div><!-- /contents_04  -->

            <div class="contents contents_05" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <h6>오시는 길</h6>
                    <div style="text-align:center;padding:8px 0 20px;">
                        <a href="${e(links.naver)}" target="_blank" rel="noopener" style="${mapBtn}">네이버 지도</a>
                        <a href="${e(links.kakao)}" target="_blank" rel="noopener" style="${mapBtn}">카카오맵</a>
                    </div>
                    <div class="box_wrapper">${boxes}
                    </div>
                </div>
            </div><!-- /contents_05  -->

            <div class="contents contents_06" data-aos="fade-up" data-aos-delay="500">
                <div class="inner">
                    <h6>마음 전하실 곳</h6>
                    <div class="account_wrapper">${accountBlock('신랑측 계좌번호', w.accounts.groom)}${accountBlock('신부측 계좌번호', w.accounts.bride)}
                    </div>
                </div>
            </div><!-- /contents_06  -->

            <footer>
                <ul>
                    <li>
                        <button type="button" data-copy-url data-msg="링크가 복사되었습니다. 필요하신 곳에 붙여넣기 하세요!">
                            ${LINK_ICON}
                            청첩장 링크 주소 복사하기
                        </button>
                    </li>
                    <li>
                        <button type="button" data-copy="${e(info)}" data-msg="예식 정보가 복사되었습니다. 필요하신 곳에 붙여넣기 하세요!">
                            ${LINK_ICON}
                            예식 정보 복사하기
                            <span>${e(info)}</span>
                        </button>
                    </li>
                    <li>
                        <button type="button" data-copy="${e(w.venue.address)}" data-msg="예식장 주소가 복사되었습니다. 필요하신 곳에 붙여넣기 하세요!">
                            ${LINK_ICON}
                            예식장 주소 복사하기
                            <span>${e(w.venue.address)}</span>
                        </button>
                    </li>
                </ul>
                <div class="copyright">Template by <span>윤이나</span> (MIT)</div>
            </footer>
        </div>
    </div>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/slick-carousel@1.8.1/slick/slick.min.js"></script>
    <script type="text/javascript" src="./common/js/default.js"></script>
    <script type="text/javascript" src="./common/js/plug-in/aos.js"></script>
    <script>AOS.init();</script>
</body>
</html>
`;
  await writeFile(join(out, 'index.html'), html);

  // 값이 박혀 있던 복사 함수들을 data-copy 속성 하나로 처리하도록 교체
  await writeFile(join(out, 'common', 'js', 'default.js'), `/* scripts/build.mjs 가 생성했습니다. 원본: yoon-ena/wedding (MIT) */
$(document).ready(function() {
    $('.account_title').on('click', function() {
        var $account = $(this).closest('.account');
        $account.find('.account_list').stop().slideToggle();
        $account.toggleClass('on');
        $(this).find('.arrow').toggleClass('on');
    });

    $(document).on('click', '[data-copy], [data-copy-url]', function() {
        var text = this.hasAttribute('data-copy-url') ? location.href : this.getAttribute('data-copy');
        copyToClipboard(text);
        alert(this.getAttribute('data-msg') || '복사되었습니다.');
    });

    $('.thumbnail').magnificPopup({
        type: 'image',
        closeOnContentClick: true,
        closeBtnInside: false,
        gallery: { enabled: true },
        fixedContentPos: true,
        mainClass: 'mfp-no-margins mfp-with-zoom',
        image: { verticalFit: true },
        zoom: { enabled: true, duration: 300 }
    });
});

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
        return;
    }
    var textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = text;
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}
`);
  // 더 이상 쓰지 않는 원작 커플의 날짜·지도·이스터에그 이미지는 결과물에서 뺀다.
  for (const f of ['main_date.png', 'date.png', 'map.png', 'easterEgg.png', 'maplestory.png', 'maplestory1.png', 'maplestory2_right.png', 'thumb.jpg']) {
    await rm(join(img, f), { force: true });
  }
  if (!gallery.length) warnings.push('주의: 데모 사진은 원작 커플의 실제 웨딩 사진입니다. 배포 전 반드시 교체하세요');
  warnings.push('카카오 공유·방명록·RSVP 는 공통 모듈 단계에서 추가됩니다');
  return warnings;
}
