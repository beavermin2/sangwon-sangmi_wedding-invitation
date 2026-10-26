// test1 시안 원본을 그대로 재사용하는 페이퍼 & 로즈 템플릿.
import { fileURLToPath } from 'node:url';
import { buildPaperRose } from '../../scripts/build-previews.mjs';

export const sourcePath = 'previews/test1';
export const copySource = false;
// 사진 방명록과 기존 공통 기능이 중복되지 않도록 렌더러가 직접 주입한다.
export const managesAddons = true;
// 자체 디자인이며 Lottie/Supabase 고지는 렌더러가 각 라이브러리와 함께 복사한다.
export const license = false;

export async function apply({ wedding, out }) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  await buildPaperRose({ root, dist: out, wedding, template: true });
  return [];
}
