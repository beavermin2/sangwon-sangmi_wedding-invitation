/* Standalone preview interactions. No dependency on the original invitation UI. */
(() => {
  'use strict';
  const C = window.PREVIEW_DATA;
  const $ = s => document.querySelector(s);
  let toastTimer;
  function toast(text) { $('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600); }
  async function copy(text,message) {
    try { await navigator.clipboard.writeText(text);toast(message||'복사했습니다'); }
    catch { const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(ok)toast(message||'복사했습니다');else window.prompt('아래 내용을 복사해 주세요.',text); }
  }
  document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copy(b.dataset.copy,b.dataset.copyMessage)));
  document.querySelectorAll('[data-pay-pending]').forEach(b=>b.addEventListener('click',()=>toast('카카오페이 송금 링크를 준비 중입니다. 왼쪽 버튼으로 계좌번호를 복사해 주세요.')));
  document.querySelectorAll('.account').forEach(account=>{
    const summary=account.querySelector('summary'),body=account.querySelector('.account-body');
    let expanded=account.open,animation=null;
    account.dataset.expanded=String(expanded);
    summary.setAttribute('aria-expanded',String(expanded));
    summary.addEventListener('click',event=>{
      event.preventDefault();
      const start=account.getBoundingClientRect().height;
      expanded=!expanded;
      if(animation){animation.onfinish=null;animation.cancel();animation=null;}
      account.dataset.expanded=String(expanded);
      summary.setAttribute('aria-expanded',String(expanded));
      body.inert=!expanded;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){account.open=expanded;return;}
      account.open=true;
      const borders=account.getBoundingClientRect().height-account.clientHeight;
      const end=expanded?account.getBoundingClientRect().height:summary.getBoundingClientRect().height+borders;
      animation=account.animate([{height:start+'px'},{height:end+'px'}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});
      animation.onfinish=()=>{account.open=expanded;animation=null;};
    });
  });
  $('#link-share').addEventListener('click',()=>copy(location.href.split('#')[0],'청첩장 링크를 복사했습니다'));
  const menu=$('#quick-menu'),toggle=$('#menu-toggle');
  let menuScroll=0,closingMenu=null;
  const invitation=$('.invitation');
  function closeMenu(){
    if(closingMenu)return closingMenu;
    if(menu.hidden)return Promise.resolve();
    document.body.classList.remove('nav-expanded');
    // Keep the fixed preview and scroll offset until the return transition finishes.
    closingMenu=Promise.all(invitation.getAnimations().map(animation=>animation.finished.catch(()=>{}))).then(()=>{
      menu.hidden=true;toggle.setAttribute('aria-expanded','false');document.body.classList.remove('nav-open');
      $('#invitation-content').style.transform='';$('#page-frame').inert=false;
      window.scrollTo({top:menuScroll,behavior:'instant'});toggle.focus({preventScroll:true});
    }).finally(()=>{closingMenu=null;});
    return closingMenu;
  }
  toggle.addEventListener('click',()=>{
    if(!menu.hidden||closingMenu)return;
    menuScroll=scrollY;menu.hidden=false;toggle.setAttribute('aria-expanded','true');
    $('#invitation-content').style.transform=`translateY(${-menuScroll}px)`;
    document.body.classList.add('nav-open');$('#page-frame').inert=true;
    // Establish the full-size starting frame before sliding it into the menu.
    invitation.getBoundingClientRect();
    document.body.classList.add('nav-expanded');$('#menu-close').focus({preventScroll:true});
  });
  $('#menu-close').addEventListener('click',closeMenu);
  menu.querySelectorAll('a[href^="#"]').forEach(a=>{if(!document.querySelector(a.getAttribute('href'))){a.hidden=true;return;}a.addEventListener('click',async e=>{e.preventDefault();const target=document.querySelector(a.getAttribute('href'));await closeMenu();requestAnimationFrame(()=>{target.scrollIntoView({behavior:'smooth'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});});});});
  document.addEventListener('keydown',e=>{
    if(menu.hidden)return;
    if(e.key==='Escape'){e.preventDefault();closeMenu();}
    if(e.key==='Tab'){const focusable=[...menu.querySelectorAll('button,a[href]')].filter(e=>!e.hidden);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('[data-drawer-contact]').addEventListener('click',async()=>{await closeMenu();openDialog($('#contacts'));});
  $('[data-drawer-top]').addEventListener('click',async()=>{await closeMenu();window.scrollTo({top:0,behavior:'smooth'});});
  $('[data-drawer-calendar]').addEventListener('click',()=>$('#calendar-save').click());
  $('[data-drawer-copy]').addEventListener('click',()=>$('#link-share').click());
  $('[data-drawer-share]').addEventListener('click',()=>{if($('#kakao-share'))$('#kakao-share').click();else $('#link-share').click();});
  function openDialog(dialog){dialog.showModal();document.body.classList.add('modal-open');}
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openDialog(document.getElementById(b.dataset.open))));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('close',()=>document.body.classList.remove('modal-open'));
    dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
  });
  let photoIndex=0,photoItems=[];
  function showPhoto(i){photoIndex=(i+photoItems.length)%photoItems.length;const item=photoItems[photoIndex];$('#lightbox-image').src=item.dataset.photo;$('#lightbox-image').alt=item.querySelector('img').alt;$('#photo-count').textContent=`${photoIndex+1} / ${photoItems.length}`;$('#photo-prev').disabled=$('#photo-next').disabled=photoItems.length<2;}
  document.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click',()=>{photoItems=[...b.closest('section').querySelectorAll('[data-photo]')].sort((a,b)=>Number(a.dataset.photoOrder||0)-Number(b.dataset.photoOrder||0));showPhoto(photoItems.indexOf(b));openDialog($('#lightbox'));}));
  $('#photo-prev').addEventListener('click',()=>showPhoto(photoIndex-1));$('#photo-next').addEventListener('click',()=>showPhoto(photoIndex+1));
  $('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft')showPhoto(photoIndex-1);if(e.key==='ArrowRight')showPhoto(photoIndex+1);});
  const momentsTrack=$('#moments-track'),momentSlides=[...momentsTrack.children];
  let momentIndex=0,scrollFrame=0;
  function updateMoment(){
    if(!momentsTrack.clientWidth)return;
    momentIndex=Math.max(0,Math.min(momentSlides.length-1,Math.round(momentsTrack.scrollLeft/momentsTrack.clientWidth)));
    const counter=`${String(momentIndex+1).padStart(2,'0')} / ${String(momentSlides.length).padStart(2,'0')}`;
    if($('#moments-counter').textContent!==counter)$('#moments-counter').textContent=counter;
    $('#moments-prev').setAttribute('aria-label',momentIndex===0?'이야기 표지로 돌아가기':'이전 순간');
    $('#moments-next').disabled=momentIndex===momentSlides.length-1;
    momentSlides.forEach((slide,i)=>{slide.inert=i!==momentIndex;slide.setAttribute('aria-hidden',String(i!==momentIndex));});
  }
  function goMoment(index){
    if(index<0){changeStory(false);return;}
    const next=Math.max(0,Math.min(momentSlides.length-1,index));
    momentsTrack.scrollTo({left:next*momentsTrack.clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  $('#moments-prev').addEventListener('click',()=>goMoment(momentIndex-1));
  $('#moments-next').addEventListener('click',()=>goMoment(momentIndex+1));
  momentsTrack.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();goMoment(momentIndex+(e.key==='ArrowRight'?1:-1));}});
  momentsTrack.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(updateMoment);},{passive:true});
  new ResizeObserver(()=>{if(momentsTrack.clientWidth)momentsTrack.scrollTo({left:momentIndex*momentsTrack.clientWidth,behavior:'instant'});}).observe(momentsTrack);
  updateMoment();
  const storyCover=$('#moments-cover'),storyContent=$('#moments-content');
  let storyChanging=false;
  async function changeStory(showStory){
    if(storyChanging)return;storyChanging=true;
    const outgoing=showStory?storyCover:storyContent,incoming=showStory?storyContent:storyCover;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBefore=scrollY;
    await outgoing.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-12px)'}],{duration:reduce?0:200,easing:'ease-in'}).finished.catch(()=>{});
    outgoing.hidden=true;incoming.hidden=false;
    if(showStory){momentIndex=0;momentsTrack.scrollTo({left:0,behavior:'instant'});updateMoment();}
    window.scrollTo({top:scrollBefore,behavior:'instant'});
    const focusTarget=showStory?momentsTrack:$('#moments-start');focusTarget.focus({preventScroll:true});
    await incoming.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:reduce?0:450,easing:'cubic-bezier(.22,1,.36,1)'}).finished.catch(()=>{});
    storyChanging=false;
  }
  storyCover.hidden=false;storyContent.hidden=true;
  $('#moments-start').addEventListener('click',()=>changeStory(true));
  function updateTime(){
    const remaining=Math.max(0,new Date(C.date)-Date.now());
    const seconds=Math.floor(remaining/1000);
    for(const [key,value] of Object.entries({days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60}))document.getElementById(key).textContent=key==='days'?value:String(value).padStart(2,'0');
    const today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
    const togetherDays=Math.max(0,Math.round((Date.parse(today)-Date.parse(C.togetherSince))/86400000)+1);
    $('#together-days').textContent=String(togetherDays);
    const dayDiff=Math.round((Date.parse(C.dateIso)-Date.parse(today))/86400000);
    $('#day-message').textContent=dayDiff>0?`${C.names}의 결혼식이 ${dayDiff}일 남았습니다.`:dayDiff===0?'오늘, 저희 결혼합니다. 함께해 주셔서 감사합니다.':'저희의 시작을 함께해 주셔서 감사합니다.';
  }
  updateTime();setInterval(updateTime,1000);
  $('#calendar-save').addEventListener('click',()=>{
    const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const start=new Date(C.date),end=new Date(start.getTime()+3600000);
    const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wedding invitation//KO','BEGIN:VEVENT',`UID:${C.dateIso}-${location.hostname}@wedding`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${esc(C.names+' 결혼식')}`,`LOCATION:${esc(C.venue+' '+C.address)}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='wedding.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const scripts=new Map();
  function loadScript(src){if(scripts.has(src))return scripts.get(src);const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.append(script);});scripts.set(src,promise);return promise;}
  // Prepare the SDK ahead of the tap so native navigation keeps the user gesture.
  loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js').catch(()=>{});
  $('#kakao-navi').addEventListener('click',async()=>{
    try{
      if(!window.Kakao)await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js');
      const K=window.Kakao;if(!K.isInitialized())K.init(C.shareKey||C.mapKey);
      K.Navi.start({name:C.venue,x:Number(C.lng),y:Number(C.lat),coordType:'wgs84'});
    }catch{toast('카카오내비를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  });
  async function startMap(){
    const status=$('#map-status');
    let timeout;
    try{
      if(!C.mapKey)throw new Error('Missing Kakao Maps key');
      await Promise.race([
        (async()=>{
          await loadScript('https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(C.mapKey)+'&autoload=false');
          await new Promise(resolve=>window.kakao.maps.load(resolve));
        })(),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Kakao Maps load timed out')),12000);})
      ]);
      const K=window.kakao.maps,center=new K.LatLng(Number(C.lat),Number(C.lng));
      const map=new K.Map($('#map'),{center,level:3,scrollwheel:false});
      new K.Marker({position:center,map,title:C.venue});
      map.addControl(new K.ZoomControl(),K.ControlPosition.RIGHT);
      new ResizeObserver(()=>{const current=map.getCenter();map.relayout();map.setCenter(current);}).observe($('#map'));
      $('#map').dataset.state='ready';status.hidden=true;
    }catch(error){
      $('#map').dataset.state='error';
      status.textContent='지도를 불러오지 못했습니다. 아래 내비게이션 메뉴나 약도를 이용해 주세요.';
      console.warn('[Kakao Maps]',error);
    }finally{clearTimeout(timeout);}
  }
  const mapObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){mapObserver.disconnect();startMap();}},{rootMargin:'300px'});
  mapObserver.observe($('#map'));
  $('#kakao-share')?.addEventListener('click',async()=>{
    try{await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js');const K=window.Kakao;if(!K.isInitialized())K.init(C.shareKey);const url=location.href.split('#')[0];const link={mobileWebUrl:url,webUrl:url};const image=new URL(C.shareImage||location.href,location.href).href;if(C.shareImage)K.Share.sendDefault({objectType:'feed',content:{title:C.title,description:C.description,imageUrl:image,link},buttons:[{title:'청첩장 보기',link}]});else K.Share.sendDefault({objectType:'text',text:C.title,link,buttonTitle:'청첩장 보기'});}catch{await copy(location.href.split('#')[0],'카카오 공유를 사용할 수 없어 링크를 복사했습니다');}
  });
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target);}}),{threshold:.04});document.querySelectorAll('.section-heading,.greeting-copy,.together-section,.ending-copy').forEach(e=>{e.classList.add('reveal-ready');observer.observe(e);});}
  // Progressive enhancement: the invitation stays usable if scripting or images fail.
  const opening=$('#opening'),openingSkip=$('#opening-skip'),frame=$('#page-frame'),floating=$('.floating-nav');
  let openingDone=false,openingTimer,titleAnimation=null;
  function finishOpening(){
    if(openingDone)return;openingDone=true;clearTimeout(openingTimer);
    titleAnimation?.destroy();titleAnimation=null;
    if(opening.contains(document.activeElement))document.activeElement.blur();
    opening.hidden=true;opening.classList.remove('opening-playing');document.body.classList.remove('opening-active');
    frame.inert=false;floating.inert=false;
  }
  openingSkip.addEventListener('click',finishOpening);
  opening.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finishOpening();}else if(e.key==='Tab'){e.preventDefault();openingSkip.focus();}});
  opening.addEventListener('animationend',e=>{if(e.target===opening&&e.animationName==='opening-exit')finishOpening();});
  if((!location.hash||location.hash==='#top')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    opening.hidden=false;document.body.classList.add('opening-active');frame.inert=true;floating.inert=true;opening.focus({preventScroll:true});
    openingTimer=setTimeout(finishOpening,7000);
    const titleReady=new Promise(resolve=>{
      if(!window.lottie||!window.OPENING_TITLE_DATA){resolve();return;}
      try{
        titleAnimation=window.lottie.loadAnimation({container:$('#opening-title'),renderer:'svg',loop:false,autoplay:false,animationData:window.OPENING_TITLE_DATA,rendererSettings:{preserveAspectRatio:'xMidYMid meet'}});
        const ready=()=>{if(!openingDone)opening.classList.add('opening-title-ready');resolve();};
        if(titleAnimation.isLoaded)ready();else titleAnimation.addEventListener('DOMLoaded',ready);
        titleAnimation.addEventListener('data_failed',()=>resolve());
      }catch{resolve();}
    });
    Promise.race([Promise.all([titleReady,...[...opening.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))]),new Promise(resolve=>setTimeout(resolve,1000))]).then(()=>{
      if(!openingDone){
        opening.classList.add('opening-playing');titleAnimation?.goToAndPlay(0,true);
        clearTimeout(openingTimer);openingTimer=setTimeout(finishOpening,5500);
      }
    });
  }
})();
