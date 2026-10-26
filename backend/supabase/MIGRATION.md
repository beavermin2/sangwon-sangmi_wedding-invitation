# Supabase 계정·프로젝트 이전 및 배포 준비

작성 기준: 2026-10-27. 페이퍼 & 로즈(`t08-paper-rose`, `test1.html`)의 실제 코드와 현재 DB 스키마 기준입니다. 새 프로젝트에 필요한 **DDL·권한·저장소·API 키·관리자 연결**을 함께 정리했습니다.

## 1. 계정만 바꾸는지, 프로젝트도 새로 만드는지 확인

| 상황 | 작업 |
| --- | --- |
| 다른 계정으로 같은 프로젝트를 관리 | 새 계정에 프로젝트 접근 권한을 부여하거나 조직 간 프로젝트 이전을 검토합니다. 같은 프로젝트를 계속 쓴다면 DDL을 재설치할 필요가 없습니다. 실제 Project URL과 키가 유지됐는지 확인합니다. |
| 다른 계정에서 새 Supabase 프로젝트 생성 | 아래 순서대로 설치하고 URL·Publishable key를 함께 교체합니다. 새 DB에는 기존 메시지·사진이 자동 복사되지 않습니다. |
| 기존 프로젝트에서 API 키만 교체 | 새 Publishable key로 설정 파일을 바꾸고 재빌드·배포합니다. 기존 DB, Storage, 로컬 관리자 키는 그대로 사용합니다. |

