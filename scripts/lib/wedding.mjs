// 어댑터들이 공통으로 쓰는 wedding.json 파생값과 파일 도구
import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const DAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export const pad2 = (n) => String(n).padStart(2, '0');

// ISO 8601 일시를 KST 기준 구성요소로 분해한다. 빌드 PC의 시간대와 무관하다.
export function kstParts(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) throw new Error(`ceremony.datetime 을 해석할 수 없습니다: ${iso}`);
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  const y = k.getUTCFullYear(), m = k.getUTCMonth() + 1, d = k.getUTCDate();
  const dow = k.getUTCDay(), h24 = k.getUTCHours(), mi = k.getUTCMinutes();
  const h12 = h24 % 12 || 12;
  const ampmKo = h24 < 12 ? '오전' : '오후';
  const dateKo = `${y}년 ${m}월 ${d}일 ${DAY_KO[dow]}요일`;
  const timeKo = `${ampmKo} ${h12}시${mi ? ` ${mi}분` : ''}`;
  return {
    y, m, d, dow, h24, mi, h12, ampmKo, ampm: h24 < 12 ? 'AM' : 'PM',
    dateKo, timeKo, dateTimeKo: `${dateKo} ${timeKo}`,
    dateDot: `${y}.${pad2(m)}.${pad2(d)}`, dateIso: `${y}-${pad2(m)}-${pad2(d)}`,
  };
}

// 고인이신 부모님은 이름 앞에 故 를 붙인다.
export const parentName = (p) => (p && p.name ? (p.deceased ? `故 ${p.name}` : p.name) : '');
export const parentPhone = (p) => (p && !p.deceased ? p.phone || '' : '');

export const enFull = (n) => [n.first, n.last].filter(Boolean).join(' ');

export function venueLine(v) {
  return [v.name, v.floor, v.hall].filter(Boolean).join(' ');
}

export function transportOf(v, type) {
  const t = (v.transport || []).find((x) => x.type === type);
  return t ? t.detail : '';
}

export function noticeOf(w, keyword) {
  const n = (w.notices || []).find((x) => x.title.indexOf(keyword) >= 0);
  return n ? n.detail : '';
}

// 장소 ID 가 있으면 장소 페이지로, 없으면 이름 검색·좌표로 연다.
export function mapLinks(v) {
  const q = encodeURIComponent(v.name);
  return {
    naver: v.naverPlaceId ? `https://map.naver.com/p/entry/place/${v.naverPlaceId}` : `https://map.naver.com/p/search/${q}`,
    naverApp: v.naverPlaceId ? `nmap://place?id=${v.naverPlaceId}` : `nmap://search?query=${q}`,
    kakao: v.kakaoPlaceId
      ? `https://map.kakao.com/link/map/${v.kakaoPlaceId}`
      : v.lat && v.lng
        ? `https://map.kakao.com/link/map/${q},${v.lat},${v.lng}`
        : `https://map.kakao.com/link/search/${q}`,
  };
}

// 계좌 표시 이름. 본인 계좌는 이름만, 부모님 계좌는 관계를 붙인다.
export function accountLabel(a) {
  return a.relation && a.relation !== '신랑' && a.relation !== '신부' ? `${a.owner} (${a.relation})` : a.owner;
}

export const kakaoKey = (w) => {
  const f = w.features || {};
  return f.kakaoShare && f.kakaoShare.enabled ? f.kakaoShare.jsKey || '' : '';
};
export const kakaoMapKey = (w) => {
  const f = w.features || {};
  return (f.map && f.map.kakaoJsKey) || (f.kakaoShare && f.kakaoShare.jsKey) || '';
};

export const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const nl2br = (s) => escapeHtml(s).replace(/\n/g, '<br>');

// data/ 아래 사진 경로를 다루는 도구. 사진이 아직 없으면 null 을 돌려줘
// 어댑터가 템플릿의 데모 사진을 그대로 두게 한다.
export function makeImages(dataDir) {
  const has = (rel) => !!rel && existsSync(join(dataDir, rel));
  return {
    has,
    async copy(rel, destAbs) {
      if (!has(rel)) return false;
      await mkdir(dirname(destAbs), { recursive: true });
      await copyFile(join(dataDir, rel), destAbs);
      return true;
    },
    // 존재하는 갤러리 사진만 순서대로
    gallery: (w) => ((w.gallery && w.gallery.photos) || []).filter(has),
  };
}
