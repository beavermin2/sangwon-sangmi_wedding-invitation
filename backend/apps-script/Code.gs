/**
 * 모바일 청첩장 참석 여부(RSVP)·방명록 저장용 Google Apps Script
 *
 * 구글 스프레드시트 하나에 붙여 '웹 앱'으로 배포하면 무료 저장 서버가 됩니다.
 * 설치 방법은 backend/README.md 를 보세요.
 *
 *  - 참석여부 시트: 하객이 보낸 참석 의사. 청첩장에서는 읽을 수 없습니다(신랑·신부만 시트에서 확인).
 *  - 방명록 시트  : 축하 메시지. 청첩장에 최신순으로 공개됩니다.
 *                   부적절한 글은 '숨김' 칸에 아무 값(예: x)이나 넣으면 화면에서 빠집니다.
 */

const SHEETS = {
  rsvp: { name: '참석여부', head: ['보낸 시각', '측', '이름', '참석', '동행 인원', '식사', '메시지'] },
  guestbook: { name: '방명록', head: ['보낸 시각', '이름', '메시지', '숨김'] },
};
const MAX = { name: 20, message: 300 };

function sheet_(type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEETS[type].name);
  if (!sh) {
    sh = ss.insertSheet(SHEETS[type].name);
    sh.appendRow(SHEETS[type].head);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 제어문자 제거·길이 제한, 그리고 = + - @ 로 시작하는 값은 수식으로 실행되지 않게 ' 를 붙인다.
function clean_(value, max) {
  const s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function pick_(value, allowed) {
  return allowed.indexOf(value) >= 0 ? value : '';
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid' });
  }
  // 자동 등록 봇이 채우는 숨은 칸
  if (body.website) return json_({ ok: true });

  const name = clean_(body.name, MAX.name);
  if (!name) return json_({ ok: false, error: 'name' });

  // 같은 내용이 1분 안에 다시 들어오면(연타·재전송) 한 번만 저장
  const cache = CacheService.getScriptCache();
  const key = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(body)));
  if (cache.get(key)) return json_({ ok: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = new Date();
    if (body.type === 'rsvp') {
      sheet_('rsvp').appendRow([
        now,
        pick_(body.side, ['신랑측', '신부측']),
        name,
        pick_(body.attend, ['참석', '불참']),
        Math.max(0, Math.min(10, parseInt(body.companions, 10) || 0)),
        pick_(body.meal, ['식사함', '식사 안 함', '미정', '']),
        clean_(body.message, MAX.message),
      ]);
    } else if (body.type === 'guestbook') {
      const message = clean_(body.message, MAX.message);
      if (!message) return json_({ ok: false, error: 'message' });
      sheet_('guestbook').appendRow([now, name, message, '']);
    } else {
      return json_({ ok: false, error: 'type' });
    }
    cache.put(key, '1', 60);
    return json_({ ok: true, at: now.toISOString() });
  } finally {
    lock.releaseLock();
  }
}

// 방명록 목록(최신순). 참석 여부는 공개하지 않는다.
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'guestbook') return json_({ ok: true });
  const offset = Math.max(0, parseInt(p.offset, 10) || 0);
  const limit = Math.max(1, Math.min(20, parseInt(p.limit, 10) || 5));
  const rows = sheet_('guestbook').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[1] && r[2] && !r[3]; })
    .reverse();
  const items = rows.slice(offset, offset + limit).map(function (r) {
    return {
      name: String(r[1]).replace(/^'/, ''),
      message: String(r[2]).replace(/^'/, ''),
      at: r[0] instanceof Date ? r[0].toISOString() : '',
    };
  });
  return json_({ ok: true, total: rows.length, items: items });
}
