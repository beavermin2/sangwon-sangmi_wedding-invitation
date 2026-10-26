import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {withTimeout,createTimedFetch,isServiceUnavailable,loadBackendScript,getBackendClient} from '../previews/test1/backend-resilience.js';
import {validatePhotos,validatePhotoSignature,sendPhoto,MAX_UPLOAD_BYTES} from '../previews/test1/photo-share-core.js';

test('요금/사용량 제한, 과다 요청, 서버 장애, 네트워크 실패를 기능 장애로 판별한다',()=>{
  for(const error of [{status:402},{statusCode:'429'},{status:503},{code:'quota_exceeded'},new Error('Failed to fetch'),new Error('BACKEND_TIMEOUT')])assert.equal(isServiceUnavailable(error),true);
  assert.equal(isServiceUnavailable({code:'23514'}),false);
});
test('끝나지 않는 SDK 작업도 시간 제한 후 종료되며 늦은 실패를 처리한다',async()=>{
  let reject;
  const pending=new Promise((_,r)=>{reject=r;});
  await assert.rejects(withTimeout(pending,5),{code:'BACKEND_TIMEOUT'});
  reject(new Error('late network rejection'));
  await new Promise(resolve=>setImmediate(resolve));
});
test('SDK가 자체 signal을 넘겨도 네트워크 시간 제한이 적용된다',async()=>{
  const original=new AbortController();let passed;
  const fetcher=createTimedFetch(5,(_url,options)=>new Promise((_,reject)=>{
    passed=options.signal;passed.addEventListener('abort',()=>reject(passed.reason),{once:true});
  }));
  await assert.rejects(fetcher('https://example.invalid',{signal:original.signal}),{code:'BACKEND_TIMEOUT'});
  assert.notEqual(passed,original.signal);assert.equal(original.signal.aborted,false);
});
test('SDK 스크립트 로드 실패와 지연을 종료하고 다음 시도에서 다시 로드한다',async()=>{
  const before=globalThis.document,loaded=[];
  globalThis.document={createElement:()=>({remove(){this.removed=true;}}),head:{append(script){loaded.push(script);}}};
  try{
    const failed=loadBackendScript('https://example.invalid/sdk.js',20);loaded[0].onerror();await assert.rejects(failed,/BACKEND_SCRIPT_UNAVAILABLE/);
    const retry=loadBackendScript('https://example.invalid/sdk.js',20);assert.equal(loaded.length,2);loaded[1].onload();await retry;
    await assert.rejects(loadBackendScript('https://example.invalid/slow.js',5),{code:'BACKEND_TIMEOUT'});assert.equal(loaded[2].removed,true);
  }finally{globalThis.document=before;}
});
test('방명록과 사진 공유는 동일한 인증 클라이언트를 재사용한다',async()=>{
  const before=globalThis.window;let count=0;
  globalThis.window={supabase:{createClient(){count++;return {test:true};}}};
  try{
    const config={projectUrl:'https://shared-client-test.supabase.co',publishableKey:'sb_publishable_test'};
    const [a,b]=await Promise.all([getBackendClient(config,'sdk.js'),getBackendClient(config,'sdk.js')]);
    assert.equal(a,b);assert.equal(count,1);
  }finally{globalThis.window=before;}
});

