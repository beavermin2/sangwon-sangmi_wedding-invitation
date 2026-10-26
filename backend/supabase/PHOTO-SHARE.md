# 축하 사진 공유

새 Supabase 프로젝트 설치·API 키 변경·기존 데이터 이전은 [계정·프로젝트 이전 안내](MIGRATION.md)를 참고하세요.

페이퍼 & 로즈의 `#photo-share`에서 한 번에 최대 5장, 장당 25MB까지 선택할 수 있습니다. 하객에게 사진 목록이나 다운로드 권한을 주지 않습니다.

**사진 저장 방식**을 관리자가 선택할 수 있습니다.
- 용량을 줄여 저장(기본): JPG로 변환(최대 긴 변 2048px, 2MB), EXIF 촬영 정보 제거.
- 원본 그대로 저장: JPG·PNG·WebP·HEIC·HEIF의 원본 바이트, 해상도, 촬영 정보를 유지(장당 25MB). 파일명은 안전한 UUID로 저장하며 원래 이름은 `original_name`에 보관합니다. HEIC를 표시하지 못하는 브라우저에서는 파일명으로 미리보기를 대신합니다.

새로 전송하는 사진부터 적용되며 기존 저장된 사진은 바뀌지 않습니다. 업로드를 이미 시작한 사진의 재시도는 최초 예약 시의 저장 방식을 유지합니다. 사진 선택 후 설정이 바뀐 경우 전송 전에 보관 중인 원본으로 다시 준비합니다.

## 관리자 사용

로컬 관리자 → **기능·키 → 축하 사진 공유**에서 시작을 선택한 뒤 **사진 공유 설정 적용**을 누릅니다.

- 지금부터 업로드 (테스트)
- 예식 당일 00시부터 업로드 (한국 시간)
- 업로드 일시 중지

별도 저장소에 즉시 반영되므로 사이트 재배포가 필요 없습니다. 이미 열린 페이지는 최대 1분 안에 갱신되며 실제 전송 시에도 서버에서 검사합니다. 예식 날짜를 바꾸면 먼저 기본 정보를 저장한 뒤 다시 설정을 적용하세요.

**받은 원본 사진 확인 / 받은 가공 사진 확인**은 Supabase 관리자 로그인 후 각각 `wedding-original-photos` / `wedding-shared-photos` 보관함에서 합니다. 두 보관함 모두 비공개이며 저장소가 각각 25MB / 2MB 제한을 강제합니다. 보낸 분·이야기는 Table Editor의 `wedding_shared_photos`에서 `bucket_id`, `object_path`로 연결해 확인합니다. `uploaded_at`이 없는 행은 전송 준비 중이거나 실패한 예약입니다.

## 처음 설치 / 다른 PC

1. `node scripts/prepare-photo-share.mjs` 실행
2. `.work/photo-share-install.sql`을 프로젝트 SQL Editor에서 실행
3. 최신 `scripts/server.mjs`로 로컬 서버 시작

기존 설치에서는 `backend/supabase/photo-share-storage-mode.sql`을 SQL Editor에서 한 번 실행하고 로컬 서버를 재시작합니다.

로컬 설정용 비밀키는 `.work/photo-share-admin.json`에만 있습니다. 서버는 `.work/`를 외부 제공하지 않으며 Git에도 포함하지 않습니다. 브라우저·배포 파일에는 키를 넣지 마세요. 다른 관리 PC에서 사용하려면 이 파일을 안전하게 옮겨야 합니다. 분실 시 새 키를 생성하고 DB의 `wedding_photo_admin.secret_hash`를 갱신해야 합니다. 설정용 키는 사진 읽기 권한을 주지 않습니다.

## 저장 정책

- 별도의 비공개 버킷, 하객 다운로드/목록/삭제 불가
- 익명 로그인 사용자마다 예약 경로가 고정되어 재시도 중 중복 저장 방지
- 브라우저 로그인 사용자당 최대 50장(예약 포함)
- 공개 API는 업로드 시작 설정과 사진 저장 방식만 반환
- 저장소 INSERT 정책에서도 시작 시간을 검증

참고: https://supabase.com/docs/guides/storage/security/access-control
