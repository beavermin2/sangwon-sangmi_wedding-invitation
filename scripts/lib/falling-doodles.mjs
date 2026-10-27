// 청첩장 화면 전체에 깔리는 배경 효과(정적 HTML + CSS 애니메이션, 스타일은 previews/test1/effects.css).
// options.backgroundEffect 로 고른다. 기본값 doodles 는 대표 청첩장의 falling-doodles.jsx 와 같은 손그림 꽃이다.
// 관리자 화면도 이 파일을 브라우저에서 그대로 불러 미리보기를 그린다(Node 전용 API 를 쓰지 않는다).
export const EFFECTS = [
  ['doodles', '손그림 꽃·하트 (기본)'],
  ['cherry', '벚꽃 꽃잎이 흩날림'],
  ['fireworks', '폭죽이 터짐'],
  ['starfall', '별빛이 쏟아짐'],
  ['snow', '함박눈이 내림'],
  ['hearts', '하트가 떠오름'],
  ['confetti', '꽃가루(컨페티)가 날림'],
  ['none', '효과 없음'],
];

const PETAL = 'M0 -3.5 C-5.8 -5 -6.6 -14.5 -0.6 -15.4 C5.6 -16 6.4 -6 0 -3.5 Z';
const ORDER = ['pink', 'yellow', 'white', 'heart', 'pink', 'white', 'yellow', 'sparkle'];
const COLORS = {
  pink: ['#F7B6C6', '#E7849E', '#FFFFFF', '#F09AB0'],
  yellow: ['#F8DD6E', '#E5B934', '#FFFFFF', '#F2C94C'],
  white: ['#ffffff59', '#FFFFFF', '#ffffff59', '#FFFFFF'],
};
const HEART = 'M0 13 C-10 5 -16 -1 -14 -8 C-12 -14 -4 -14 0 -6 C3 -14 12 -14 14 -8 C16 -1 9 5 0 13 Z';
const STAR = 'M0 -15 C1 -4 4 -1 15 0 C4 1 1 4 0 15 C-1 4 -4 1 -15 0 C-4 -1 -1 -4 0 -15 Z';
// 끝이 살짝 갈라진 벚꽃잎 한 장
const CHERRY = 'M0 14 C-8 9 -10 -2 -5 -11 C-3 -14 -1 -13 0 -10 C1 -13 3 -14 5 -11 C10 -2 8 9 0 14 Z';
const CONFETTI = ['#E7849E', '#F2C94C', '#8ECDB8', '#9DB6E8', '#C8A2E0', '#F4A27A'];
const FIREWORK = [['#E7849E', '#F7B6C6'], ['#E5B934', '#F8DD6E'], ['#7FB8A4', '#BFE3D5'], ['#8DA6DD', '#C9D6F2'], ['#C58BD8', '#E6CBEF'], ['#F08A6C', '#F9C2AE']];

const svg = (size, shape, viewBox = '-20 -20 40 40') =>
  `<svg width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true" focusable="false"><g stroke-linejoin="round" stroke-linecap="round">${shape}</g></svg>`;

function doodle(kind, size) {
  if (kind === 'heart') return svg(size, `<path d="${HEART}" fill="#FBD3DE" stroke="#E98BA6" stroke-width="2.6"/>`);
  if (kind === 'sparkle') return svg(size, `<path d="${STAR}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.5"/>`);
  const [fill, stroke, center, dot] = COLORS[kind];
  return svg(size, [0, 73, 143, 217, 290].map((angle, i) =>
    `<path d="${PETAL}" fill="${fill}" stroke="${stroke}" stroke-width="2.2" transform="rotate(${angle}) scale(${[1, .94, 1.04, .97, 1.02][i]})"/>`
  ).join('') + `<circle r="4.2" fill="${center}" stroke="${stroke}" stroke-width="1.6"/><circle r="1.6" fill="${dot}"/>`);
}

