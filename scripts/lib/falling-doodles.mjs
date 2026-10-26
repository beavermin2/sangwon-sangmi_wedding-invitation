// 대표 청첩장의 falling-doodles.jsx와 같은 손그림 꽃을 정적 HTML로 그린다.
const PETAL = 'M0 -3.5 C-5.8 -5 -6.6 -14.5 -0.6 -15.4 C5.6 -16 6.4 -6 0 -3.5 Z';
const ORDER = ['pink', 'yellow', 'white', 'heart', 'pink', 'white', 'yellow', 'sparkle'];
const COLORS = {
  pink: ['#F7B6C6', '#E7849E', '#FFFFFF', '#F09AB0'],
  yellow: ['#F8DD6E', '#E5B934', '#FFFFFF', '#F2C94C'],
  white: ['#ffffff59', '#FFFFFF', '#ffffff59', '#FFFFFF'],
};

function drawing(kind, size) {
  let shape;
  if (kind === 'heart') {
    shape = '<path d="M0 13 C-10 5 -16 -1 -14 -8 C-12 -14 -4 -14 0 -6 C3 -14 12 -14 14 -8 C16 -1 9 5 0 13 Z" fill="#FBD3DE" stroke="#E98BA6" stroke-width="2.6"/>';
  } else if (kind === 'sparkle') {
    shape = '<path d="M0 -15 C1 -4 4 -1 15 0 C4 1 1 4 0 15 C-1 4 -4 1 -15 0 C-4 -1 -1 -4 0 -15 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.5"/>';
  } else {
    const [fill, stroke, center, dot] = COLORS[kind];
    shape = [0, 73, 143, 217, 290].map((angle, i) =>
      `<path d="${PETAL}" fill="${fill}" stroke="${stroke}" stroke-width="2.2" transform="rotate(${angle}) scale(${[1, .94, 1.04, .97, 1.02][i]})"/>`
    ).join('') + `<circle r="4.2" fill="${center}" stroke="${stroke}" stroke-width="1.6"/><circle r="1.6" fill="${dot}"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false"><g stroke-linejoin="round" stroke-linecap="round">${shape}</g></svg>`;
}

export function fallingDoodles() {
  let seed = 20270130;
  const rnd = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const items = Array.from({ length: 9 }, (_, i) => {
    const kind = ORDER[i % ORDER.length];
    const duration = 16 + rnd() * 10;
    const size = Math.round((kind === 'sparkle' ? 8 : kind === 'heart' ? 14 : 16) + rnd() * 7);
    const left = i % 3 === 0 ? 35 + rnd() * 30 : i % 2 === 0 ? 5 + rnd() * 20 : 72 + rnd() * 20;
    const delay = -rnd() * duration;
    const sway = 6 + rnd() * 10, swayTime = 3.2 + rnd() * 2.2;
    const spin = 20 + rnd() * 50, rest = Math.round(rnd() * 90);
    return `<span class="doodle-lane" style="animation-duration:${duration.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s;--doodle-rest:${rest}%"><span class="doodle-item" style="left:${left.toFixed(2)}%;margin-top:-${size}px;animation-duration:${swayTime.toFixed(2)}s;animation-delay:${(-swayTime * (i % 3) / 3).toFixed(2)}s;--doodle-sway:${sway.toFixed(2)}px;--doodle-spin:${spin.toFixed(2)}deg">${drawing(kind, size)}</span></span>`;
  });
  return `<div class="page-doodles" aria-hidden="true">${items.join('')}</div>`;
}
