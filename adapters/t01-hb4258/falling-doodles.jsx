// 화면 전체에 흩날리는 손그림 꽃 — 대표 사진의 낙서 꽃(분홍·노랑·흰 꽃, 하트, 반짝이)과 같은 모양.
// adapter.mjs 가 components/ 로 복사하고 청첩장 맨 위 층에 넣는다. 스크롤해도 화면에 고정된 채 떨어진다.

const DOODLE_STYLE = `
@keyframes dd-fall {
  0%   { transform: translateY(-12%); opacity: 0; }
  8%   { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(105%); opacity: 0; }
}
@keyframes dd-sway {
  from { transform: translateX(calc(var(--dd-sway) * -1)) rotate(calc(var(--dd-spin) * -1)); }
  to   { transform: translateX(var(--dd-sway)) rotate(var(--dd-spin)); }
}
.dd-lane { position: absolute; inset: 0; animation: dd-fall linear infinite; will-change: transform; }
.dd-item { position: absolute; top: 0; animation: dd-sway ease-in-out infinite alternate; }
.dd-item svg { display: block; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.12)); }
@media (prefers-reduced-motion: reduce) {
  .dd-lane, .dd-item { animation: none; }
  .dd-lane { transform: translateY(var(--dd-rest)); }
}
`;

// 꽃잎 하나 — 둥글고 살짝 삐뚤게 (손으로 그린 느낌)
const DD_PETAL = 'M0 -3.5 C-5.8 -5 -6.6 -14.5 -0.6 -15.4 C5.6 -16 6.4 -6 0 -3.5 Z';

function DoodleFlower({ size, fill, stroke, center, dot }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        {[0, 73, 143, 217, 290].map((r, i) => (
          <path key={i} d={DD_PETAL} fill={fill} stroke={stroke} strokeWidth="2.2"
            transform={`rotate(${r}) scale(${[1, 0.94, 1.04, 0.97, 1.02][i]})`} />
        ))}
        <circle r="4.2" fill={center} stroke={stroke} strokeWidth="1.6" />
        {dot && <circle r="1.6" fill={dot} />}
      </g>
    </svg>
  );
}

function DoodleHeart({ size }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <path d="M0 13 C-10 5 -16 -1 -14 -8 C-12 -14 -4 -14 0 -6 C3 -14 12 -14 14 -8 C16 -1 9 5 0 13 Z"
        fill="#FBD3DE" stroke="#E98BA6" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

function DoodleSparkle({ size }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <path d="M0 -15 C1 -4 4 -1 15 0 C4 1 1 4 0 15 C-1 4 -4 1 -15 0 C-4 -1 -1 -4 0 -15 Z"
        fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const DD_KINDS = {
  pink:    (s) => <DoodleFlower size={s} fill="#F7B6C6" stroke="#E7849E" center="#FFFFFF" dot="#F09AB0" />,
  yellow:  (s) => <DoodleFlower size={s} fill="#F8DD6E" stroke="#E5B934" center="#FFFFFF" dot="#F2C94C" />,
  white:   (s) => <DoodleFlower size={s} fill="rgba(255,255,255,0.35)" stroke="#FFFFFF" center="rgba(255,255,255,0.35)" dot="#FFFFFF" />,
  heart:   (s) => <DoodleHeart size={s} />,
  sparkle: (s) => <DoodleSparkle size={s} />,
};

// 매번 같은 배치가 나오도록 고정 시드 난수
function ddRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const DD_ORDER = ['pink', 'yellow', 'white', 'heart', 'pink', 'white', 'yellow', 'sparkle'];

function FallingDoodles({ count = 18 }) {
  const items = React.useMemo(() => {
    const rnd = ddRandom(20270130);
    return Array.from({ length: count }, (_, i) => {
      const kind = DD_ORDER[i % DD_ORDER.length];
      const duration = 11 + rnd() * 9;
      return {
        kind,
        size: Math.round((kind === 'sparkle' ? 12 : kind === 'heart' ? 20 : 24) + rnd() * 12),
        left: 2 + ((i * 37 + rnd() * 18) % 92),
        duration,
        delay: -rnd() * duration, // 처음부터 화면 곳곳에 흩어져 있게
        sway: 10 + rnd() * 22,
        swayTime: 2.4 + rnd() * 2.2,
        spin: 20 + rnd() * 50,
        rest: Math.round(rnd() * 90),
      };
    });
  }, [count]);

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 20 }}>
      <style>{DOODLE_STYLE}</style>
      {items.map((it, i) => (
        <div key={i} className="dd-lane" style={{
          animationDuration: `${it.duration}s`, animationDelay: `${it.delay}s`, '--dd-rest': `${it.rest}%`,
        }}>
          <div className="dd-item" style={{
            left: `${it.left}%`, marginTop: -it.size,
            animationDuration: `${it.swayTime}s`, animationDelay: `${-it.swayTime * (i % 3) / 3}s`,
            '--dd-sway': `${it.sway}px`, '--dd-spin': `${it.spin}deg`,
          }}>{DD_KINDS[it.kind](it.size)}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { FallingDoodles });
