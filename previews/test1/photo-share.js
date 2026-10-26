import {MAX_UPLOAD_BYTES,validatePhotos,validatePhotoSignature,sendPhoto} from './photo-share-core.js';
import {getBackendClient,loadBackendScript,withTimeout,isServiceUnavailable} from './backend-resilience.js';
const $=id=>document.getElementById(id),form=$('photo-share-form');
if(form){
  const config=window.PREVIEW_DATA.guestbook,dialog=$('photo-share-dialog'),fields=$('photo-share-fields'),submit=$('photo-share-submit'),files=$('photo-share-files'),status=$('photo-share-status');
  let entries=[],busy=false,preparing=false,generation=0,availability=null,widget,token='',refreshing=null,connectionFailed=false;
  const retry=$('photo-share-retry'),loadScript=loadBackendScript;
  const getClient=()=>getBackendClient(config,new URL('./supabase.js',import.meta.url).href);
  function errorText(error){
    const message=String(error?.message||error||'');
    if(message.includes('PHOTO_CLOSED'))return '지금은 사진을 보낼 수 없는 시간입니다. 업로드 시작 안내를 확인해 주세요.';
    if(message.includes('PHOTO_SETTINGS_CHANGED'))return '사진 저장 방식이 변경되었습니다. 다시 보내기를 눌러 주세요. 선택한 사진은 유지됩니다.';
    if(message.includes('PHOTO_LIMIT'))return '이 브라우저에서 보낼 수 있는 사진 수를 모두 사용했습니다. 추가 사진은 신랑·신부에게 연락해 주세요.';
    if(isServiceUnavailable(error))return '사진 공유 연결이 잠시 원활하지 않습니다. 입력한 내용과 선택한 사진은 유지되니 잠시 후 다시 시도해 주세요.';
    if(error?.code==='42501')return '사진 저장 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    if(error?.name==='TimeoutError'||error?.name==='AbortError'||message.includes('fetch'))return '연결이 지연되고 있습니다. 사진은 그대로 있으니 다시 시도해 주세요.';
    if(message.includes('captcha'))return '자동 등록 방지 확인을 완료한 뒤 다시 시도해 주세요.';
    return /[가-힣]/.test(message)?message:'사진을 보내지 못했습니다. 선택한 사진은 유지되니 잠시 후 다시 시도해 주세요.';
  }
  function sync(){
    fields.disabled=busy||preparing;
    submit.disabled=busy||preparing||!availability?.canUpload||!entries.length;
    files.disabled=busy||preparing;
    retry.disabled=busy||preparing;
    dialog.querySelector('[data-close]').disabled=busy||preparing;
    const reserved=entries.some(entry=>entry.path);
    $('photo-share-name').readOnly=reserved;$('photo-share-message').readOnly=reserved;
    submit.textContent=busy?'사진을 보내고 있어요…':entries.length&&entries.every(entry=>entry.done)?'다른 사진 보내기':entries.some(entry=>entry.done)?'남은 사진 다시 보내기':'사진 보내기';
  }
  function render(){
    const list=$('photo-share-previews');list.replaceChildren();
    entries.forEach((entry,index)=>{
      const li=document.createElement('li'),img=document.createElement('img'),note=document.createElement('span');
      img.src=entry.url;img.alt='선택한 사진 '+(index+1);note.textContent=entry.done?'전달 완료':entry.error?'다시 시도해 주세요':'준비 완료';li.append(img,note);
      img.onerror=()=>{const label=document.createElement('span');label.className='photo-share-file-label';label.textContent=entry.file?.name||'사진 미리보기 불가';img.replaceWith(label);};
      if(!entry.path&&!busy&&!preparing){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',(index+1)+'번째 사진 빼기');remove.addEventListener('click',()=>{URL.revokeObjectURL(entry.url);entries.splice(index,1);status.textContent=entries.length?entries.length+'장의 사진이 준비되었습니다.':'사진을 선택해 주세요.';render();sync();});li.append(remove);}
      list.append(li);
    });
  }
  function refresh(){
    if(refreshing)return refreshing;
    retry.disabled=true;
    refreshing=(async()=>{
    try{
      const client=await getClient(),result=await withTimeout(()=>client.rpc('wedding_photo_status'));if(result.error||!result.data)throw result.error||new Error('설정 없음');availability=result.data;
      const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(availability.opensAt));
      $('photo-share-availability').textContent=availability.canUpload?'지금 사진을 보내실 수 있어요.':availability.mode==='closed'?'사진 업로드가 잠시 쉬고 있어요.':date+'부터 사진을 보내실 수 있어요.';
      $('photo-share-storage-help').textContent=availability.storageMode==='original'?'사진은 원본 그대로 전달됩니다. 촬영 정보도 함께 보관됩니다.':'사진은 긴 변 최대 2,048px, 2MB 이하의 JPEG로 줄여 보냅니다.';
      retry.hidden=true;
      if(connectionFailed){status.textContent=entries.length?entries.length+'장의 사진이 준비되었습니다.':'연결되었습니다. 사진을 선택해 주세요.';connectionFailed=false;}
    }catch{availability=null;connectionFailed=true;retry.hidden=false;$('photo-share-availability').textContent='사진 공유를 잠시 이용할 수 없습니다. 청첩장은 계속 보실 수 있어요.';$('photo-share-storage-help').textContent='연결이 복구되면 사진 저장 방식을 안내해 드릴게요.';status.textContent='사진 공유 연결을 확인하지 못했습니다. 입력한 내용과 선택한 사진은 유지됩니다. 잠시 후 연결을 다시 확인해 주세요.';}
    sync();return availability;
    })().finally(()=>{refreshing=null;sync();});
    return refreshing;
  }
  retry.addEventListener('click',()=>refresh());
  async function prepareCaptcha(){
    if(!config.turnstileSiteKey||widget!==undefined)return;
    if(!window.turnstile)await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    widget=window.turnstile.render('#photo-share-captcha',{sitekey:config.turnstileSiteKey,callback:value=>{token=value;},'expired-callback':()=>{token='';}});
  }
  async function convert(file,storageMode='compressed'){
    await validatePhotoSignature(file);
    // Preserve HEIC/HEIF bytes even when this browser cannot decode the preview.
    if(storageMode==='original'&&/^image\/(heic|heif)$/i.test(file.type))return file;
    const url=URL.createObjectURL(file),img=new Image();
    try{img.src=url;await img.decode();}catch{throw new Error('읽을 수 없는 사진이 있습니다. JPG 또는 PNG로 변환해 다시 선택해 주세요.');}finally{URL.revokeObjectURL(url);}
    if(storageMode==='original')return file;
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)throw new Error('사진 해상도가 너무 큽니다. 크기를 줄여 다시 선택해 주세요.');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    for(const max of [2048,1600,1280]){
      const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for(const quality of [.86,.74,.6]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob?.type==='image/jpeg'&&blob.size<=MAX_UPLOAD_BYTES)return blob;}
    }
    throw new Error('사진 용량을 줄이지 못했습니다. 다른 사진을 선택해 주세요.');
  }
  files.addEventListener('change',async()=>{
    if(busy||preparing)return;
    const selected=[...files.files],version=++generation;if(!selected.length)return;
    preparing=true;status.textContent='사진을 준비하고 있습니다.';sync();render();const next=[];
    try{
      validatePhotos([...entries.map(entry=>entry.blob),...selected]);
      const storageMode=availability?.storageMode||'compressed';
      for(const file of selected){const blob=await convert(file,storageMode);next.push({id:crypto.randomUUID(),file,storageMode,blob,url:URL.createObjectURL(blob),done:false});}
      if(version!==generation){next.forEach(entry=>URL.revokeObjectURL(entry.url));return;}
      entries.push(...next);status.textContent=entries.length+'장의 사진이 준비되었습니다.';
    }catch(error){next.forEach(entry=>URL.revokeObjectURL(entry.url));status.textContent=errorText(error);}
    finally{files.value='';preparing=false;render();sync();}
  });
  $('photo-share-open').addEventListener('click',async()=>{if(!await refresh())return;try{await prepareCaptcha();}catch(error){status.textContent=errorText(error);}});
  dialog.addEventListener('cancel',event=>{if(busy||preparing)event.preventDefault();});
  dialog.addEventListener('click',event=>{if((busy||preparing)&&event.target===dialog)event.stopImmediatePropagation();},true);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||preparing)return;
    if(entries.length&&entries.every(entry=>entry.done)){entries.forEach(entry=>URL.revokeObjectURL(entry.url));entries=[];$('photo-share-message').value='';status.textContent='새 사진을 선택해 주세요.';render();sync();files.click();return;}
    if(!form.reportValidity()||!entries.length)return;
    const sender=$('photo-share-name').value.trim(),message=$('photo-share-message').value.trim();
    if(!sender){status.textContent='성함을 입력해 주세요.';return;}
    busy=true;sync();render();status.textContent='사진을 안전하게 전달하고 있습니다.';
    try{
      const current=await refresh();
      if(!current)throw new Error('BACKEND_UNAVAILABLE');
      if(!current.canUpload)throw new Error('PHOTO_CLOSED');
      const storageMode=availability.storageMode||'compressed';
      for(const entry of entries){
        if(!entry.path&&entry.storageMode!==storageMode){
          status.textContent='현재 저장 방식에 맞춰 사진을 준비하고 있습니다.';
          entry.blob=await convert(entry.file,storageMode);entry.storageMode=storageMode;
          URL.revokeObjectURL(entry.url);entry.url=URL.createObjectURL(entry.blob);
        }
      }
      const client=await getClient();let {data,error}=await withTimeout(()=>client.auth.getSession());if(error)throw error;
      if(!data.session){if(config.turnstileSiteKey&&!token)throw new Error('captcha');const signed=await withTimeout(()=>client.auth.signInAnonymously(token?{options:{captchaToken:token}}:{}));if(signed.error)throw signed.error;}
      for(let i=0;i<entries.length;i++){
        const entry=entries[i];if(entry.done)continue;
        status.textContent=(i+1)+' / '+entries.length+'번째 사진을 보내고 있습니다.';
        try{await sendPhoto(client,entry,sender,message);entry.error=false;}catch(error){entry.error=true;throw error;}finally{render();}
      }
      status.textContent=entries.length+'장의 사진을 전달했습니다. 소중한 순간을 나눠주셔서 감사합니다.';
    }catch(error){status.textContent=errorText(error)+(entries.some(entry=>entry.done)?' 이미 보낸 사진은 다시 보내지 않습니다.':'');if(isServiceUnavailable(error))retry.hidden=false;}
    finally{busy=false;sync();render();}
  });
  refresh();setInterval(()=>{if(!document.hidden&&!busy)refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)refresh();});
}