const photoSource=(await readFile(new URL('../previews/test1/photo-share.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'https://example.invalid/photo-share.js'");
const guestSource=(await readFile(new URL('../previews/test1/guestbook.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'https://example.invalid/guestbook.js'");
function fixture(source,client){
  const nodes=new Map();
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,hidden:false,disabled:false,value:'',textContent:'',children:[],listeners:{},dataset:{},classList:{add(){},remove(){}},
      addEventListener(type,fn){this.listeners[type]=fn;},removeEventListener(){},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];},
      querySelector(selector){return node(id+' '+selector);},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      remove(){},click(){},focus(){},close(){this.open=false;},showModal(){this.open=true;},reset(){this.wasReset=true;},reportValidity(){return true;}
    });return nodes.get(id);
  }
  const context={window:{PREVIEW_DATA:{guestbook:{projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',table:'wedding_guestbook',bucket:'wedding-guestbook'}}},
    document:{hidden:false,getElementById:node,querySelector:selector=>node(selector.slice(1)),querySelectorAll:()=>[],addEventListener(){},body:node('body'),
      createElement(tag){const element=node('element-'+nodes.size);if(tag==='canvas'){element.getContext=()=>({fillRect(){},drawImage(){}});element.toBlob=cb=>cb(new Blob([new Uint8Array([255,216,255,224])],{type:'image/jpeg'}));}return element;}},
    getBackendClient:async()=>client,loadBackendScript:async()=>{},withTimeout:task=>withTimeout(task,10),isServiceUnavailable,
    validatePhotos,validatePhotoSignature,sendPhoto,MAX_UPLOAD_BYTES,URL,Intl,Date,crypto,Blob,TextDecoder,Uint8Array,
    Image:class{naturalWidth=100;naturalHeight=100;async decode(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},setInterval(){},
    IntersectionObserver:class{observe(){}},setTimeout,clearTimeout,
  };
  vm.runInNewContext(source,context);
  return {node,async settle(){await new Promise(resolve=>setTimeout(resolve,20));},async click(id){return node(id).listeners.click?.();},async submit(id){return node(id).listeners.submit({preventDefault(){}});}};
}
function backend(){
  const state={error:null,uploadError:null,uploaded:false,hangAuth:false};
  const client={
    rpc:async(name)=>{
      if(state.error)return {error:state.error};
      if(name==='wedding_photo_status')return {data:{canUpload:true,mode:'now',storageMode:'compressed',opensAt:'2027-01-30T00:00:00+09:00'}};
      if(name==='reserve_wedding_photo_v2')return {data:'test/photo.jpg'};
      if(name==='finish_wedding_photo')return {data:state.uploaded};
      return {data:[]};
    },
    auth:{getSession:()=>state.hangAuth?new Promise(()=>{}):Promise.resolve({data:{session:{user:{id:'test'}}}})},
    from(){return {select(){return {order(){return this;},range:async()=>state.error?{error:state.error}:{data:[]}};},insert:async()=>state.error?{error:state.error}:{}};},
    storage:{from:()=>({upload:async()=>{if(state.uploadError)return {error:state.uploadError};state.uploaded=true;return {};}})}
  };
  return {state,client};
}
test('사진 상태 조회 402/429/503 실패는 모달을 잠그지 않고 재시도로 복구된다',async()=>{
  for(const status of [402,429,503]){
    const {state,client}=backend();state.error={status,message:'service unavailable'};const ui=fixture(photoSource,client);await ui.settle();
    assert.match(ui.node('photo-share-availability').textContent,/청첩장은 계속/);
    assert.equal(ui.node('photo-share-submit').disabled,true);assert.equal(ui.node('photo-share-retry').hidden,false);
    assert.equal(ui.node('photo-share-dialog [data-close]').disabled,false);
    state.error=null;await ui.click('photo-share-retry');
    assert.match(ui.node('photo-share-availability').textContent,/지금 사진/);assert.equal(ui.node('photo-share-retry').hidden,true);
  }
});
test('사진 전송 직전 조회 실패를 기간 종료로 오인하지 않고 선택 사진과 입력을 보존한다',async()=>{
  const {state,client}=backend(),ui=fixture(photoSource,client);await ui.settle();
  ui.node('photo-share-name').value='하객';ui.node('photo-share-message').value='축하해요';
  ui.node('photo-share-files').files=[new File([new Uint8Array([255,216,255,224])],'photo.jpg',{type:'image/jpeg'})];
  await ui.node('photo-share-files').listeners.change();state.error={status:402,message:'quota exceeded'};
  await ui.submit('photo-share-form');
  assert.match(ui.node('photo-share-status').textContent,/선택한 사진은 유지/);
  assert.doesNotMatch(ui.node('photo-share-status').textContent,/시간입니다/);
  assert.equal(ui.node('photo-share-previews').children.length,1);assert.equal(ui.node('photo-share-message').value,'축하해요');
  assert.equal(ui.node('photo-share-fields').disabled,false);
});
test('사진 업로드 용량 초과 후 재시도 가능하고 완료된 저장을 잘못 표시하지 않는다',async()=>{
  const {state,client}=backend(),ui=fixture(photoSource,client);await ui.settle();
  ui.node('photo-share-name').value='하객';ui.node('photo-share-message').value='사진 설명';
  ui.node('photo-share-files').files=[new File([new Uint8Array([255,216,255,224])],'photo.jpg',{type:'image/jpeg'})];
  await ui.node('photo-share-files').listeners.change();state.uploadError={status:402,message:'quota exceeded'};
  await ui.submit('photo-share-form');assert.equal(ui.node('photo-share-fields').disabled,false);
  assert.equal(ui.node('photo-share-previews').children.length,1);assert.equal(ui.node('photo-share-name').value,'하객');
  assert.doesNotMatch(ui.node('photo-share-status').textContent,/전달했습니다/);
  state.uploadError=null;await ui.submit('photo-share-form');assert.match(ui.node('photo-share-status').textContent,/전달했습니다/);
});
test('방명록 조회/쓰기 장애는 안내와 재시도로 처리하고 작성 내용을 보존한다',async()=>{
  for(const status of [402,429,503]){
    const {state,client}=backend();state.error={status,message:'quota exceeded'};
    const ui=fixture(guestSource,client);await ui.settle();
    assert.match(ui.node('guestbook-status').textContent,/청첩장은 계속/);assert.equal(ui.node('guestbook-retry').hidden,false);
    ui.node('guestbook-name').value='하객';ui.node('guestbook-message').value='축하해요';
    await ui.submit('guestbook-form');assert.equal(ui.node('guestbook-name').value,'하객');assert.equal(ui.node('guestbook-message').value,'축하해요');
    assert.equal(ui.node('guestbook-form').wasReset,undefined);assert.equal(ui.node('guestbook-fields').disabled,false);
    assert.equal(ui.node('guestbook-dialog [data-close]').disabled,false);
    state.error=null;await ui.click('guestbook-retry');assert.equal(ui.node('guestbook-retry').hidden,true);
  }
});
test('Auth 응답이 멈춰도 방명록 작성창을 다시 조작할 수 있다',async()=>{
  const {state,client}=backend();state.hangAuth=true;const ui=fixture(guestSource,client);await ui.settle();
  ui.node('guestbook-name').value='하객';ui.node('guestbook-message').value='유지할 내용';
  await ui.submit('guestbook-form');assert.equal(ui.node('guestbook-fields').disabled,false);
  assert.equal(ui.node('guestbook-message').value,'유지할 내용');assert.match(ui.node('guestbook-form-status').textContent,/청첩장은 계속/);
});