// 같은 빌드에서는 늘 같은 배치가 나오도록 고정 시드 난수를 쓴다.
function random() {
  let seed = 20270130;
  return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
}

const f2 = (n) => n.toFixed(2);

// 세로로 지나가는 한 줄(lane) 안에서 좌우로 흔들리는 장식 하나.
// lane 이 위→아래(또는 rise 면 아래→위)로 움직이고, item 이 좌우 흔들림·회전을 맡는다.
function lane(rnd, i, o) {
  const delay = -rnd() * o.duration;
  const rest = Math.round(rnd() * 90);
  const swayTime = o.swayTime || 3.2 + rnd() * 2.2;
  return `<span class="doodle-lane" style="animation-duration:${f2(o.duration)}s;animation-delay:${f2(delay)}s;--doodle-rest:${rest}%">`
    + `<span class="doodle-item" style="left:${f2(o.left)}%;margin-top:-${o.size}px;animation-duration:${f2(swayTime)}s;animation-delay:${f2(-swayTime * (i % 3) / 3)}s;--doodle-sway:${f2(o.sway)}px;--doodle-spin:${f2(o.spin)}deg">${o.html}</span></span>`;
}

// 화면 전체에 고르게 퍼지도록 칸을 나눠 위치를 고른다.
const spread = (rnd, i, n) => ((i + .15 + rnd() * .7) / n) * 92 + 2;

