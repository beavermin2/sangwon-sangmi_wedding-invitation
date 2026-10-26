# 관리자 페이지 시작 (wedding-admin.bat 가 실행)
#  1) 이 PC 에서 처음이면 git 작성자·로그인 방식을 저장소에만 설정
#  2) 다른 PC 에서 바꾼 내용을 GitHub 에서 받아옴(git pull)
#  3) 로컬 서버를 켜고 브라우저로 관리자 페이지를 연다
# git 은 정상 진행 메시지도 stderr 로 쓰므로 오류로 멈추지 않게 하고, 결과는 $LASTEXITCODE 로 본다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$url = 'http://localhost:4000/admin/'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

Say ''
Say '  💌 청첩장 관리자' 'Magenta'
Say "  폴더: $root"
Say ''

# 공개 저장소에 회사 이메일이 남지 않도록 이 저장소에서만 작성자를 GitHub noreply 로 둔다.
if (-not (git config --local user.email)) {
  git config --local user.name 'beavermin2'
  git config --local user.email 'beavermin2@users.noreply.github.com'
}
# GitHub 로그인은 '코드 입력' 방식(어느 브라우저에서든 github.com/login/device 에 코드 입력)
git config --local credential.gitHubAuthModes device

# (git 출력은 cmd 를 거쳐 받는다. Windows PowerShell 5.1 은 git 의 정상 메시지도 빨간 오류로 보여 준다.)
# 다른 PC 에서 배포한 내용 받아오기. 이 PC 에 저장 안 한(커밋 안 된) 변경이 있으면 건드리지 않는다.
$dirty = git status --porcelain
if ($dirty) {
  Say '  ! 이 PC 에 아직 배포하지 않은 변경이 있어 최신 내용을 받지 않았습니다.' 'Yellow'
  Say '    관리자 페이지에서 [배포]를 누르면 다른 PC 의 변경과 합쳐서 올립니다.' 'Yellow'
} else {
  Say '  GitHub 에서 최신 내용을 받는 중…'
  cmd /c 'git pull --ff-only --quiet 2>&1' | Out-Host
  if ($LASTEXITCODE -ne 0) { Say '  ! 최신 내용을 받지 못했습니다. 인터넷 연결을 확인하세요. (지금 내용으로 계속합니다)' 'Yellow' }
  else { Say '  최신 상태입니다.' 'Green' }
}

# 이 PC 에서 처음이면 GitHub 로그인을 한 번 확인한다. 관리자 페이지의 [배포]는 창 없이 push 하므로
# 로그인 코드를 보여 줄 수 없다. 여기서 미리 로그인해 두면 이후에는 저장된 로그인으로 올라간다.
$loginMark = Join-Path $root '.git\wedding-admin-login-ok'
if (-not (Test-Path $loginMark)) {
  Say ''
  Say '  이 PC 에서 처음이라 GitHub 로그인을 확인합니다. (배포 버튼용, 한 번만)' 'Cyan'
  Say '  코드가 나오면 브라우저에서 https://github.com/login/device 를 열어 beavermin2 계정으로 입력하세요.' 'Cyan'
  cmd /c 'git push --dry-run origin HEAD 2>&1' | Out-Host
  if ($LASTEXITCODE -eq 0) {
    New-Item -ItemType File $loginMark -Force | Out-Null
    Say '  GitHub 로그인 확인 완료.' 'Green'
  } else {
    Say '  ! GitHub 로그인을 확인하지 못했습니다. 관리자 페이지는 쓸 수 있고, [배포]만 실패할 수 있습니다.' 'Yellow'
    Say '    다음에 이 파일을 다시 실행하면 다시 확인합니다.' 'Yellow'
  }
}

# 이미 켜져 있으면 브라우저만 연다.
$running = $false
try { $running = (Invoke-WebRequest "$url" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
if ($running) {
  Say '  관리자 서버가 이미 켜져 있어 브라우저만 엽니다.' 'Green'
  if (-not $env:WEDDING_NO_BROWSER) { Start-Process $url }
  Start-Sleep -Seconds 2
  exit 0
}

Say ''
Say "  브라우저에서 $url 을 엽니다." 'Green'
Say '  ※ 이 창을 닫으면 관리자 페이지도 꺼집니다.' 'Cyan'
Say ''

# WEDDING_NO_BROWSER=1 이면 브라우저를 열지 않는다(시험용).
if (-not $env:WEDDING_NO_BROWSER) {
  Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 1; Start-Process $u } -ArgumentList $url | Out-Null
}
node scripts/server.mjs
