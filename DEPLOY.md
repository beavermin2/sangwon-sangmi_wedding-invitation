# GitHub Pages 배포 안내

배포되는 것은 `wedding.json` 의 `template` 으로 고른 **대표 청첩장 하나**뿐입니다.
갤러리(`gallery/`)와 다른 템플릿은 배포되지 않고, 내 PC의 `npm run dev` 에서만 볼 수 있습니다.

## 배포 전에 확인할 것
```
npm run build
npm run dist
```
`npm run dist` 는 배포본(`dist/`)을 만들면서 빠진 것을 알려 줍니다.

- **원작 커플의 실제 사진이 남는 템플릿(t03·t05·t07)** 은 내 사진을 넣기 전까지 배포가 멈춥니다. 테스트로만 올리려면 `npm run dist:test`.
- 계좌가 예시 값(`은행명`, `000-…`)이거나 저장소 주소·카카오 키가 비어 있으면 경고가 나옵니다.
- `http://localhost:4000/dist/` 에서 실제 배포될 화면을 미리 볼 수 있습니다(`npm run dev` 실행 중일 때).

## 처음 한 번: 저장소 만들고 올리기
1. GitHub 에 로그인해 **New repository** 를 만듭니다.
   - 이름을 `아이디.github.io` 로 하면 주소가 `https://아이디.github.io/` 가 되고,
     다른 이름(예: `wedding`)이면 `https://아이디.github.io/wedding/` 이 됩니다.
   - 무료 계정은 **Public** 저장소여야 Pages 를 쓸 수 있습니다(아래 '공개 범위' 참고).
2. 이 폴더에서 저장소에 올립니다(`아이디`, `저장소` 를 바꿔 입력).
   ```
   git init -b main
   git add .
   git commit -m "모바일 청첩장"
   git remote add origin https://github.com/아이디/저장소.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
4. **Actions** 탭에서 `Deploy wedding invitation` 이 초록색이 되면 배포 완료입니다(처음엔 2~4분).
   실패했다면 Settings → Pages 설정 후 **Actions → 실패한 실행 → Re-run all jobs** 를 누릅니다.

## 그다음부터: 관리자 페이지에서 고치고 올리기
```
npm run admin
```
`http://localhost:4000/admin/` 에서 청첩장 정보·사진·기능·대표 템플릿을 바꿀 수 있습니다(이 PC 에서만 열림).

- **저장**: `data/wedding.json` 과 `data/images/` 에 저장합니다. 사진은 긴 변 1600px 로 줄여서 저장됩니다.
- **미리보기**: 대표 템플릿을 빌드해 배포될 화면을 새 탭으로 엽니다.
- **배포**: 배포 전 점검을 통과하면 `data/` 변경을 커밋하고 GitHub 에 push 합니다. 2~3분 뒤 청첩장이 바뀝니다.
  `main` 브랜치에서만 push 하고, 다른 브랜치에서는 커밋만 합니다. push 로그인이 풀렸다면 터미널에서 `git push` 를 한 번 실행해 다시 로그인하세요.

직접 고칠 때는 `data/wedding.json` 이나 `data/images/` 를 고친 뒤 commit·push 만 하면 자동으로 다시 배포됩니다.

## 다른 PC(집 노트북 등)에서 관리자 쓰기 — Windows
`wedding-admin.bat` 파일 하나로 설치부터 실행까지 됩니다.

**처음 한 번**
1. 노트북 브라우저에서 아래 주소를 열고 **Ctrl+S** → 파일 이름 `wedding-admin.bat`, 파일 형식 **모든 파일** 로 저장합니다(예: 바탕화면).
   https://github.com/beavermin2/sangwon-sangmi_wedding-invitation/raw/main/wedding-admin.bat
2. 저장한 파일을 더블클릭합니다. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행** 을 누릅니다.
3. Git·Node.js 가 없으면 설치할지 묻습니다. `Y` 로 설치한 뒤 창을 닫고 **파일을 다시 더블클릭** 합니다.
4. 프로젝트가 `C:\Users\(사용자)\wedding-invitation` 에 내려받아지고, GitHub 로그인 코드가 나옵니다.
   브라우저에서 https://github.com/login/device 를 열어 **beavermin2** 계정으로 코드를 입력합니다(배포 버튼용, 한 번만).
5. 관리자 페이지 `http://localhost:4000/admin/` 이 자동으로 열립니다.

**그다음부터**: 같은 파일을 더블클릭하면 다른 PC 에서 배포한 내용을 먼저 받아온 뒤 관리자 페이지가 열립니다.
검은 창을 닫으면 관리자 페이지가 꺼집니다.

**두 PC 를 오갈 때**
- 한 PC 에서 작업을 마치면 **배포** 를 눌러 두세요. 그래야 다른 PC 가 최신 내용을 받습니다.
- 다른 PC 가 먼저 배포했어도 **배포** 버튼이 그 변경을 받아 합친 뒤 올립니다. 두 PC 에서 같은 칸을 동시에 바꾼 경우만 자동으로 합치지 못하고 알려 줍니다.
- 관리자 페이지는 그 PC 안에서만 열립니다(같은 와이파이의 다른 기기에서도 접속 불가).
GitHub Actions 가 대표 템플릿만 새로 빌드하므로 `build/`·`dist/` 는 올리지 않습니다(.gitignore).

## 배포 주소 연결
- `site.url` 을 비워 두면 GitHub Actions 가 Pages 주소를 자동으로 넣습니다(카카오 공유 미리보기용).
- **카카오톡 공유**: Kakao Developers 의 플랫폼 → Web → 사이트 도메인에 `https://아이디.github.io` 를 등록합니다.
- **참석 여부·방명록**: [backend/README.md](backend/README.md) 대로 스프레드시트 주소를 넣어야 배포본에 나타납니다.

## 공개 범위
- Public 저장소이므로 `data/wedding.json`(연락처·계좌 포함)과 `data/images/` 의 사진을 **누구나 볼 수 있습니다.** 청첩장에 보이는 정보와 같은 수준만 넣으세요.
- 배포본에는 검색 엔진 수집 차단(`robots.txt`, `noindex`)이 들어 있어 링크를 받은 사람 위주로만 보게 됩니다.
- 결혼식이 끝나면 저장소를 Private 으로 바꾸거나 삭제하면 청첩장 주소도 닫힙니다.