const BUILDERS = {
  doodles(rnd) {
    return Array.from({ length: 9 }, (_, i) => {
      const kind = ORDER[i % ORDER.length];
      const duration = 16 + rnd() * 10;
      const size = Math.round((kind === 'sparkle' ? 8 : kind === 'heart' ? 14 : 16) + rnd() * 7);
      const left = i % 3 === 0 ? 35 + rnd() * 30 : i % 2 === 0 ? 5 + rnd() * 20 : 72 + rnd() * 20;
      return lane(rnd, i, { duration, size, left, sway: 6 + rnd() * 10, spin: 20 + rnd() * 50, html: doodle(kind, size) });
    }).join('');
  },
  cherry(rnd) {
    const n = 16;
    return Array.from({ length: n }, (_, i) => {
      const size = Math.round(13 + rnd() * 9);
      const light = rnd() > .5;
      const html = svg(size, `<path d="${CHERRY}" fill="${light ? '#F9CCD7' : '#F4B0C2'}" stroke="#E88AA2" stroke-width="1.4" transform="scale(1.35)"/><path d="M0 10 L0 1" stroke="#EBA0B3" stroke-width="1.2" transform="scale(1.35)"/>`);
      return lane(rnd, i, { duration: 11 + rnd() * 8, size, left: spread(rnd, i, n), sway: 14 + rnd() * 18, swayTime: 2.4 + rnd() * 1.6, spin: 60 + rnd() * 110, html });
    }).join('');
  },
  snow(rnd) {
    const n = 26;
    return Array.from({ length: n }, (_, i) => {
      const size = Math.round(6 + rnd() * 8);
      const html = `<span class="fx-snow" style="width:${size}px;height:${size}px"></span>`;
      return lane(rnd, i, { duration: 12 + rnd() * 10, size, left: spread(rnd, i, n), sway: 5 + rnd() * 12, spin: 0, html });
    }).join('');
  },
  hearts(rnd) {
    const n = 11;
    const tones = [['#FBD3DE', '#E98BA6'], ['#F7B6C6', '#E07898'], ['#FDE3EA', '#EFA3B8']];
    return Array.from({ length: n }, (_, i) => {
      const size = Math.round(12 + rnd() * 10);
      const [fill, stroke] = tones[i % tones.length];
      const html = svg(size, `<path d="${HEART}" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`);
      return lane(rnd, i, { duration: 13 + rnd() * 9, size, left: spread(rnd, i, n), sway: 8 + rnd() * 10, spin: 8 + rnd() * 14, html });
    }).join('');
  },
  confetti(rnd) {
    const n = 24;
    return Array.from({ length: n }, (_, i) => {
      const w = Math.round(5 + rnd() * 3), hgt = Math.round(9 + rnd() * 5);
      const color = CONFETTI[i % CONFETTI.length];
      const round = rnd() > .7;
      const flip = 1.1 + rnd() * 1.4;
      const html = `<span class="fx-confetti" style="width:${round ? w + 2 : w}px;height:${round ? w + 2 : hgt}px;background:${color};border-radius:${round ? '50%' : '1.5px'};animation-duration:${f2(flip)}s;animation-delay:${f2(-rnd() * flip)}s"></span>`;
      return lane(rnd, i, { duration: 8 + rnd() * 6, size: hgt, left: spread(rnd, i, n), sway: 10 + rnd() * 16, swayTime: 1.8 + rnd() * 1.4, spin: 40 + rnd() * 140, html });
    }).join('');
  },
  starfall(rnd) {
    const n = 18;
    const stars = Array.from({ length: n }, (_, i) => {
      const size = Math.round(9 + rnd() * 9);
      const gold = rnd() > .4;
      const twinkle = 1.2 + rnd() * 1.6;
      const html = `<span class="fx-twinkle" style="animation-duration:${f2(twinkle)}s;animation-delay:${f2(-rnd() * twinkle)}s">${svg(size, `<path d="${STAR}" fill="${gold ? '#F7D774' : '#FFF4CF'}" stroke="${gold ? '#D9A425' : '#E0B44A'}" stroke-width="1.6"/>`)}</span>`;
      return lane(rnd, i, { duration: 7 + rnd() * 6, size, left: spread(rnd, i, n), sway: 3 + rnd() * 6, spin: 15 + rnd() * 30, html });
    });
    // 가끔 대각선으로 긴 꼬리를 그리며 떨어지는 별똥별
    const shoots = Array.from({ length: 4 }, (_, i) => {
      const duration = 6 + rnd() * 4;
      return `<span class="fx-shoot" style="left:${f2(40 + rnd() * 55)}%;top:${f2(rnd() * 45)}%;animation-duration:${f2(duration)}s;animation-delay:${f2(i * 2.3 + rnd())}s"></span>`;
    });
    return stars.join('') + shoots.join('');
  },
  fireworks(rnd) {
    const bursts = 6;
    return Array.from({ length: bursts }, (_, b) => {
      const [main, soft] = FIREWORK[b % FIREWORK.length];
      const duration = 3.4 + rnd() * 1.2;
      const radius = Math.round(38 + rnd() * 28);
      const count = 14;
      const sparks = Array.from({ length: count }, (_, s) => {
        const angle = (360 / count) * s + rnd() * 8;
        const reach = Math.round(radius * (.8 + rnd() * .3));
        return `<span class="fx-spark" style="--fx-a:${f2(angle)}deg;--fx-r:${reach}px;background:${s % 2 ? soft : main}"></span>`;
      }).join('');
      // 터지기 전 아래에서 올라오는 불꽃 줄기
      const trail = `<span class="fx-trail" style="background:linear-gradient(to top,transparent,${main})"></span>`;
      return `<span class="fx-burst" style="left:${f2(12 + rnd() * 76)}%;top:${f2(10 + rnd() * 55)}%;--fx-d:${f2(duration)}s;--fx-dl:${f2(b * .6 + rnd() * .3)}s">${trail}<span class="fx-flash" style="background:${soft}"></span>${sparks}</span>`;
    }).join('');
  },
};

export function backgroundEffect(kind = 'doodles') {
  if (kind === 'none') return '';
  const build = BUILDERS[kind] || BUILDERS.doodles;
  const name = BUILDERS[kind] ? kind : 'doodles';
  return `<div class="page-doodles" data-effect="${name}" aria-hidden="true">${build(random())}</div>`;
}

// 이전 이름(기본 손그림 꽃)
export const fallingDoodles = () => backgroundEffect('doodles');
