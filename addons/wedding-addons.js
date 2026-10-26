/*
 * 청첩장 공통 모듈: 참석 의사 전달(RSVP) · 방명록 · 공유
 * scripts/build.mjs 가 모든 템플릿 결과물에 addons/ 로 복사하고, 설정은 addons/config.js 의
 * window.__WEDDING_ADDONS__ 로 넣는다. 템플릿 CSS 와 서로 간섭하지 않도록 Shadow DOM 안에 그린다.
 * 저장소는 Google Apps Script 웹 앱(backend/apps-script/Code.gs)이다.
 */
(function () {
  'use strict';

  var C = window.__WEDDING_ADDONS__;
  if (!C) return;

  var BASE = new URL('.', (document.currentScript && document.currentScript.src) || location.href).href;
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
  var KAKAO_SRI = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka';
  var PAGE = 5;

  /* ── 고인 표시: 텍스트 표식(U+2063 + 🌼)을 흰 국화 그림으로 ───────────────
     템플릿마다 이름을 그리는 방식(HTML·React·Vue)이 달라, 화면에 나온 글자를 찾아 바꾼다.
     원래 글자 노드는 지우지 않고 내용만 줄이고 그 앞에 그림을 넣어 React/Vue 가 쥔 노드를 깨지 않는다. */
  function swapMourn(root) {
    var mark = C.mournMark;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.data.indexOf(mark) < 0) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode && n.parentNode.nodeName;
        return /^(SCRIPT|STYLE|TEXTAREA|TITLE|OPTION)$/.test(p) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var i;
      while ((i = node.data.indexOf(mark)) >= 0) {
        var at = i === 0 ? node : node.splitText(i);
        at.data = at.data.slice(mark.length);
        var img = document.createElement('img');
        img.src = BASE + 'mourn-flower.svg';
        img.alt = '국화';
        img.className = 'wedding-mourn';
        img.setAttribute('style', 'display:inline-block!important;height:1.35em!important;width:auto!important;max-width:none!important;' +
          'margin:0 .08em 0 0!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;vertical-align:-.32em!important');
        at.parentNode.insertBefore(img, at);
        node = at;
      }
    });
  }
  if (C.mournMark) {
    var pending = false;
    var run = function () { pending = false; swapMourn(document.body); };
    run();
    // React/Vue 템플릿은 나중에 그리거나 다시 그리므로 바뀔 때마다 다시 확인.
    // requestAnimationFrame 은 화면에 안 보이는 탭에서 멈추므로 짧은 타이머로 모아서 처리한다.
    new MutationObserver(function () {
      if (!pending) { pending = true; setTimeout(run, 30); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ── 배경음악: 오른쪽 위 고정 버튼 ─────────────────────────────
     모바일 브라우저는 소리 자동 재생을 막으므로, 자동 재생이 켜져 있으면 첫 터치 때 시작한다.
     하객이 직접 끄면 그 뒤로는 저절로 다시 켜지 않는다. 동영상을 재생하면 잠시 멈춘다. */
  var bgm = null;
  function musicButton() {
    var M = C.music;
    var OFF_KEY = 'wedding-bgm-off:' + C.id;
    var audio = new Audio(BASE + M.src);
    audio.loop = true;
    audio.volume = M.volume;
    audio.preload = 'auto';
    var userOff = false;
    try { userOff = sessionStorage.getItem(OFF_KEY) === '1'; } catch (e) {}

    var host = document.createElement('div');
    host.id = 'wedding-bgm';
    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial}' +
      'button{position:fixed;top:14px;right:14px;z-index:2147483000;width:42px;height:42px;border-radius:50%;' +
      'border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.88);box-shadow:0 2px 10px rgba(0,0,0,.12);' +
      'display:grid;place-items:center;cursor:pointer;padding:0;color:' + (C.accent || '#b5776b') + ';-webkit-tap-highlight-color:transparent}' +
      'button:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
      'svg{width:20px;height:20px}' +
      '.on .wave{animation:wave 1s ease-in-out infinite;transform-origin:bottom}' +
      '.on .wave:nth-child(2){animation-delay:.2s}.on .wave:nth-child(3){animation-delay:.4s}' +
      '.slash{display:none}.off .slash{display:block}' +
      '@keyframes wave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}' +
      '@media (prefers-reduced-motion:reduce){.on .wave{animation:none}}';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
      '<rect class="wave" x="4" y="6" width="3" height="12" rx="1.5"/>' +
      '<rect class="wave" x="10.5" y="3" width="3" height="18" rx="1.5"/>' +
      '<rect class="wave" x="17" y="8" width="3" height="10" rx="1.5"/>' +
      '<line class="slash" x1="3" y1="21" x2="21" y2="3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    root.appendChild(style);
    root.appendChild(btn);
    document.body.appendChild(host);

    function show() {
      var on = !audio.paused;
      btn.className = on ? 'on' : 'off';
      btn.setAttribute('aria-label', on ? '배경음악 끄기' : '배경음악 켜기');
      btn.setAttribute('aria-pressed', String(on));
    }
    function play() { return audio.play().then(show, function () { show(); return Promise.reject(); }); }
    audio.addEventListener('play', show);
    audio.addEventListener('pause', show);
    show();

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (audio.paused) { userOff = false; try { sessionStorage.removeItem(OFF_KEY); } catch (er) {} play().catch(function () {}); }
      else { userOff = true; try { sessionStorage.setItem(OFF_KEY, '1'); } catch (er) {} audio.pause(); }
    });

    // 자동 재생: 먼저 바로 시도하고, 막히면 첫 터치·클릭·키 입력 때 시작
    if (M.autoplay && !userOff) {
      play().catch(function () {
        var events = ['click', 'touchend', 'keydown'];
        var start = function () {
          events.forEach(function (t) { document.removeEventListener(t, start, true); });
          if (!userOff && audio.paused) play().catch(function () {});
        };
        events.forEach(function (t) { document.addEventListener(t, start, true); });
      });
    }

    // 다른 앱·탭으로 가면 멈추고, 돌아오면 이어서
    var resume = false;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { resume = !audio.paused; audio.pause(); }
      else if (resume && !userOff) { play().catch(function () {}); }
    });

    var pausedForVideo = false;
    return {
      videoPlaying: function () { if (!audio.paused) { pausedForVideo = true; audio.pause(); } },
      videoStopped: function () { if (pausedForVideo && !userOff) { pausedForVideo = false; play().catch(function () {}); } },
    };
  }
  if (C.music && C.music.src) bgm = musicButton();

  // 저장소 주소가 없으면 배포된 청첩장에서는 숨기고, 내 PC 미리보기에서만 '저장 안 됨'으로 보여 준다.
  var rsvpOn = C.rsvp && C.rsvp.enabled && (C.rsvp.endpoint || LOCAL);
  var guestbookOn = C.guestbook && C.guestbook.enabled && (C.guestbook.endpoint || LOCAL);
  var shareOn = C.share && C.share.enabled;
  var videoOn = !!C.video;
  if (!rsvpOn && !guestbookOn && !shareOn && !videoOn) return;

  /* ── 동영상: 유튜브 또는 직접 올린 mp4 ──────────────────────── */
  function videoSection() {
    var V = C.video;
    var frame = el('div', { class: 'video-frame' });
    if (V.youtube) {
      // 유튜브 재생 상태를 받아 배경음악을 멈추기 위해 enablejsapi 사용
      var iframe = el('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + V.youtube + '?rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin),
        title: V.title || '영상',
        allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
        allowfullscreen: true,
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      iframe.addEventListener('load', function () {
        try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'wedding-video' }), '*'); } catch (e) {}
      });
      window.addEventListener('message', function (e) {
        if (e.source !== iframe.contentWindow || !bgm || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
        var data;
        try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (er) { return; }
        var st = data && data.info && data.info.playerState;
        if (st === 1) bgm.videoPlaying();
        else if (st === 0 || st === 2) bgm.videoStopped();
      });
      frame.appendChild(iframe);
    } else {
      var video = el('video', { src: BASE + V.src, controls: true, playsinline: true, preload: 'metadata', poster: V.poster ? BASE + V.poster : false });
      video.addEventListener('play', function () { if (bgm) bgm.videoPlaying(); });
      video.addEventListener('pause', function () { if (bgm) bgm.videoStopped(); });
      video.addEventListener('ended', function () { if (bgm) bgm.videoStopped(); });
      frame.appendChild(video);
    }
    return el('section', { class: 'card video', id: 'wa-video' }, [V.title ? el('h2', { text: V.title }) : null, frame]);
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function radios(name, options, checked) {
    return el('div', { class: 'choices', role: 'radiogroup' }, options.map(function (o) {
      return el('label', { class: 'choice' }, [
        el('input', { type: 'radio', name: name, value: o, required: true, checked: o === checked }),
        el('span', { text: o }),
      ]);
    }));
  }

  function field(label, control, hint) {
    return el('div', { class: 'field' }, [el('div', { class: 'label', text: label }), control, hint ? el('div', { class: 'hint', text: hint }) : null]);
  }

  function remember(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
    return null;
  }

  function post(endpoint, body) {
    if (!endpoint) return new Promise(function (r) { setTimeout(function () { r({ ok: true, preview: true }); }, 300); });
    // text/plain 으로 보내면 Apps Script 가 CORS 사전 요청 없이 받는다.
    return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }

  function previewNote(endpoint) {
    return endpoint ? null : el('p', { class: 'preview', text: '미리보기: 저장소 주소(endpoint)가 없어 저장되지 않습니다. backend/README.md 를 참고하세요.' });
  }

  /* ── 참석 의사 전달 ─────────────────────────────────────────── */
  function rsvpSection() {
    var R = C.rsvp;
    var key = 'wedding-rsvp:' + C.id;
    var closed = R.deadline && new Date(R.deadline + 'T23:59:59+09:00') < new Date();
    var section = el('section', { class: 'card', id: 'wa-rsvp' }, [
      el('h2', { text: '참석 의사 전달' }),
      el('p', { class: 'sub', text: '원활한 예식 준비를 위해\n참석 여부를 미리 알려주세요.' + (R.deadline ? '\n(' + formatDate(R.deadline + 'T00:00:00+09:00') + '까지)' : '') }),
    ]);
    if (closed) {
      section.appendChild(el('p', { class: 'done', text: '참석 의사 전달이 마감되었습니다. 감사합니다.' }));
      return section;
    }
    var sent = remember(key);
    var form = el('form', { novalidate: true }, [
      field('어느 쪽 하객이신가요?', radios('side', ['신랑측', '신부측'])),
      field('성함', el('input', { name: 'name', maxlength: '20', autocomplete: 'name', required: true, placeholder: '홍길동' })),
      field('참석 여부', radios('attend', ['참석', '불참'])),
      R.askCompanions ? field('동행 인원', el('input', { name: 'companions', type: 'number', min: '0', max: '10', value: '0', inputmode: 'numeric' }), '본인을 제외한 인원') : null,
      R.askMeal ? field('식사 여부', radios('meal', ['식사함', '식사 안 함', '미정'])) : null,
      field('전하실 말 (선택)', el('textarea', { name: 'message', maxlength: '300', rows: '2' })),
      el('input', { name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
      el('button', { type: 'submit', class: 'primary', text: sent ? '다시 보내기' : '참석 의사 보내기' }),
      el('p', { class: 'status', role: 'status' }),
    ]);
    form.addEventListener('change', function () {
      var attend = form.querySelector('input[name=attend]:checked');
      var off = attend && attend.value === '불참';
      [].forEach.call(form.querySelectorAll('input[name=companions], input[name=meal]'), function (i) { i.disabled = off; });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = new FormData(form);
      var status = form.querySelector('.status');
      if (!f.get('side') || !String(f.get('name') || '').trim() || !f.get('attend') || (R.askMeal && f.get('attend') === '참석' && !f.get('meal'))) {
        status.textContent = '빈 칸을 채워 주세요.';
        return;
      }
      var btn = form.querySelector('button');
      btn.disabled = true;
      status.textContent = '보내는 중…';
      post(R.endpoint, {
        type: 'rsvp', side: f.get('side'), name: f.get('name'), attend: f.get('attend'),
        companions: f.get('attend') === '참석' ? f.get('companions') || 0 : 0,
        meal: f.get('attend') === '참석' ? f.get('meal') || '' : '',
        message: f.get('message'), website: f.get('website'),
      }).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        remember(key, '1');
        status.textContent = res.preview ? '미리보기라 저장되지 않았습니다.' : '전달되었습니다. 감사합니다!';
        btn.textContent = '다시 보내기';
      }).catch(function () {
        status.textContent = '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      }).then(function () { btn.disabled = false; });
    });
    section.appendChild(form);
    var note = previewNote(R.endpoint);
    if (note) section.appendChild(note);
    return section;
  }

  /* ── 방명록 ─────────────────────────────────────────────────── */
  function guestbookSection() {
    var G = C.guestbook;
    var list = el('ul', { class: 'posts' });
    var more = el('button', { type: 'button', class: 'ghost', text: '더 보기', hidden: true });
    var offset = 0;

    function item(p) {
      return el('li', {}, [
        el('div', { class: 'post-head' }, [el('b', { text: p.name }), el('span', { text: formatDate(p.at) })]),
        el('p', { text: p.message }),
      ]);
    }
    function load() {
      if (!G.endpoint) {
        if (!offset) list.appendChild(el('li', { class: 'empty', text: '첫 번째 축하 메시지를 남겨 주세요.' }));
        return;
      }
      more.disabled = true;
      fetch(G.endpoint + '?action=guestbook&offset=' + offset + '&limit=' + PAGE)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var empty = list.querySelector('.empty');
          if (empty) empty.remove();
          (res.items || []).forEach(function (p) { list.appendChild(item(p)); });
          offset += (res.items || []).length;
          if (!offset) list.appendChild(el('li', { class: 'empty', text: '첫 번째 축하 메시지를 남겨 주세요.' }));
          more.hidden = offset >= (res.total || 0);
        })
        .catch(function () { list.appendChild(el('li', { class: 'empty', text: '방명록을 불러오지 못했습니다.' })); })
        .then(function () { more.disabled = false; });
    }
    more.addEventListener('click', load);

    var form = el('form', { novalidate: true }, [
      el('input', { name: 'name', maxlength: '20', required: true, placeholder: '이름', autocomplete: 'name' }),
      el('textarea', { name: 'message', maxlength: '300', rows: '3', required: true, placeholder: '축하 메시지를 남겨 주세요 (300자 이내)' }),
      el('input', { name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
      el('button', { type: 'submit', class: 'primary', text: '남기기' }),
      el('p', { class: 'status', role: 'status' }),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = new FormData(form);
      var status = form.querySelector('.status');
      var name = String(f.get('name') || '').trim();
      var message = String(f.get('message') || '').trim();
      if (!name || !message) { status.textContent = '이름과 메시지를 채워 주세요.'; return; }
      var btn = form.querySelector('button');
      btn.disabled = true;
      status.textContent = '보내는 중…';
      post(G.endpoint, { type: 'guestbook', name: name, message: message, website: f.get('website') })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error);
          var empty = list.querySelector('.empty');
          if (empty) empty.remove();
          list.insertBefore(item({ name: name, message: message, at: res.at || new Date().toISOString() }), list.firstChild);
          if (!res.preview) offset++;
          form.reset();
          status.textContent = res.preview ? '미리보기라 저장되지 않았습니다.' : '축하 메시지가 등록되었습니다.';
        })
        .catch(function () { status.textContent = '등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'; })
        .then(function () { btn.disabled = false; });
    });

    load();
    return el('section', { class: 'card', id: 'wa-guestbook' }, [
      el('h2', { text: '방명록' }),
      el('p', { class: 'sub', text: '두 사람에게 축하의 한마디를 남겨 주세요.' }),
      form, list, more, previewNote(G.endpoint),
    ]);
  }

  /* ── 공유 ───────────────────────────────────────────────────── */
  function loadKakao() {
    return new Promise(function (resolve, reject) {
      if (window.Kakao) return resolve(window.Kakao);
      var s = document.createElement('script');
      s.src = KAKAO_SDK;
      s.integrity = KAKAO_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(window.Kakao); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function pageUrl() { return location.href.split('#')[0]; }

  function copyLink(status) {
    var url = pageUrl();
    var done = function () { status.textContent = '청첩장 주소를 복사했습니다.'; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { prompt('주소를 복사해 주세요', url); });
    else prompt('주소를 복사해 주세요', url);
  }

  function shareKakao(status) {
    var S = C.share;
    loadKakao().then(function (Kakao) {
      if (!Kakao.isInitialized()) Kakao.init(S.kakaoKey);
      var link = { mobileWebUrl: pageUrl(), webUrl: pageUrl() };
      var image = S.image ? new URL(S.image, BASE).href : '';
      if (image) {
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: { title: S.title, description: S.description, imageUrl: image, link: link },
          buttons: [{ title: S.buttonText || '모바일 청첩장 보기', link: link }],
        });
      } else {
        Kakao.Share.sendDefault({ objectType: 'text', text: S.title + '\n' + S.description, link: link, buttonTitle: S.buttonText || '모바일 청첩장 보기' });
      }
    }).catch(function () {
      status.textContent = '카카오톡 공유를 불러오지 못했습니다. 주소 복사를 이용해 주세요.';
    });
  }

  function shareSection() {
    var S = C.share;
    var status = el('p', { class: 'status', role: 'status' });
    var buttons = [];
    if (S.kakaoKey) {
      var k = el('button', { type: 'button', class: 'kakao', text: '카카오톡으로 공유하기' });
      k.addEventListener('click', function () { shareKakao(status); });
      buttons.push(k);
    } else if (navigator.share) {
      var n = el('button', { type: 'button', class: 'primary', text: '공유하기' });
      n.addEventListener('click', function () { navigator.share({ title: S.title, text: S.description, url: pageUrl() }).catch(function () {}); });
      buttons.push(n);
    }
    var c = el('button', { type: 'button', class: 'ghost', text: '청첩장 주소 복사' });
    c.addEventListener('click', function () { copyLink(status); });
    buttons.push(c);
    return el('section', { class: 'card share', id: 'wa-share' }, [el('div', { class: 'buttons' }, buttons), status]);
  }

  /* ── 붙이기 ─────────────────────────────────────────────────── */
  function render(target, where) {
    var host = el('div', { id: 'wedding-addons' });
    var root = host.attachShadow({ mode: 'open' });
    if (C.accent) host.style.setProperty('--wa-accent', C.accent);
    root.appendChild(el('link', { rel: 'stylesheet', href: BASE + 'wedding-addons.css' }));
    var wrap = el('div', { class: 'wrap' });
    if (videoOn) wrap.appendChild(videoSection());
    if (rsvpOn) wrap.appendChild(rsvpSection());
    if (guestbookOn) wrap.appendChild(guestbookSection());
    if (shareOn) wrap.appendChild(shareSection());
    root.appendChild(wrap);
    target.insertAdjacentElement(where || 'beforeend', host);
  }

  // React/Vue 템플릿은 화면을 늦게 그리므로 붙일 자리가 생길 때까지 잠시 기다린다.
  function mount() {
    var m = C.mount || {};
    if (!m.selector) return render(document.body, 'beforeend');
    var started = Date.now();
    (function tryMount() {
      var target = document.querySelector(m.selector);
      if (target) return render(target, m.where);
      if (Date.now() - started > 10000) return render(document.body, 'beforeend');
      setTimeout(tryMount, 100);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
