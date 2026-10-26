// t05-wkdtjsgur100: t04 파생작. 네이버 지도를 쓰고 벚꽃 효과가 들어 있다.
import { applyHeejin } from '../lib/heejin-hwang.mjs';

// 공통 모듈: 본문 컨테이너 안, 하단 플로팅 바(nav) 앞에 붙인다(body 가 flex 라 body 끝에 붙이면 옆으로 밀린다).
export const addons = { mount: { selector: '#root > div > nav', where: 'beforebegin' }, accent: '#e88ca6' };

export const copySource = false;

export function apply(ctx) {
  return applyHeejin(ctx, {
    id: 't05-wkdtjsgur100',
    map: 'naver',
    demoWarning: '주의: 데모 사진은 원작 커플의 실제 웨딩 사진입니다. 배포 전 반드시 교체하세요',
  });
}
