// t01-hb4258 글씨 색: 관리자(admin/index.html)와 어댑터가 함께 쓰는 목록.
// options.textColors 의 키 → 색(#rrggbb). 비운 항목은 아래 순서로 정한다.
//   부분 색(예: noticeTitle) → 그 부분이 원래 쓰던 묶음 색(ROLES, 예: text) → 템플릿 기본색

// 묶음 색: 템플릿 theme.jsx 의 원래 글씨 색. 한 번에 바꾸고 싶을 때 쓴다.
export const ROLES = [
  ['text', '본문', '#2B2620'],
  ['textSoft', '설명', '#5F564B'],
  ['textMuted', '보조', '#A09789'],
  ['accent', '포인트', '#2E4A7B'],
];

// 부분 색: [키, 화면 이름, 원래 묶음]
export const PARTS = [
  ['공통 제목', [
    ['sectionEn', '섹션 영문 제목 (NOTICE 등)', 'accent'],
    ['sectionKo', '섹션 한글 제목 (안내사항 등)', 'text'],
  ]],
  ['표지', [
    ['coverTitle', 'The Wedding Invitation', 'accent'],
    ['coverNames', '영문 이름', 'text'],
    ['coverDate', '날짜', 'accent'],
    ['coverVenue', '시간·장소', 'textMuted'],
  ]],
  ['인사말', [
    ['quote', '인용구', 'text'],
    ['quoteAuthor', '인용구 출처', 'textMuted'],
    ['greeting', '인사말 본문', 'textSoft'],
    ['parentNames', '부모님 성함', 'text'],
    ['parentLabel', '"의 아들/딸"', 'textMuted'],
    ['coupleNames', '신랑·신부 이름', 'accent'],
  ]],
  ['신랑·신부 소개', [
    ['profileRole', '신랑/신부 표시', 'accent'],
    ['profileName', '이름', 'text'],
    ['profileSub', '영문 이름·소개', 'textSoft'],
  ]],
  ['연락하기', [
    ['contactTitle', '신랑측/신부측', 'accent'],
    ['contactName', '이름', 'text'],
    ['contactSub', '관계·설명', 'textSoft'],
  ]],
  ['예식 일시', [
    ['dateMain', '날짜·시간', 'text'],
    ['dateSub', '오전/오후', 'textMuted'],
    ['venueName', '예식장 이름', 'text'],
    ['venueSub', '층·홀·주소', 'textSoft'],
  ]],
  ['달력', [
    ['calendarAccent', '월·요일·예식일', 'accent'],
    ['calendarText', '연도·날짜', 'text'],
    ['calendarSub', 'D-Day 안내', 'textSoft'],
  ]],
  ['갤러리', [
    ['gallerySub', '갤러리 글씨', 'textSoft'],
  ]],
  ['오시는 길', [
    ['mapName', '장소 이름', 'text'],
    ['mapSub', '주소·안내', 'textSoft'],
    ['mapAccent', '길찾기 버튼·교통 아이콘', 'accent'],
    ['transportTitle', '교통편 제목', 'text'],
    ['transportDetail', '교통편 내용', 'textSoft'],
  ]],
  ['안내사항', [
    ['noticeTitle', '안내 제목', 'text'],
    ['noticeDetail', '안내 내용', 'textSoft'],
  ]],
  ['마음 전하실 곳', [
    ['accountLabel', '신랑측/신부측 계좌번호', 'text'],
    ['accountNumber', '계좌번호', 'text'],
    ['accountSub', '은행·예금주·복사', 'textMuted'],
    ['accountNote', '안내 문구', 'textSoft'],
  ]],
  ['공유', [
    ['shareText', '공유 안내 글씨', 'textSoft'],
  ]],
];

