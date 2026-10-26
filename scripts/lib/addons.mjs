// 공통 모듈(addons/)을 빌드 결과물에 넣는다: 파일 복사, config.js 생성, HTML 에 <script> 삽입.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWER_MARK, kstParts, usesFlowerImage, venueLine, youtubeId } from './wedding.mjs';

const SRC = fileURLToPath(new URL('../../addons/', import.meta.url));
const MARK = '<!-- wedding-addons -->';
const END = '<!-- /wedding-addons -->';

// options (어댑터의 export const addons):
//   mount  { selector, where }  붙일 위치. 없으면 <body> 끝.
//   share  false                템플릿에 카카오 공유 버튼이 이미 있으면 모듈 쪽 공유는 숨긴다.
//   accent '#rrggbb'            템플릿 색에 맞춘 강조색
export async function injectAddons({ wedding: w, id, out, images, options = {} }) {
  const warnings = [];
  const f = w.features || {};
  const dir = join(out, 'addons');
  await mkdir(dir, { recursive: true });
  for (const name of ['wedding-addons.js', 'wedding-addons.css', 'mourn-flower.svg']) await copyFile(join(SRC, name), join(dir, name));
  // 이전 빌드에서 남은 음악·영상 파일 정리
  for (const name of await readdir(dir)) if (/^(bgm|video|video-poster)\./.test(name)) await rm(join(dir, name));

  // 카카오 공유 카드 사진: site.ogImage → gallery.cover 순
  let image = '';
  const pic = [w.site.ogImage, w.gallery.cover].find((p) => images.has(p));
  if (pic) {
    image = `share${extname(pic).toLowerCase()}`;
    await images.copy(pic, join(dir, image));
  }

  // 배경음악·동영상 파일은 data/media/ 에서 addons/ 로 복사(파일이 없으면 기능을 끈다)
  const copyMedia = async (rel, as) => {
    if (!rel || !images.has(rel)) return '';
    const name = `${as}${extname(rel).toLowerCase()}`;
    await images.copy(rel, join(dir, name));
    return name;
  };
  const m = f.music || {};
  const musicSrc = m.enabled ? await copyMedia(m.src, 'bgm') : '';
  if (m.enabled && !musicSrc) warnings.push('배경음악 파일이 없어 BGM 을 넣지 않았습니다');
  const v = f.video || {};
  const yt = v.enabled ? youtubeId(v.youtube) : '';
  const videoSrc = v.enabled && !yt ? await copyMedia(v.src, 'video') : '';
  const poster = v.enabled && videoSrc ? await copyMedia(v.poster, 'video-poster') : '';
  if (v.enabled && !yt && !videoSrc) warnings.push('동영상(유튜브 주소 또는 파일)이 없어 영상 칸을 넣지 않았습니다');

  const when = kstParts(w.ceremony.datetime);
  const kakaoOn = !!(f.kakaoShare && f.kakaoShare.enabled);
  const config = {
    id: `${w.groom.name}-${w.bride.name}-${when.dateIso}`,
    accent: options.accent || '',
    mount: options.mount || null,
    // 고인 표시를 흰 국화 그림으로 바꿀 텍스트 표식
    mournMark: usesFlowerImage() ? FLOWER_MARK : '',
    music: musicSrc ? {
      src: musicSrc,
      autoplay: m.autoplay !== false,
      volume: Math.max(0.05, Math.min(1, Number(m.volume) || 0.6)),
    } : null,
    video: yt || videoSrc ? { title: v.title || '', youtube: yt, src: videoSrc, poster } : null,
    rsvp: f.rsvp && f.rsvp.enabled ? {
      enabled: true,
      endpoint: f.rsvp.endpoint || '',
      deadline: f.rsvp.deadline || '',
      askCompanions: !!f.rsvp.askCompanions,
      askMeal: !!f.rsvp.askMeal,
    } : null,
    guestbook: f.guestbook && f.guestbook.enabled ? { enabled: true, endpoint: f.guestbook.endpoint || '' } : null,
    share: kakaoOn && options.share !== false ? {
      enabled: true,
      kakaoKey: f.kakaoShare.jsKey || '',
      title: w.site.title,
      description: w.site.description || `${when.dateTimeKo} · ${venueLine(w.venue)}`,
      buttonText: f.kakaoShare.buttonText || '',
      image,
    } : null,
  };
  // </script> 로 HTML 이 끊기지 않게 < 를 이스케이프
  await writeFile(join(dir, 'config.js'),
    '/* scripts/build.mjs 가 data/wedding.json 에서 생성했습니다. 직접 고치지 마세요. */\n' +
    `window.__WEDDING_ADDONS__ = ${JSON.stringify(config, null, 2).replace(/</g, '\\u003c')};\n`);

  const tag = `${MARK}\n<script src="./addons/config.js"></script>\n<script src="./addons/wedding-addons.js" defer></script>\n${END}\n`;
  const pages = (await readdir(out)).filter((n) => n.endsWith('.html'));
  for (const page of pages) {
    const file = join(out, page);
    // 다시 넣을 때는 이전 블록을 지우고 새로 넣는다.
    const html = (await readFile(file, 'utf8')).replace(new RegExp(`${MARK}[\\s\\S]*?${END}\\n?`), '');
    const i = html.lastIndexOf('</body>');
    if (i < 0) { warnings.push(`${page}: </body> 가 없어 공통 모듈을 넣지 못했습니다`); continue; }
    await writeFile(file, html.slice(0, i) + tag + html.slice(i));
  }

  if (config.rsvp && !config.rsvp.endpoint) warnings.push('참석 여부 저장소(features.rsvp.endpoint)가 없어 배포본에서는 숨겨집니다 (backend/README.md)');
  if (config.guestbook && !config.guestbook.endpoint) warnings.push('방명록 저장소(features.guestbook.endpoint)가 없어 배포본에서는 숨겨집니다 (backend/README.md)');
  if (config.share && !config.share.kakaoKey) warnings.push('카카오 JS 키가 없어 공유는 기기 공유/주소 복사로 대체됩니다');
  return warnings;
}
