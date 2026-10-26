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
  $('#link-share').addEventListener('click',()=>copy(location.href.split('#')[0],'청첩장 링크를 복사했습니다'));
  const menu=$('#quick-menu'),toggle=$('#menu-toggle');
  function closeMenu(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
  toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('click',e=>{if(!e.target.closest('.floating-nav'))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  function openDialog(dialog){dialog.showModal();document.body.classList.add('modal-open');}
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openDialog(document.getElementById(b.dataset.open))));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('close',()=>document.body.classList.remove('modal-open'));
    dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
  });
  let photoIndex=0;
  function showPhoto(i){photoIndex=(i+C.gallery.length)%C.gallery.length;$('#lightbox-image').src=C.gallery[photoIndex];$('#photo-count').textContent=`${photoIndex+1} / ${C.gallery.length}`;$('#photo-prev').disabled=$('#photo-next').disabled=C.gallery.length<2;}
  document.querySelectorAll('[data-photo]').forEach((b,i)=>b.addEventListener('click',()=>{showPhoto(i);openDialog($('#lightbox'));}));
  $('#photo-prev').addEventListener('click',()=>showPhoto(photoIndex-1));$('#photo-next').addEventListener('click',()=>showPhoto(photoIndex+1));
  $('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft')showPhoto(photoIndex-1);if(e.key==='ArrowRight')showPhoto(photoIndex+1);});
  function updateTime(){
    const remaining=Math.max(0,new Date(C.date)-Date.now());
    const seconds=Math.floor(remaining/1000);
    for(const [key,value] of Object.entries({days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60}))document.getElementById(key).textContent=key==='days'?value:String(value).padStart(2,'0');
    const today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
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
  let mapStarted=false;
  async function startMap(){
    if(mapStarted||!C.mapKey)return;mapStarted=true;
    try{
      await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(C.mapKey)}&autoload=false`);
      window.kakao.maps.load(()=>{try{const center=new window.kakao.maps.LatLng(C.lat,C.lng);const map=new window.kakao.maps.Map($('#map'),{center,level:4});new window.kakao.maps.Marker({map,position:center});$('#map-fallback').hidden=true;}catch{}});
    }catch{/* Address and map links remain usable when the map service is unavailable. */}
  }
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){startMap();observer.disconnect();}},{rootMargin:'200px'});observer.observe($('#map'));}else startMap();
  $('#kakao-share')?.addEventListener('click',async()=>{
    try{await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js');const K=window.Kakao;if(!K.isInitialized())K.init(C.shareKey);const url=location.href.split('#')[0];const link={mobileWebUrl:url,webUrl:url};const image=new URL(C.shareImage||location.href,location.href).href;if(C.shareImage)K.Share.sendDefault({objectType:'feed',content:{title:C.title,description:C.description,imageUrl:image,link},buttons:[{title:'청첩장 보기',link}]});else K.Share.sendDefault({objectType:'text',text:C.title,link,buttonTitle:'청첩장 보기'});}catch{await copy(location.href.split('#')[0],'카카오 공유를 사용할 수 없어 링크를 복사했습니다');}
  });
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target);}}),{threshold:.04});document.querySelectorAll('.section-heading,.greeting-copy,.date-card,.ending-copy').forEach(e=>{e.classList.add('reveal-ready');observer.observe(e);});}
})();