// 템플릿 컴포넌트 안의 THEME.<묶음> 을 몇 번째 것인지로 찾아 THEME.<부분> 으로 바꾼다.
// [파일, 함수, 묶음, 그 함수 안에서 그 묶음이 나오는 순서대로의 부분 키(null 은 그대로 둠)]
// 템플릿 원본이 바뀌어 개수가 달라지면 빌드를 멈춘다.
export const USES = [
  ['theme.jsx', 'SectionTitle', 'accent', ['sectionEn', null, null, null]],
  ['theme.jsx', 'SectionTitle', 'text', ['sectionKo']],
  ['sections-a.jsx', 'CoverSection', 'accent', ['coverTitle', 'coverNames', 'coverDate']],
  ['sections-a.jsx', 'CoverSection', 'text', ['coverNames']],
  ['sections-a.jsx', 'CoverSection', 'textSoft', ['coverDate']],
  ['sections-a.jsx', 'CoverSection', 'textMuted', ['coverVenue']],
  ['sections-a.jsx', 'InvitationSection', 'text', ['quote', 'parentNames']],
  ['sections-a.jsx', 'InvitationSection', 'textMuted', ['quoteAuthor', 'parentLabel', 'parentLabel', 'parentLabel', 'parentLabel']],
  ['sections-a.jsx', 'InvitationSection', 'textSoft', ['greeting']],
  ['sections-a.jsx', 'InvitationSection', 'accent', ['coupleNames', 'coupleNames']],
  ['sections-a.jsx', 'ProfileSection', 'accent', ['profileRole', 'profileRole']],
  ['sections-a.jsx', 'ProfileSection', 'text', ['profileName']],
  ['sections-a.jsx', 'ProfileSection', 'textMuted', ['profileSub']],
  ['sections-a.jsx', 'ProfileSection', 'textSoft', ['profileSub', 'profileSub']],
  ['sections-a.jsx', 'ParentsSection', 'textSoft', ['contactSub']],
  ['sections-a.jsx', 'ParentsSection', 'accent', ['contactTitle']],
  ['sections-a.jsx', 'ParentsSection', 'text', ['contactName', 'contactName']],
  ['sections-a.jsx', 'ParentsSection', 'textMuted', ['contactSub']],
  ['sections-a.jsx', 'DateTimeSection', 'accent', ['dateMain']],
  ['sections-a.jsx', 'DateTimeSection', 'text', ['dateMain', 'dateMain', 'venueName']],
  ['sections-a.jsx', 'DateTimeSection', 'textMuted', ['dateSub', 'venueSub']],
  ['sections-a.jsx', 'DateTimeSection', 'textSoft', ['venueSub']],
  ['sections-a.jsx', 'CalendarSection', 'accent', ['calendarAccent', 'calendarAccent', 'calendarAccent', 'calendarAccent']],
  ['sections-a.jsx', 'CalendarSection', 'text', ['calendarText', 'calendarText']],
  ['sections-a.jsx', 'CalendarSection', 'textMuted', ['calendarSub']],
  ['sections-a.jsx', 'CalendarSection', 'textSoft', ['calendarSub']],
  ['sections-b.jsx', 'GallerySection', 'textSoft', ['gallerySub']],
  ['sections-b.jsx', 'GallerySection', 'accent', ['gallerySub']],
  ['sections-b.jsx', 'MapSection', 'textSoft', ['mapSub', 'mapSub', 'transportDetail']],
  ['sections-b.jsx', 'MapSection', 'accent', ['mapAccent', 'mapAccent', 'mapAccent', 'mapAccent']],
  ['sections-b.jsx', 'MapSection', 'textMuted', ['mapSub']],
  ['sections-b.jsx', 'MapSection', 'text', ['mapName', 'transportTitle']],
  ['sections-b.jsx', 'NoticeSection', 'text', ['noticeTitle']],
  ['sections-b.jsx', 'NoticeSection', 'textSoft', ['noticeDetail']],
  ['sections-b.jsx', 'AccountsSection', 'text', ['accountLabel', 'accountNumber']],
  ['sections-b.jsx', 'AccountsSection', 'accent', ['accountLabel']],
  ['sections-b.jsx', 'AccountsSection', 'textMuted', ['accountSub']],
  ['sections-b.jsx', 'AccountsSection', 'textSoft', ['accountSub', 'accountNote']],
  ['sections-b.jsx', 'ShareSection', 'textSoft', ['shareText']],
];

const HEX = /^#[0-9a-f]{6}$/i;
const roleDefault = Object.fromEntries(ROLES.map(([k, , d]) => [k, d]));

// wedding.json 의 options.textColors → 묶음 4개 + 부분 전부의 최종 색
export function resolveColors(chosen = {}) {
  const pick = (k) => (HEX.test(chosen[k] || '') ? chosen[k] : '');
  const out = {};
  for (const [k] of ROLES) out[k] = pick(k) || roleDefault[k];
  for (const [, parts] of PARTS) for (const [k, , role] of parts) out[k] = pick(k) || out[role];
  return out;
}
