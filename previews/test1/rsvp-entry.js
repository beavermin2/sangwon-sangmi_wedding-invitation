(() => {
  'use strict';
  const C=window.PREVIEW_DATA,config=C.rsvp;
  const entry=document.getElementById('rsvp-entry');
  if(!entry||!config?.enabled||!config.endpoint)return;
  // 페이지와 독립된 하단 패널로 두어 청첩장의 스크롤과 메뉴를 가리지 않는다.
  document.body.append(entry);
  const responseKey=`paper-rose-rsvp:${config.endpoint}:${C.date}`;
  const dayKey=`${responseKey}:entry-hidden-day`;
  const koreanDay=()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  const read=(storage,key)=>{try{return window[storage].getItem(key);}catch{return null;}};
  const save=(storage,key,value)=>{try{window[storage].setItem(key,value);}catch{}};
  function showEntry(){
    if(config.deadline&&Date.now()>new Date(`${config.deadline}T23:59:59+09:00`).getTime())return;
    if(read('sessionStorage',responseKey)==='sent'||read('localStorage',dayKey)===koreanDay())return;
    // 다른 대화상자를 이미 사용 중이면 자동 안내로 방해하지 않는다.
    if(document.querySelector('dialog[open]'))return;
    entry.show();
  }
  document.getElementById('rsvp-entry-write').addEventListener('click',()=>{
    entry.addEventListener('close',()=>document.getElementById('rsvp-open').click(),{once:true});
    entry.close();
  });
  document.getElementById('rsvp-entry-later').addEventListener('click',()=>{
    save('localStorage',dayKey,koreanDay());entry.close();
  });
  if(document.getElementById('opening')?.hidden===false){
    document.addEventListener('invitation:opening-finished',showEntry,{once:true});
  }else showEntry();
})();
