/* Supabase photo guestbook. Only the publishable key is shipped to the browser. */
(() => {
  'use strict';
  const config=window.PREVIEW_DATA.guestbook;
  const $=selector=>document.querySelector(selector);
  const sdkUrl=new URL('./supabase.js',document.currentScript.src).href;
  const form=$('#guestbook-form'),dialog=$('#guestbook-dialog');
  const status=$('#guestbook-form-status'),submit=$('#guestbook-submit');
  const fields=$('#guestbook-fields'),fileInput=$('#guestbook-file');
  const list=$('#guestbook-list'),listStatus=$('#guestbook-status');
  const track=$('#guestbook-track');
  const loadedEntries=[];
  function renderCards(){
    track.replaceChildren();
    loadedEntries.forEach((entry,index)=>{
      const card=cardFor(entry);
      card.setAttribute('role','group');card.setAttribute('aria-label',(index+1)+' / '+loadedEntries.length);
      track.append(card);
    });
    list.hidden=!loadedEntries.length;
  }
  const allDialog=$('#guestbook-all-dialog'),allList=$('#guestbook-all-list'),allStatus=$('#guestbook-all-status'),allRetry=$('#guestbook-all-retry');
  let allRequest=0;
  async function loadAllEntries(){
    const request=++allRequest;
    allList.replaceChildren();allRetry.hidden=true;allStatus.textContent='방명록을 불러오고 있습니다.';
    try{
      const client=await getClient();const ids=new Set();
      for(let start=0;;start+=100){
        if(request!==allRequest||!allDialog.open)return;
        const {data,error}=await client.from(config.table).select('id,name,message,image_path,created_at')
          .order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+99);
        if(request!==allRequest||!allDialog.open)return;
        if(error)throw error;
        for(const entry of data){if(!ids.has(entry.id)){ids.add(entry.id);allList.append(cardFor(entry));}}
        loadLikes(data.map(entry=>entry.id));
        allStatus.textContent=ids.size?'축하 메시지 '+ids.size+'개':'첫 번째 축하 메시지를 남겨주세요.';
        if(data.length<100)break;
      }
    }catch{if(request===allRequest&&allDialog.open){allStatus.textContent='방명록을 모두 불러오지 못했습니다. 다시 시도해 주세요.';allRetry.hidden=false;}}
  }
  $('#guestbook-all').addEventListener('click',loadAllEntries);
  allRetry.addEventListener('click',loadAllEntries);
  allDialog.addEventListener('close',()=>{allRequest++;});
  const draftKey='wedding-guestbook-draft:'+new URL(config.projectUrl).hostname;
  let clientPromise,loading=false,offset=0,submitting=false,converting=false;
  let selectedBlob=null,previewUrl=null,uploadedPath=null,captchaToken='',captchaId=null;
  let photoRequest=0,selectionVersion=0;
  const shownIds=new Set();
  const pageSize=6;
  const likeStates=new Map();
  let likeRevision=0,likeAuthPromise=null;
  const heartIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function likeState(id){
    if(!likeStates.has(id))likeStates.set(id,{count:null,liked:false,busy:false,error:''});
    return likeStates.get(id);
  }
  function paintLikes(id){
    const state=likeState(id);
    document.querySelectorAll('.guestbook-like').forEach(button=>{
      if(button.dataset.entryId!==id)return;
      button.disabled=state.busy;
      button.setAttribute('aria-pressed',String(state.liked));
      button.setAttribute('aria-label',(state.liked?'좋아요 취소':'좋아요')+(state.count===null?'':', '+state.count+'개'));
      button.querySelector('span').textContent=state.count===null?'—':String(state.count);
      const hint=button.parentElement.querySelector('.guestbook-like-error');
      hint.textContent=state.error;hint.hidden=!state.error;
    });
  }
  async function loadLikes(ids){
    if(!ids.length)return;
    const revision=likeRevision;
    try{
      const client=await getClient();
      const {data,error}=await client.rpc('guestbook_like_stats',{entry_ids:ids});
      if(error)throw error;
      if(revision!==likeRevision)return;
      for(const row of data){const state=likeState(row.guestbook_id);if(!state.busy){state.count=Number(row.like_count);state.liked=row.liked;state.error='';paintLikes(row.guestbook_id);}}
    }catch{
      if(revision!==likeRevision)return;
      for(const id of ids){const state=likeState(id);if(state.count===null&&!state.busy){state.error='좋아요를 불러오지 못했습니다. 하트를 눌러 다시 시도해 주세요.';paintLikes(id);}}
    }
  }
  async function likeCaptcha(){
    if(!config.turnstileSiteKey)return '';
    const challenge=$('#guestbook-like-challenge'),hint=$('#guestbook-like-challenge-status');
    if(!window.turnstile)await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    return new Promise((resolve,reject)=>{
      let widget,settled=false;
      function finish(error,token){
        if(settled)return;settled=true;
        challenge.removeEventListener('close',cancel);
        if(widget!==undefined)window.turnstile.remove(widget);
        challenge.close();
        if(allDialog.open)document.body.classList.add('modal-open');
        error?reject(error):resolve(token);
      }
      const cancel=()=>finish(userError('좋아요 확인을 취소했습니다.'));
      challenge.addEventListener('close',cancel);
      challenge.showModal();document.body.classList.add('modal-open');hint.textContent='자동 등록 방지 확인을 완료해 주세요.';
      try{widget=window.turnstile.render('#guestbook-like-captcha',{sitekey:config.turnstileSiteKey,size:'flexible',callback:token=>finish(null,token),'expired-callback':()=>{hint.textContent='확인 시간이 지났습니다. 다시 확인해 주세요.';},'error-callback':()=>{hint.textContent='확인을 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.';}});}
      catch(error){finish(error);}
    });
  }
  async function likeSession(client){
    if(!likeAuthPromise)likeAuthPromise=(async()=>{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(data.session)return;
      const token=await likeCaptcha();
      const result=await client.auth.signInAnonymously(token?{options:{captchaToken:token}}:{});
      if(result.error)throw result.error;
    })().finally(()=>{likeAuthPromise=null;});
    return likeAuthPromise;
  }
  async function setLike(id){
    const state=likeState(id);if(state.busy)return;
    state.busy=true;state.error='';likeRevision++;paintLikes(id);
    try{
      const client=await getClient();
      if(state.count===null){
        const {data,error}=await client.rpc('guestbook_like_stats',{entry_ids:[id]});
        if(error||!data?.length)throw userError('좋아요를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.');
        state.count=Number(data[0].like_count);state.liked=data[0].liked;
      }
      await likeSession(client);
      const desired=state.retryTarget??!state.liked;
      state.retryTarget=desired;
      const {data,error}=await client.rpc('set_guestbook_like',{entry_id:id,should_like:desired});
      if(error)throw error;
      if(!data?.length)throw new Error('Missing like result');
      state.count=Number(data[0].like_count);state.liked=data[0].liked;delete state.retryTarget;
    }catch(error){state.error=error?.code==='P0002'?'숨겨지거나 삭제된 글입니다.':errorMessage(error);}
    finally{state.busy=false;likeRevision++;paintLikes(id);}
  }

  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('network'));document.head.append(s);});}
  async function timedFetch(input,options={}){
    const controller=new AbortController();
    const abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    const timer=setTimeout(abort,20000);
    try{return await fetch(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  }
  function getClient(){
    if(!clientPromise)clientPromise=(async()=>{
      if(!window.supabase)await loadScript(sdkUrl);
      return window.supabase.createClient(config.projectUrl,config.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'wedding-'+new URL(config.projectUrl).hostname},
        global:{fetch:timedFetch}
      });
    })().catch(error=>{clientPromise=null;throw error;});
    return clientPromise;
  }
  function setMessage(text){status.textContent=text;}
  function syncDisabled(){
    fields.disabled=submitting;
    submit.disabled=submitting||converting;
    fileInput.disabled=submitting||!!uploadedPath;
    $('#guestbook-remove-photo').disabled=submitting||!!uploadedPath;
    dialog.querySelector('[data-close]').disabled=submitting;
  }
  function readDraft(){try{return JSON.parse(localStorage.getItem(draftKey)||'null');}catch{return null;}}
  function saveDraft(userId,attemptedDigest){
    const previous=readDraft();
    try{localStorage.setItem(draftKey,JSON.stringify({userId,imagePath:uploadedPath,attemptedDigest:attemptedDigest||(previous?.userId===userId?previous.attemptedDigest:null),name:$('#guestbook-name').value,message:$('#guestbook-message').value}));}catch{}
  }
  function clearPreview(){
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=null;selectedBlob=null;fileInput.value='';
    $('#guestbook-preview').removeAttribute('src');$('#guestbook-preview-wrap').hidden=true;
  }
  function errorMessage(error){
    const code=String(error?.code||''),message=String(error?.message||'').toLowerCase();
    if(code==='23505')return '이 브라우저에서 이미 메시지를 남기셨습니다. 수정·삭제는 신랑·신부에게 요청해 주세요.';
    if(code==='anonymous_provider_disabled'||message.includes('anonymous sign-ins are disabled'))return '아직 방명록 작성 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.';
    if(message.includes('captcha'))return '자동 등록 방지 확인이 필요합니다. 확인 후 다시 시도해 주세요.';
    if(code==='over_request_rate_limit'||Number(error?.status)===429)return '요청이 많아 잠시 쉬고 있습니다. 잠시 후 다시 시도해 주세요.';
    if(code==='42501'||message.includes('row-level security')||message.includes('permission denied'))return '저장 권한을 확인하지 못했습니다. 신랑·신부에게 문의해 주세요.';
    if(code==='23514')return '이름과 메시지 길이, 첨부 사진을 다시 확인해 주세요.';
    if(error?.userMessage)return error.userMessage;
    return '연결이 원활하지 않습니다. 작성 내용은 유지되니 잠시 후 다시 시도해 주세요.';
  }
  function userError(message){return Object.assign(new Error(message),{userMessage:message});}

  async function signedPhoto(path){
    const client=await getClient();
    const {data,error}=await client.storage.from(config.bucket).createSignedUrl(path,300);
    if(error)throw error;
    const url=new URL(data.signedUrl);
    if(url.origin!==new URL(config.projectUrl).origin)throw new Error('Unexpected photo origin');
    return url.href;
  }
  async function showGuestPhoto(entry){
    const request=++photoRequest;
    const viewer=$('#guestbook-photo-dialog'),image=$('#guestbook-photo-full'),message=$('#guestbook-photo-status');
    image.hidden=true;image.removeAttribute('src');message.hidden=false;message.textContent='사진을 불러오고 있습니다.';
    viewer.showModal();document.body.classList.add('modal-open');
    try{
      const url=await signedPhoto(entry.image_path);
      if(request!==photoRequest||!viewer.open)return;
      image.src=url;image.alt=entry.name+' 님이 남긴 사진';await image.decode();
      if(request!==photoRequest||!viewer.open)return;
      image.hidden=false;message.hidden=true;
    }catch{if(request===photoRequest&&viewer.open)message.textContent='사진을 불러올 수 없습니다. 숨겨졌거나 삭제된 사진일 수 있습니다.';}
  }
  $('#guestbook-photo-dialog').addEventListener('close',()=>{photoRequest++;$('#guestbook-photo-full').removeAttribute('src');if(allDialog.open)document.body.classList.add('modal-open');});

  function cardFor(entry){
    const card=document.createElement('article');card.className='guestbook-card'+(entry.image_path?'':' guestbook-card-text');
    if(entry.image_path){
      const button=document.createElement('button');button.type='button';button.className='guestbook-card-photo';button.setAttribute('aria-label',entry.name+' 님의 사진 크게 보기');
      const hint=document.createElement('span');hint.className='guestbook-image-error';hint.textContent='사진 불러오는 중';
      button.append(hint);card.append(button);button.addEventListener('click',()=>showGuestPhoto(entry));
      (async()=>{try{
        const image=document.createElement('img');image.alt=entry.name+' 님의 첨부 사진';image.loading='lazy';
        let refreshed=false;
        image.addEventListener('error',async()=>{
          if(!refreshed){refreshed=true;try{image.src=await signedPhoto(entry.image_path);return;}catch{}}
          hint.textContent='사진을 불러올 수 없습니다';button.replaceChildren(hint);
        });
        image.src=await signedPhoto(entry.image_path);button.replaceChildren(image);
      }catch{hint.textContent='사진을 불러올 수 없습니다';}})();
    }
    const message=document.createElement('p');message.textContent=entry.message;
    const footer=document.createElement('div');footer.className='guestbook-card-footer';
    const name=document.createElement('strong');name.textContent='— '+entry.name;
    const time=document.createElement('time');const date=new Date(entry.created_at);
    if(!Number.isNaN(date.getTime())){time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
    const reactions=document.createElement('div');reactions.className='guestbook-reactions';
    const like=document.createElement('button');like.type='button';like.className='guestbook-like';like.dataset.entryId=entry.id;
    const state=likeState(entry.id);like.innerHTML=heartIcon+'<span></span>';like.querySelector('span').textContent=state.count===null?'—':String(state.count);
    like.setAttribute('aria-pressed',String(state.liked));like.setAttribute('aria-label',(state.liked?'좋아요 취소':'좋아요')+(state.count===null?'':', '+state.count+'개'));like.disabled=state.busy;
    const hint=document.createElement('small');hint.className='guestbook-like-error';hint.setAttribute('role','status');hint.hidden=!state.error;hint.textContent=state.error;
    like.addEventListener('click',()=>setLike(entry.id));reactions.append(like,hint);
    footer.append(name,time);card.append(message,footer,reactions);return card;
  }
  async function loadEntries(reset=false){
    if(loading)return;
    loading=true;
    listStatus.textContent='축하 메시지를 불러오고 있습니다.';
    const start=reset?0:offset;
    try{
      const client=await getClient();
      const {data,error}=await client.from(config.table).select('id,name,message,image_path,created_at')
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+pageSize-1);
      if(error)throw error;
      if(reset){loadedEntries.length=0;shownIds.clear();}
      for(const entry of data){if(!shownIds.has(entry.id)){shownIds.add(entry.id);loadedEntries.push(entry);}}
      offset=start+data.length;
      renderCards();
      loadLikes(data.map(entry=>entry.id));
      listStatus.textContent=shownIds.size?'':'첫 번째 축하 메시지를 남겨주세요.';
    }catch{listStatus.textContent='메시지를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';}
    finally{loading=false;}
  }
  new IntersectionObserver((entries,observer)=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();loadEntries(true);}},{rootMargin:'300px'}).observe($('#guestbook'));

  async function prepareCaptcha(){
    if(!config.turnstileSiteKey||captchaId!==null)return;
    if(!window.turnstile)await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    captchaId=window.turnstile.render('#guestbook-captcha',{
      sitekey:config.turnstileSiteKey,size:'flexible',
      callback:token=>{captchaToken=token;},
      'expired-callback':()=>{captchaToken='';},
      'error-callback':()=>{captchaToken='';setMessage('자동 등록 방지 확인을 불러오지 못했습니다. 다시 시도해 주세요.');}
    });
  }
  $('#guestbook-open').addEventListener('click',async()=>{
    try{
      const client=await getClient();const {data,error}=await client.auth.getSession();if(error)throw error;
      const draft=readDraft();
      if(draft&&data.session?.user.id===draft.userId){
        if(!$('#guestbook-name').value)$('#guestbook-name').value=draft.name||'';
        if(!$('#guestbook-message').value)$('#guestbook-message').value=draft.message||'';
        uploadedPath=draft.imagePath||null;
        if(uploadedPath)setMessage('사진은 이미 전송되었습니다. 메시지 등록을 마무리해 주세요.');
      }
      syncDisabled();$('#guestbook-length').textContent=$('#guestbook-message').value.length+' / 1000';
      if(!data.session)await prepareCaptcha();
    }catch(error){setMessage(errorMessage(error));}
  });
  $('#guestbook-message').addEventListener('input',()=>{$('#guestbook-length').textContent=$('#guestbook-message').value.length+' / 1000';});

  async function convertPhoto(file){
    if(!file)return null;
    if(file.size>25*1024*1024)throw userError('25MB 이하의 사진을 선택해 주세요.');
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))throw userError('JPG, PNG, WebP 사진을 선택해 주세요.');
    const url=URL.createObjectURL(file),image=new Image();
    try{image.src=url;await image.decode();}
    catch{throw userError('이 사진 형식을 읽을 수 없습니다. JPG 또는 PNG로 변환해 다시 선택해 주세요.');}
    finally{URL.revokeObjectURL(url);}
    if(!image.naturalWidth||!image.naturalHeight)throw userError('사진을 읽을 수 없습니다.');
    const canvas=document.createElement('canvas');const context=canvas.getContext('2d');
    for(const maxSide of [1280,1024,800,640]){
      const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      context.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.65,.48]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if(!blob||blob.type!=='image/webp')throw userError('이 브라우저에서 사진 변환을 지원하지 않습니다. 최신 브라우저로 다시 시도해 주세요.');
        if(blob.size<=512000)return blob;
      }
    }
    throw userError('사진 용량을 충분히 줄이지 못했습니다. 다른 사진을 선택해 주세요.');
  }
  fileInput.addEventListener('change',async()=>{
    const version=++selectionVersion,file=fileInput.files[0];
    if(uploadedPath)return;
    if(!file){clearPreview();return;}
    converting=true;syncDisabled();setMessage('사진을 준비하고 있습니다.');
    try{
      const blob=await convertPhoto(file);if(version!==selectionVersion)return;
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      selectedBlob=blob;previewUrl=URL.createObjectURL(blob);$('#guestbook-preview').src=previewUrl;$('#guestbook-preview-wrap').hidden=false;
      setMessage('사진 준비 완료 · '+Math.ceil(blob.size/1024)+'KB');
    }catch(error){if(version===selectionVersion){clearPreview();setMessage(errorMessage(error));}}
    finally{if(version===selectionVersion){converting=false;syncDisabled();}}
  });
  $('#guestbook-remove-photo').addEventListener('click',()=>{if(uploadedPath)return;selectionVersion++;converting=false;clearPreview();setMessage('');syncDisabled();});

  dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  // The shared dialog handler closes backdrop clicks; prevent that during a save.
  dialog.addEventListener('click',event=>{if(submitting&&event.target===dialog)event.stopImmediatePropagation();},true);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submitting||converting||!form.reportValidity())return;
    const name=$('#guestbook-name').value.trim(),message=$('#guestbook-message').value.trim();
    if(!name||!message){setMessage('이름과 축하 메시지를 입력해 주세요.');return;}
    submitting=true;syncDisabled();setMessage('메시지를 저장하고 있습니다.');
    let saved=false;
    try{
      const client=await getClient();let {data,error}=await client.auth.getSession();if(error)throw error;
      let user=data.session?.user;
      if(!user){
        if(config.turnstileSiteKey&&!captchaToken)throw userError('자동 등록 방지 확인을 먼저 완료해 주세요.');
        const result=await client.auth.signInAnonymously(config.turnstileSiteKey?{options:{captchaToken}}:{});
        if(result.error)throw result.error;user=result.data.user;
      }
      const previous=readDraft();
      if(previous&&previous.userId!==user.id)uploadedPath=null;
      if(previous?.userId===user.id&&previous.imagePath)uploadedPath=previous.imagePath;
      if(!uploadedPath&&selectedBlob){
        const path=user.id+'/photo.webp';
        const hash=await crypto.subtle.digest('SHA-256',await selectedBlob.arrayBuffer());
        const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
        const retryDigest=previous?.userId===user.id?previous.attemptedDigest:null;
        if(retryDigest&&retryDigest!==digest)throw userError('앞서 전송을 시도한 사진이 있습니다. 같은 사진을 다시 선택하거나 사진을 빼고 메시지만 등록해 주세요.');
        saveDraft(user.id,digest);
        setMessage('사진을 저장하고 있습니다.');
        const result=await client.storage.from(config.bucket).upload(path,selectedBlob,{contentType:'image/webp',upsert:false});
        const duplicate=String(result.error?.statusCode)==='409'||/already exists|duplicate/i.test(result.error?.message||'');
        // Reuse an immutable upload only when retrying the same file.
        if(result.error&&!(duplicate&&retryDigest===digest))throw result.error;
        uploadedPath=path;saveDraft(user.id);
      }
      saveDraft(user.id);syncDisabled();setMessage('메시지를 등록하고 있습니다.');
      const result=await client.from(config.table).insert({name,message,image_path:uploadedPath});
      if(result.error)throw result.error;
      saved=true;
      try{localStorage.removeItem(draftKey);}catch{}
      uploadedPath=null;clearPreview();form.reset();$('#guestbook-length').textContent='0 / 1000';
      setMessage('축하 메시지가 등록되었습니다. 감사합니다.');
    }catch(error){
      setMessage(errorMessage(error)+(uploadedPath&&error?.code!=='23505'?'\n사진은 보관되어 있습니다. 메시지만 다시 등록해 주세요.':''));
      if(captchaId!==null){window.turnstile.reset(captchaId);captchaToken='';}
    }finally{submitting=false;syncDisabled();}
    if(saved){dialog.close();listStatus.textContent='축하 메시지가 등록되었습니다. 감사합니다.';await loadEntries(true);}
  });
})();
