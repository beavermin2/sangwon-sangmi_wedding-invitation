# 참석 여부·방명록 저장소 만들기 (Google 스프레드시트, 무료)

> 페이퍼 & 로즈(`t08-paper-rose`, `test1.html`)의 방명록·좋아요·축하 사진 공유는 Supabase를 사용합니다. 다른 계정/프로젝트로 옮길 때는 [Supabase 이전·DDL·키 교체 안내](supabase/MIGRATION.md)를 먼저 확인하세요. 아래 Google 스프레드시트 안내는 RSVP 및 공통 Google Sheets 방명록용입니다.

청첩장의 **참석 의사 전달**과 **방명록**은 내 구글 스프레드시트에 저장됩니다. 서버가 따로 필요 없고 무료입니다.
한 번만 설정하면 됩니다. (약 5분)

## 1. 스프레드시트와 스크립트 만들기
1. [Google 스프레드시트](https://sheets.google.com)에서 **빈 스프레드시트**를 만들고 이름을 정합니다. 예: `청첩장 응답`
2. 메뉴 **확장 프로그램 → Apps Script** 를 엽니다.
3. 편집기에 있는 기본 코드를 모두 지우고 [`apps-script/Code.gs`](apps-script/Code.gs) 내용을 붙여 넣은 뒤 저장(💾)합니다.

## 2. 웹 앱으로 배포하기
1. 오른쪽 위 **배포 → 새 배포** 를 누릅니다.
2. 유형 선택(⚙️)에서 **웹 앱** 을 고릅니다.
3. 다음처럼 설정합니다.
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
4. **배포** 를 누르고, 권한 승인 화면이 나오면 본인 계정으로 허용합니다.
   ("Google에서 확인하지 않은 앱" 경고가 나오면 **고급 → (프로젝트 이름)(으)로 이동** 을 누릅니다. 내가 만든 스크립트라 괜찮습니다.)
5. 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사합니다.

## 3. wedding.json 에 주소 넣기
같은 주소를 두 곳에 넣습니다.

```json
"features": {
  "rsvp":      { "enabled": true, "endpoint": "https://script.google.com/macros/s/…/exec", … },
  "guestbook": { "enabled": true, "provider": "google-sheets", "endpoint": "https://script.google.com/macros/s/…/exec" },
```

그다음 `npm run build` 를 다시 실행하면 모든 템플릿에 반영됩니다.

## 운영 팁
- **참석여부** 시트는 청첩장에서 보이지 않습니다. 신랑·신부만 시트에서 확인하세요.
- **방명록** 시트의 글은 청첩장에 공개됩니다. 지우고 싶은 글은 `숨김` 칸에 `x` 를 넣으면 화면에서 빠집니다(행을 지워도 됩니다).
- Code.gs 를 고친 뒤에는 **배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포** 를 해야 반영됩니다. 이때 URL 은 바뀌지 않습니다.
- 주소를 넣지 않으면 실제 배포된 청첩장에서는 참석 여부·방명록 칸이 숨겨집니다. 내 PC(localhost) 미리보기에서는 "저장되지 않는 미리보기"로 표시됩니다.
- 하객의 이름과 메시지가 저장되므로, 결혼식이 끝나고 필요 없어지면 시트를 정리하세요.

## 카카오톡 공유 설정
1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → 애플리케이션 추가
2. **앱 키 → JavaScript 키** 를 복사해 `features.kakaoShare.jsKey` 에 넣습니다.
3. **플랫폼 → Web → 사이트 도메인** 에 배포 주소(예: `https://아이디.github.io`)를 등록합니다. 미리보기용으로 `http://localhost:4000` 도 함께 등록해 두면 편합니다.
4. 공유 카드의 사진은 `site.ogImage`(없으면 `gallery.cover`)를 씁니다. 카카오가 사진을 읽으려면 실제 배포 주소에서 공유해야 합니다.
