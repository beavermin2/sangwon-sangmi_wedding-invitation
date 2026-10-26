// t04-heejin-hwang: wedding.json → src/data.json + Images.ts, Vite 빌드
import { applyHeejin } from '../lib/heejin-hwang.mjs';

// 공통 모듈: 본문 컨테이너 안, 하단 플로팅 바(nav) 앞에 붙인다(body 가 flex 라 body 끝에 붙이면 옆으로 밀린다).
export const addons = { mount: { selector: '#root > div > nav', where: 'beforebegin' }, accent: '#e88ca6' };

export const copySource = false;

export function apply(ctx) {
  return applyHeejin(ctx, { id: 't04-heejin-hwang', map: 'kakao' });
}
