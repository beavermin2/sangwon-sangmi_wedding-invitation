(() => {
  'use strict';
  const C=window.PREVIEW_DATA.rsvp;
  const form=document.getElementById('rsvp-form');
  if(!form||!C?.enabled)return;
  const $=id=>document.getElementById(id);
  const fields=$('rsvp-fields'),submit=$('rsvp-submit'),status=$('rsvp-status');
  const key=`paper-rose-rsvp:${C.endpoint}:${window.PREVIEW_DATA.date}`;
  // Keep the minimum-count note in the existing message column, including older deployments.
  const groupNote='[참석 인원: 본인 포함 10명 이상]\n';
  let busy=false,done=false;
  const expired=()=>Boolean(C.deadline&&Date.now()>new Date(`${C.deadline}T23:59:59+09:00`).getTime());
  function success(){done=true;form.hidden=true;$('rsvp-success').hidden=false;$('rsvp-open').textContent='참석의사 전달 완료 · 확인';}
  function sync(){
    const attending=form.elements.attend.value==='참석';
    // 항목 자리를 유지해 참석 선택 전후에 모달 높이가 바뀌지 않게 한다.
    $('rsvp-attending').hidden=!C.askCompanions&&!C.askMeal;
    for(const [name,enabled] of [['companions',C.askCompanions],['meal',C.askMeal]]){
      $(`rsvp-${name}-wrap`).hidden=!enabled;
      form.elements[name].disabled=!attending||!enabled;
    }
    if(expired()||!C.endpoint){fields.disabled=true;submit.disabled=true;status.textContent=expired()?'참석의사 접수가 마감되었습니다. 신랑·신부에게 직접 연락해 주세요.':'참석의사 접수를 준비 중입니다. 신랑·신부에게 직접 연락해 주세요.';}
  }
  form.addEventListener('change',sync);
  $('rsvp-open').addEventListener('click',sync);
  try{if(sessionStorage.getItem(key)==='sent')success();}catch{}
  sync();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||done)return;
    if(expired()||!C.endpoint){sync();return;}
    const name=form.elements.name;
    name.value=name.value.trim();
    if(!form.reportValidity())return;
    const data=new FormData(form),attending=data.get('attend')==='참석';
    const minimumGroup=attending&&C.askCompanions&&data.get('companions')==='9';
    const message=String(data.get('message')||'').trim();
    const messageLimit=300-(minimumGroup?groupNote.length:0);
    if(message.length>messageLimit){status.textContent=`참석 인원 안내를 함께 저장할 수 있도록 전하실 말씀을 ${messageLimit}자 이내로 줄여 주세요.`;form.elements.message.focus();return;}
    // Labels show the total party size; option values retain the API's companions-only count.
    const body={type:'rsvp',name:data.get('name'),side:data.get('side'),attend:data.get('attend'),companions:attending&&C.askCompanions?Number(data.get('companions')):0,meal:attending&&C.askMeal?data.get('meal'):'',message:(minimumGroup?groupNote:'')+message};
    busy=true;fields.disabled=true;submit.disabled=true;submit.textContent='전달하고 있어요…';status.textContent='잠시만 기다려 주세요.';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(C.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});
      if(!response.ok)throw new Error('http');
      const result=await response.json();
      if(result.ok!==true)throw new Error('save');
      try{sessionStorage.setItem(key,'sent');}catch{}
      success();
    }catch{
      status.textContent='전달 완료를 확인하지 못했습니다. 입력 내용은 그대로 남아 있습니다. 잠시 후 다시 시도하거나 신랑·신부에게 확인해 주세요.';
    }finally{
      clearTimeout(timeout);busy=false;fields.disabled=false;submit.disabled=false;submit.textContent='참석의사 보내기';sync();
    }
  });
})();
