# data/wedding.json

청첩장의 모든 정보를 담는 파일입니다. 어떤 템플릿을 고르든 이 파일 하나만 수정하면 됩니다.
직접 고치기보다 관리자 페이지(`npm run admin` → `http://localhost:4000/admin/`)를 쓰는 것이 편합니다.
사진은 `data/images/` 에 넣고, 경로는 `data/` 기준 상대 경로(`images/cover.jpg`)로 적습니다.

> 주의: GitHub Pages로 배포하면 이 파일은 누구나 볼 수 있습니다. 전화번호·계좌번호는 청첩장에 노출하려는 것만 적으세요.

| 키 | 설명 |
|---|---|
| `template` | 대표 청첩장으로 배포할 템플릿 ID. 갤러리에서 "대표로 선택"을 누르면 바뀝니다. |
| `site.url` | 배포 주소(끝에 `/`). 카카오 공유 썸네일과 `og:image` 절대 경로에 쓰입니다. |
| `site.title` / `site.description` | 카카오톡·문자 공유 미리보기 제목과 설명입니다. |
| `site.ogImage` | 공유 썸네일입니다. 1200×630 JPG, 300KB 이하를 권장합니다. |
| `groom` / `bride` | 이름, 영문 이름, 관계(장남·차녀 등), 연락처, 프로필 사진, 부모 정보. 고인이신 부모님은 `deceased: true` 로 적으면 이름 앞에 故가 표시됩니다. |
| `ceremony.datetime` | 예식 일시(ISO 8601, `+09:00` 포함). 달력과 D-Day는 이 값으로 계산합니다. |
| `venue` | 예식장 이름·홀·주소·좌표(`lat`/`lng`)·교통편. |
| `greeting` | 인사말 제목, 본문(`\n` 줄바꿈), 인용구(비우면 숨김). |
| `notices` | 식사·주차 등 하객 안내. 빈 배열이면 섹션을 숨깁니다. |
| `gallery.cover` / `gallery.photos` | 대표 사진과 갤러리 사진 목록입니다. 사진은 긴 변 1000px 내외로 줄여서 넣으세요. |
| `accounts` | 신랑측·신부측 계좌. `kakaopay` 에 송금 링크를 넣으면 버튼이 표시됩니다. |
| `features.rsvp.enabled` | **참석 여부 받기 on/off.** `askCompanions`(동행 인원), `askMeal`(식사 여부), `deadline`(마감일, 지나면 '마감' 표시), `endpoint`(저장소 주소)를 설정합니다. |
| `features.guestbook` | 방명록 on/off와 저장소 주소(`endpoint`). 저장소는 Google 스프레드시트입니다. |
| `features.kakaoShare` | 카카오톡 공유 on/off와 Kakao JavaScript 키(`jsKey`), 공유 카드 버튼 문구(`buttonText`). |
| `venue.naverPlaceId` / `venue.kakaoPlaceId` | (선택) 지도 앱의 장소 번호. 있으면 지도 버튼이 장소 페이지로, 없으면 이름 검색·좌표로 열립니다. |
| `ceremony.holidays` | (선택) 예식 달의 공휴일 날짜 배열. 일부 템플릿 달력에 빨간 날로 표시됩니다. 예: `[5]` |
| `features.map` | 카카오맵·네이버 지도 키. 카카오맵은 공유 키와 같은 키를 써도 됩니다. |
| `features.music` | 배경음악 on/off와 파일 경로. |

## 템플릿별 반영 방식

`npm run build` 가 `adapters/<id>/adapter.mjs` 로 wedding.json 을 각 템플릿에 적용해 `build/<id>/` 에 결과물을 만듭니다.
원본(`templates/sources/`)은 수정하지 않습니다. 사진이 아직 없으면 템플릿의 데모 사진으로 채우고 빌드 로그에 알려 줍니다.

| 템플릿 | 원래 정보 위치 | 연결 방법 |
|---|---|---|
| t01-hb4258 | `config.js` (`window.CONFIG`) | ✅ config.js 를 생성하고 og 태그를 HTML에 기록 |
| t02-nerdkim | `invitation.conf` + `build.sh` | ✅ 토큰 치환·`js/data.js`·계좌 난독화를 Node 로 이식. 추가 항목은 `templateOptions["t02-nerdkim"]` |
| t03-yoon-ena | `index.html`·`default.js` 에 직접 작성 | ✅ 구조·클래스를 유지한 채 HTML 재생성. 날짜·지도 이미지는 텍스트·지도 링크로 교체 |
| t04 / t05 | `src/data.json` | ✅ data.json·갤러리 목록 생성 후 Vite 빌드. 원작자 Firebase 연결 제거 |
| t06-juhonamnam | `src/const.ts` + `.env` | ✅ 상수 생성, 인사말·교통·식사 안내 패치 후 Vite 빌드(정적 모드) |
| t07-knm8643 | Vue 컴포넌트 안에 직접 작성 | ✅ Blooming Plus 디자인만 남기고 `src/wedding.js` 주입 후 Vite 빌드. 광고·분석 코드 제거 |

## 참석 여부 · 방명록 · 공유 (공통 모듈)

모든 템플릿에 `addons/` 의 공통 모듈이 함께 들어갑니다. 템플릿 디자인과 섞이지 않도록 독립된 영역(Shadow DOM)에 그려지고, 글꼴은 템플릿 것을 따라갑니다.

- **저장소 설정:** [backend/README.md](../backend/README.md) 대로 Google 스프레드시트를 만들고 웹 앱 주소를 `features.rsvp.endpoint`·`features.guestbook.endpoint` 에 넣습니다.
- **주소가 없을 때:** 내 PC(localhost) 미리보기에서는 "저장되지 않는 미리보기"로 보이고, 실제 배포 주소에서는 해당 칸이 숨겨집니다.
- **공유:** 템플릿에 카카오 공유 버튼이 이미 있으면(t01·t02·t06) 템플릿 것을 쓰고, 없으면 모듈이 카카오톡 공유·주소 복사 버튼을 붙입니다.
- **기능 설정만 바꿨을 때:** `npm run build:addons` 로 템플릿을 다시 빌드하지 않고 공통 모듈만 빠르게 갱신할 수 있습니다.
- **로컬 테스트:** `npm run dev` 서버에는 가짜 저장소가 있습니다. endpoint 에 `http://localhost:4000/__mock/apps-script` 를 넣으면 시트 없이 전송·목록을 확인할 수 있습니다(서버를 끄면 사라짐).