조직 간 이전의 권한·제약은 [Supabase 프로젝트 이전 안내](https://supabase.com/docs/guides/platform/project-transfer)를 확인하세요. 이 문서의 기본 절차는 **빈 새 프로젝트 설치**입니다. 기존 DB 복원을 원하면 먼저 8절을 읽으세요.

## 2. 기능별 저장 위치

| 기능 | 저장 위치 | 하객 열람 |
| --- | --- | --- |
| 공개 방명록 | `public.wedding_guestbook` | `is_visible=true`인 글의 공개 컬럼만 |
| 방명록 첨부 사진 | `wedding-guestbook` 버킷, WebP 최대 512,000바이트 | 공개 글에 연결된 사진만 서명 URL로 열람 |
| 방명록 좋아요 | `public.wedding_guestbook_likes` | RPC로 합계와 본인 상태만 확인 |
| 축하 사진 공유(가공) | `wedding-shared-photos` 버킷, JPEG 최대 2,097,152바이트 | 열람·목록·다운로드 불가 |
| 축하 사진 공유(원본) | `wedding-original-photos` 버킷, 최대 26,214,400바이트 | 열람·목록·다운로드 불가 |
| 사진을 보낸 분·이야기·원본 파일명 | `public.wedding_shared_photos` | 열람 불가 |
| 업로드 시작·저장 방식 | `public.wedding_photo_settings` | 상태 조회 RPC만 공개 |
| 사진 설정 변경용 비밀키 해시 | `public.wedding_photo_admin` | 열람 불가 |
| 참석 의사(RSVP) | Google Apps Script / Google 스프레드시트 | 신랑·신부가 시트에서 확인 |

버킷 3개는 모두 **Private**입니다. 공개 방명록 사진과 신랑·신부 전용 축하 사진은 서로 다른 권한을 사용합니다. Private 버킷이라도 공개 방명록에는 제한된 SELECT 정책이 있으므로 두 기능을 혼동하지 마세요.

RSVP는 Supabase 이전 대상이 아닙니다. `data/wedding.json`의 `features.rsvp.endpoint`를 유지하며, Google 계정까지 이전할 때는 [Apps Script 안내](../README.md)를 별도로 따릅니다.

## 3. 새 프로젝트에서 먼저 설정할 항목

1. 새 계정으로 Supabase 프로젝트를 만들고 프로젝트가 준비될 때까지 기다립니다.
2. 프로젝트의 Connect 또는 Settings / API 관련 화면에서 **Project URL**과 **Publishable key**(`sb_publishable_...`)를 확인합니다.
3. Authentication의 로그인 설정에서 **Anonymous Sign-Ins**를 켭니다. 새 사용자 가입도 허용되어 있어야 합니다. 방명록 작성, 좋아요, 축하 사진 전송 모두 익명 로그인으로 `authenticated` 역할을 얻습니다. Publishable key만 넣는 것으로 이 로그인 설정이 대체되지는 않습니다. [공식 익명 로그인 안내](https://supabase.com/docs/guides/auth/auth-anonymous)
4. Data API가 활성화되어 있고 `public` 스키마가 노출 대상인지 확인합니다. 테이블은 아래 SQL의 컬럼 권한과 RLS로 보호합니다.
5. Storage 전역 업로드 제한을 **26,214,400바이트 이상**으로 둡니다. 실제 개별 버킷 제한은 SQL에서 설정합니다. [파일 크기 제한 안내](https://supabase.com/docs/guides/storage/uploads/file-limits)
6. CAPTCHA를 사용한다면 Supabase Authentication에 Turnstile **secret key**를 설정하고, 아래 JSON에는 **site key**만 넣습니다. Turnstile 허용 도메인에 실제 배포 도메인과 필요한 localhost를 등록합니다. 서버에서 CAPTCHA를 켜 놓고 클라이언트 site key를 비워 두면 새 익명 로그인에 실패합니다. 현재 저장소 설정은 빈 문자열이며, 운영 시 적용 여부를 별도로 정하세요.

현재 기능에는 Edge Function, Realtime, 별도 OAuth 제공자, Supabase 로그인 리다이렉트 흐름이 필요하지 않습니다.

## 4. API URL·키 교체 위치

직접 수정할 연결 설정은 [`previews/test1/guestbook-config.json`](../../previews/test1/guestbook-config.json) 한 곳입니다.

```json
{
  "projectUrl": "https://YOUR_PROJECT_REF.supabase.co",
  "publishableKey": "sb_publishable_REPLACE_WITH_NEW_PROJECT_KEY",
  "table": "wedding_guestbook",
  "bucket": "wedding-guestbook",
  "turnstileSiteKey": ""
}
```

- URL과 키는 **같은 새 프로젝트의 값**으로 함께 바꿉니다. 위 예시는 실행용 키가 아닙니다.
- `table`, `bucket`은 제공 SQL과 맞춰 그대로 둡니다. 사진 공유의 두 버킷 이름도 코드와 SQL에서 고정되어 있습니다.
- 이 프로젝트의 빌드 검사는 `sb_publishable_` 형식을 요구합니다. 기존 JWT 형식 `anon` 키를 대신 넣으면 빌드에 실패합니다.
- `sb_secret_...`, `service_role`, DB 비밀번호, Personal Access Token은 JSON·HTML·GitHub 저장소에 넣지 않습니다. 브라우저에 배포되는 키는 Publishable key만 사용합니다. [키 종류와 권한](https://supabase.com/docs/guides/getting-started/api-keys)
- `guestbook.js`, `photo-share.js`는 빌드된 `window.PREVIEW_DATA.guestbook`을 함께 사용합니다. 두 파일에 키를 따로 넣지 않습니다.
- `scripts/lib/photo-share-admin.mjs`도 같은 JSON을 읽습니다. 관리자 화면의 사진 확인 링크는 Project URL에서 자동 생성되므로 계정별 URL을 HTML에서 찾아 바꿀 필요가 없습니다. 표준 `https://<ref>.supabase.co` 주소를 사용하세요. 커스텀 도메인이면 링크가 Supabase 대시보드 시작 화면으로 연결됩니다.
- `build/`, `dist/`, 생성된 `data.js`는 직접 수정하지 않고 재빌드합니다. 현재 GitHub Actions는 이 JSON을 읽으며 Supabase용 Actions Secret을 따로 요구하지 않습니다.

## 5. SQL 설치 — 권장 방법

Node.js 22 이상이 설치된 PC에서 저장소 루트로 이동합니다. Windows 예시:

```powershell
Set-Location D:\merry
node scripts/prepare-supabase.mjs
```

생성 결과:

| 파일 | 용도 | GitHub 업로드 |
| --- | --- | --- |
| `.work/supabase-install.sql` | 새 프로젝트에 실행할 전체 설치 SQL | 제외 |
| `.work/photo-share-install.sql` | 사진 공유 부분만 설치하는 SQL | 제외 |
| `.work/photo-share-admin.json` | 로컬 관리자 설정 변경용 비밀키 원문 | **제외·안전하게 보관** |

새 프로젝트의 SQL Editor에서 **`.work/supabase-install.sql` 전체 내용**을 실행합니다. 현재 운영 프로젝트와 대상 Project Ref가 맞는지 확인한 뒤 실행하세요. 기존 메시지나 사진을 복사하는 작업은 포함되지 않습니다.

준비 스크립트는 관리자 키 파일이 없으면 생성하고, 있으면 재사용합니다. 해시가 치환된 SQL을 만들기 때문에 수동으로 비밀키를 SQL에 붙여 넣을 필요가 없습니다. SQL Editor가 `DROP POLICY` 때문에 경고하더라도 제공 스크립트의 해당 문장은 같은 이름의 권한 정책을 재정의하는 용도입니다. 데이터 테이블이나 사진 파일을 삭제하는 구문은 없습니다.

기존 PC에서 새 프로젝트마다 관리자 키를 분리하려면, **새 프로젝트 설치 전에** 기존 `.work/photo-share-admin.json`을 별도의 안전한 위치에 백업하고 작업 폴더에서 옮긴 뒤 준비 스크립트를 실행합니다. 기존 프로젝트를 계속 관리하려면 그 프로젝트의 키도 보관해야 합니다. `.work/`는 Git에서 제외되고 로컬 서버도 제공하지 않습니다.

### 포함되는 DDL과 실행 순서

| 순서 | 저장소 파일 | 내용 |
| --- | --- | --- |
| 1 | [`guestbook.sql`](guestbook.sql) | 방명록 테이블·인덱스·컬럼 권한·RLS, 방명록 사진 버킷과 정책 |
| 2 | [`likes.sql`](likes.sql) | 좋아요 테이블·통계/상태 변경 RPC·권한 |
| 3 | [`photo-share.sql`](photo-share.sql) | 사진 설정·관리자 해시·업로드 메타데이터 테이블, 예약/완료 RPC |
| 4 | [`photo-share-storage-mode.sql`](photo-share-storage-mode.sql) | 원본/가공 저장 모드, 원본 버킷, 모드별 예약·완료·버킷 권한 |

`prepare-supabase.mjs`가 이 순서를 적용합니다. 3번 원본 파일에는 `__ADMIN_HASH__` 자리표시자가 있으므로 **원본 그대로 실행하지 말고** 준비 스크립트 결과를 사용하세요. 3번에는 초기 상태 `now`, 예식일 `2027-01-30 00:00 +09:00`가 들어 있으니 다음 절에서 실제 일정과 공개 상태를 적용해야 합니다.

이 SQL은 빈 프로젝트에 설치하기 위한 기준이며 임의의 기존 스키마를 자동 교정하지 않습니다. `CREATE TABLE IF NOT EXISTS`는 이미 있는 테이블의 컬럼·제약을 갱신하지 않습니다. 실행 오류가 발생하면 연결 설정을 운영 사이트에 배포하지 말고 원인을 해결하세요.

### 이미 사진 공유를 설치한 프로젝트의 업그레이드

원본/가공 옵션만 추가할 때는 [`photo-share-storage-mode.sql`](photo-share-storage-mode.sql)을 실행합니다. 기존 키·메시지·사진은 유지됩니다. 전체 초기 설치 SQL을 불필요하게 재실행하지 않습니다.

## 6. 로컬 관리자 연결 및 운영 설정

```powershell
Set-Location D:\merry
npm run admin
```

기본 관리자 주소는 `http://localhost:4000/admin/`입니다. 4000 포트에 이전 서버가 떠 있으면 해당 서버를 종료하고 최신 코드로 다시 시작하거나 다음처럼 별도 포트로 실행하세요.

```powershell
$env:PORT = '4001'
npm run admin
```

별도 포트에서는 `http://localhost:4001/admin/`을 사용합니다. 서버 코드를 바꿨을 때 브라우저 새로고침만으로는 API 코드가 갱신되지 않습니다. `start-local.cmd`도 기존 4000 서버가 응답하면 그것을 재사용하므로 서버 재시작을 대신하지 않습니다.

관리자 **기능·키 → 축하 사진 공유**에서 다음을 정하고 **사진 공유 설정 적용**을 누릅니다.

- 업로드 시작: `지금부터 업로드(테스트)` / `예식 당일 00시부터 업로드` / `업로드 일시 중지`
- 저장 방식: `용량을 줄여 저장` / `원본 그대로 저장`

날짜는 `data/wedding.json`의 `ceremony.datetime` 날짜를 기준으로 한국 시간 00시로 설정합니다. 예식 날짜를 수정했다면 관리자 상단의 **저장**을 먼저 하고 사진 공유 설정을 적용하세요. 최종 점검 후에는 필요에 따라 당일 시작으로 바꾸세요. 기본 저장 방식은 가공입니다.

사진 설정은 새 Supabase의 RPC에 바로 반영됩니다. 배포된 사이트는 최초 로드·모달 열기·최대 1분 주기·전송 직전에 상태를 확인합니다. 새 사진에는 최신 설정을 적용하고 이미 전송을 시작한 사진의 재시도는 최초 예약 방식을 유지합니다.

관리자 키는 **사진 설정 변경용**이며 Supabase 관리자 로그인이나 사진 읽기 권한을 대신하지 않습니다. 받은 사진은 해당 프로젝트에 접근할 수 있는 Supabase 관리자 계정으로 확인합니다. 다른 관리 PC에는 JSON 연결 설정 외에 `.work/photo-share-admin.json`도 안전하게 전달해야 합니다. GitHub에서 소스를 내려받는 것만으로 이 키가 복구되지는 않습니다.

초기 설치 SQL은 기존 `wedding_photo_admin` 행을 덮어쓰지 않습니다. 기존 DB에서 키를 분실했다면 새 로컬 키를 생성하는 것만으로 연결이 복구되지 않으므로, 프로젝트 관리자가 별도 키 교체 절차로 DB 해시와 로컬 키를 함께 맞춰야 합니다.

## 7. 설치·배포 전 확인

새 프로젝트 SQL Editor에서 읽기 전용 확인:

```sql
select public.wedding_photo_status();
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('wedding-guestbook','wedding-shared-photos','wedding-original-photos');
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename like 'wedding_%';
select tablename, policyname, roles, cmd from pg_policies
where schemaname='public' and tablename like 'wedding_%';
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
select id, length(secret_hash)=64 as hash_length_ok,
       secret_hash='__ADMIN_HASH__' as placeholder_remaining
from public.wedding_photo_admin;
```

해시 확인은 `hash_length_ok=true`, `placeholder_remaining=false`여야 합니다. 길이 검사만으로 로컬 키와의 일치가 증명되지는 않으므로 관리자 설정 적용까지 성공하는지 확인하세요. 세 버킷 모두 `public=false`, `wedding_` 테이블은 RLS가 켜져 있어야 합니다. 새 프로젝트에 별도의 광범위한 Storage 정책을 추가하지 마세요. 다른 허용 정책이 있으면 제한된 정책과 OR로 결합될 수 있습니다.

브라우저 점검은 새 시크릿 창에서 진행합니다.

1. 방명록 목록이 열리고, 사진 없는 글을 작성할 수 있는지 확인합니다. 방명록은 익명 사용자당 한 글이므로 사진 첨부 글 검증에는 별도 브라우저 세션을 사용합니다.
2. 공개 글의 사진 열람, 좋아요 추가·취소, 숨긴 글의 목록 제외를 확인합니다. 이미 발급한 사진 서명 URL은 최대 300초 동안 남을 수 있습니다.
3. 축하 사진을 한 장씩 추가하고 X로 삭제했을 때 목록·개수 안내가 갱신되는지 확인합니다. 최대 5장, 장당 원본 입력 25MiB 제한입니다.
4. 가공 저장에서 JPEG·긴 변 최대 2,048px·2MiB 이하로 저장되는지 확인합니다.
5. 원본 저장에서 파일 형식·내용·용량이 유지되는지 확인합니다. 파일 경로는 UUID로 바뀌며 실제 원래 파일명은 `wedding_shared_photos.original_name`에 남습니다. 원본에는 EXIF 등의 촬영 정보가 포함될 수 있습니다.
6. 관리자에서 당일 시작/일시 중지로 바꾸었을 때 새 전송이 차단되는지 확인하고 원하는 운영 설정으로 되돌립니다.
7. 다른 하객 세션이나 비로그인 상태에서 축하 사진 목록·메타데이터·서명 URL 생성·공개 URL 접근이 허용되지 않는지 확인합니다. 업로드한 본인도 내려받을 수 없어야 합니다.
8. 받은 사진은 관리자 로그인으로만 열리는지 확인합니다. `wedding_shared_photos.bucket_id`와 `object_path`로 이름·이야기와 사진을 연결합니다. `uploaded_at`이 비어 있으면 미완료 예약입니다.

기존 프로젝트의 합성 테스트 이미지에는 `기능 점검`, `저장 방식 기능 점검` 같은 테스트 이름이 남아 있을 수 있습니다. 새 프로젝트 기본 SQL에는 테스트 데이터가 포함되지 않습니다.

## 8. 기존 메시지·사진도 옮길 경우

설치 SQL은 데이터 이전 도구가 아닙니다. 기존 데이터가 필요하면 운영 업로드를 잠시 중지하고 다음을 별도로 백업·이전하세요.

- `wedding_guestbook`, `wedding_guestbook_likes`, `wedding_shared_photos`, `wedding_photo_settings` 및 관리자 키 관리 자료.
- 연결된 `auth.users` 등 Auth 데이터. `owner_id`/`user_id` 외래 키와 사진 경로가 기존 사용자 UUID를 참조하므로 공개 테이블 CSV만 넣으면 외래 키 오류나 사용자 연결 손실이 생깁니다. Auth 사용자 임의 삭제는 방명록·좋아요의 CASCADE 삭제를 유발할 수 있습니다.
- **세 Storage 버킷의 실제 파일**. DB 백업에는 사진 바이너리가 포함되지 않습니다. Storage API 등 공식 이전 절차로 원래 버킷·경로를 유지해 복사해야 합니다. DB의 `storage.objects` 메타데이터만 복사하는 것은 파일 이전이 아닙니다. [백업 안내](https://supabase.com/docs/guides/platform/backups)

전체 이전은 [공식 프로젝트 백업·복원 절차](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)를 기준으로 진행하고 Storage 복사 및 Auth/CAPTCHA/API 설정도 확인하세요. 덤프·개인 사진·세션 토큰·비밀키는 GitHub에 올리지 않습니다. DB 복원 후에는 초기 설치 SQL을 무조건 다시 실행하지 말고 복원된 스키마와 필요한 업그레이드를 비교합니다.

새 프로젝트는 기존 프로젝트의 브라우저 로그인 세션과 별개입니다. 클라이언트는 Project URL별 세션 저장 키를 쓰므로 사용자가 새 익명 사용자로 생성될 수 있고, 기존 좋아요의 '내가 누름' 상태가 그대로 이어지는 것은 보장하지 않습니다.

전환 후 문제가 생기면 이전 Project URL·Publishable key와 그 프로젝트의 로컬 관리자 키로 되돌린 뒤 재빌드·배포합니다. 새 프로젝트 전환 이후 받은 데이터가 이전 프로젝트로 자동 합쳐지지는 않으므로 어느 쪽에 들어왔는지 확인해야 합니다. 데이터 확인을 마치기 전에는 이전 프로젝트를 삭제하지 마세요.

## 9. 빌드·GitHub 반영

```powershell
node --test scripts/backend-resilience.test.mjs scripts/photo-share.test.mjs scripts/rsvp.test.mjs scripts/rsvp-entry.test.mjs scripts/paper-rose.test.mjs
node scripts/build.mjs t08-paper-rose
node scripts/dist.mjs --build
```

`data/wedding.json`의 `template`이 배포 루트 템플릿을 결정합니다. 현재 값은 **`t08-paper-rose`**이며 사이트 첫 페이지에 페이퍼 & 로즈를 배포합니다. 미리보기는 `dist/test1.html`에도 생성됩니다. `site.url`은 현재 GitHub Pages 주소로 지정되어 있으므로 저장소나 도메인을 옮기면 함께 변경하세요. 다른 템플릿을 배포하려면 관리자 템플릿 선택 또는 JSON 수정 후 최종 빌드를 확인합니다.

[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)은 **main 브랜치 push 시 GitHub Pages를 자동 배포**합니다. 서버 반영 전 검토만 하려면 준비 브랜치에 push하고, 배포할 시점에 main으로 병합하세요. GitHub Pages 설정은 Source가 GitHub Actions여야 합니다. Workflow는 `SITE_URL`을 공급하며 Supabase SQL이나 Auth 설정을 자동 설치하지 않습니다.

배포되는 것은 `dist/`의 정적 청첩장입니다. `admin/`, `scripts/`, `.work/` 관리자 키는 Pages 배포 대상이 아닙니다. 로컬 관리자 서버는 `127.0.0.1`에만 바인딩하므로 이 서버를 인터넷용 관리자로 공개하는 설정은 현재 범위에 포함되지 않습니다.

GitHub에 포함할 파일: 소스, 공개 연결 JSON, 이 문서, `backend/supabase/*.sql`, 준비 스크립트. 제외할 파일: `.work/`, 관리자 비밀키, DB 덤프, 실제 업로드 사진, 환경별 비밀번호, 생성된 `build/`·`dist/`.

## 10. 자주 생기는 오류

### 사용량 초과·일시 중지·장애 시 청첩장 동작

청첩장 본문·메뉴·로컬 사진·예식 안내는 정적 파일로 제공되며 Supabase 응답을 기다리지 않습니다. 방명록(좋아요·첨부 사진 포함)과 축하 사진 공유에만 장애 안내를 표시합니다. 402/429/5xx, 네트워크 실패 및 응답 지연을 처리하며, SDK 로드는 15초, 일반 API/인증 작업은 20초, 업로드는 35초 안에 실패 처리를 시작합니다. 여러 단계인 전송 전체 시간은 각 단계 시간의 합이 될 수 있습니다.

실패하면 작성 중인 내용과 선택 사진은 현재 페이지에 유지되고 모달 조작 잠금이 해제됩니다. 사진 업로드 상태를 확인하지 못한 경우 '기간 종료'로 오인하지 않고 연결 실패로 표시합니다. 방명록의 '다시 불러오기', 사진 공유의 '연결 다시 확인하기'로 복구를 시도할 수 있습니다. 이미지 자체나 DB 데이터를 읽을 수 없는 장애에서는 그 기능의 자료를 보여 줄 수 없으며, 실제 저장 확인 없이 전송 성공으로 표시하지 않습니다.

선택 사진은 브라우저 메모리에 있으므로 새로고침·탭 종료까지 보존되는 것은 아닙니다. 사용량 제한 자체는 에러 처리로 해제되지 않으며, Supabase에서 제한 원인을 해결한 후 기능을 다시 이용해야 합니다. 정적 호스팅 자체가 중단되는 경우는 이 처리 범위에 포함되지 않습니다.

| 증상 | 확인할 부분 |
| --- | --- |
| `Anonymous sign-ins are disabled` | 새 프로젝트의 익명 로그인/가입 설정 |
| `Invalid API key`, 401 | Project URL과 Publishable key가 같은 프로젝트인지 |
| `PGRST202`, RPC를 찾을 수 없음 | SQL 순서·누락·실행 실패, 필요 시 `notify pgrst, 'reload schema';` |
| 업로드 403 / RLS 위반 | 예약 RPC, 대상 버킷, Auth 세션, INSERT 정책. Public으로 전환해 해결하지 않습니다. |
| 원본 파일이 크기 제한으로 실패 | Storage 전역 제한과 `wedding-original-photos`의 26,214,400바이트 제한 |
| 관리자 설정 적용만 실패 | 최신 로컬 서버인지, `.work/photo-share-admin.json`과 새 DB 해시가 일치하는지 |
| 키를 바꿨는데 이전 프로젝트로 연결 | 재빌드·배포 여부, 이전 페이지 탭/캐시, `data.js`의 Project URL |
| 사진/글이 새 프로젝트에 없음 | DDL 설치는 데이터 복사를 하지 않음. 8절의 별도 이전 필요 |
| 원본 HEIC 미리보기 불가 | 브라우저의 HEIC 지원에 따라 파일명으로 표시될 수 있음. 원본 모드는 파일 보관 가능, 가공 모드는 디코딩 가능한 JPG/PNG 등으로 선택 |
