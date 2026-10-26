import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../previews/test1/rsvp.js',import.meta.url),'utf8');
function setup({config={},fetchImpl=async()=>({ok:true,json:async()=>({ok:true})}),sent=false}={}){
  const nodes=new Map(),calls=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,value:'',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
    return nodes.get(id);
  };
  const form=node('rsvp-form');
  form.elements=Object.fromEntries(Object.entries({name:' 테스트 하객 ',side:'신랑측',attend:'참석',companions:'2',meal:'식사함',message:'',consent:'on'}).map(([name,value])=>[name,{value,disabled:false,focus(){}}]));
  form.reportValidity=()=>Boolean(form.elements.name.value.trim());
  vm.runInNewContext(source,{
    window:{PREVIEW_DATA:{date:'2099-01-30',rsvp:{enabled:true,endpoint:'https://example.invalid/rsvp',deadline:'2099-01-30',askCompanions:true,askMeal:true,...config}}},
    document:{getElementById:node},
    FormData:class{constructor(form){this.form=form;}get(name){return this.form.elements[name]?.disabled?null:this.form.elements[name]?.value;}},
    sessionStorage:{getItem:()=>sent?'sent':null,setItem:()=>{sent=true;}},
    fetch:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return fetchImpl(url,options);},
    AbortController,setTimeout,clearTimeout,
  });
  return {node,form,calls,submit:()=>form.listeners.submit({preventDefault(){}}),change:()=>form.listeners.change()};
}
test('참석 응답 전송: 공백 정리, 저장 확인 후 완료, 중복 클릭 차단',async()=>{
  let resolve;
  const ui=setup({fetchImpl:()=>new Promise(r=>resolve=r)});
  ui.form.elements.message.value=' 감사합니다 ';
  const pending=ui.submit();
  await ui.submit();
  assert.equal(ui.calls.length,1);
  assert.equal(ui.node('rsvp-submit').disabled,true);
  assert.deepEqual(ui.calls[0].body,{type:'rsvp',name:'테스트 하객',side:'신랑측',attend:'참석',companions:2,meal:'식사함',message:'감사합니다'});
  assert.equal(ui.calls[0].headers['Content-Type'],'text/plain;charset=utf-8');
  resolve({ok:true,json:async()=>({ok:true})});await pending;
  assert.equal(ui.form.hidden,true);
  assert.equal(ui.node('rsvp-success').hidden,false);
  await ui.submit();assert.equal(ui.calls.length,1);
});
test('불참은 동행/식사 입력 자리를 유지하며 비활성화하고 이전 선택을 전송하지 않는다',async()=>{
  const ui=setup();ui.form.elements.attend.value='불참';ui.change();
  assert.equal(ui.node('rsvp-attending').hidden,false);
  assert.equal(ui.form.elements.meal.disabled,true);
  await ui.submit();assert.equal(ui.calls[0].body.companions,0);assert.equal(ui.calls[0].body.meal,'');
});
test('서버 저장 실패 및 네트워크 오류 시 내용을 보존하고 재시도할 수 있다',async()=>{
  for(const fetchImpl of [async()=>({ok:true,json:async()=>({ok:false})}),async()=>{throw new Error('offline');}]){
    const ui=setup({fetchImpl});ui.form.elements.message.value='동행인은 식사하지 않습니다';await ui.submit();
    assert.equal(ui.form.elements.message.value,'동행인은 식사하지 않습니다');
    assert.equal(ui.form.hidden,false);assert.equal(ui.form.elements.name.value,'테스트 하객');assert.equal(ui.form.elements.companions.value,'2');
    assert.equal(ui.node('rsvp-submit').disabled,false);
    assert.match(ui.node('rsvp-status').textContent,/확인하지 못했습니다/);
    await ui.submit();assert.equal(ui.calls.length,2);
  }
});

test('참석 인원은 본인 포함으로 표시하고 저장 시 동행 인원으로 전달한다',async()=>{
  const html=await readFile(new URL('../previews/test1/rsvp.html',import.meta.url),'utf8');
  assert.match(html,/<label[^>]+for="rsvp-message">전하실 말씀<\/label><textarea[^>]+name="message"/);
  assert.match(html,/참석 인원 <small>본인 포함<\/small>/);
  const select=html.match(/<select id="rsvp-companions"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options=[...select.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)];
  assert.equal(options.length,10);
  assert.equal(options.at(-1)[2],'10명 이상');
  for(const [,value,label] of options){
    const total=label==='혼자 참석해요'?1:parseInt(label,10);
    const ui=setup();ui.form.elements.companions.value=value;await ui.submit();
    assert.equal(ui.calls[0].body.companions,total-1);
    assert.equal(ui.calls[0].body.message,value==='9'?'[참석 인원: 본인 포함 10명 이상]\n':'');
  }
});

test('10명 이상 표시와 작성 메시지가 기존 저장 서버에서도 함께 남는다',async()=>{
  const ui=setup();ui.form.elements.companions.value='9';ui.form.elements.message.value=' 총 12명 참석합니다. ';await ui.submit();
  const rows=[];
  const backend=vm.createContext({
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({appendRow:row=>rows.push(row)})})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:()=>({setMimeType(){}})},
    CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{DigestAlgorithm:{MD5:'md5'},computeDigest:()=>[],base64Encode:()=>''},
  });
  vm.runInContext(await readFile(new URL('../backend/apps-script/Code.gs',import.meta.url),'utf8'),backend);
  backend.doPost({postData:{contents:JSON.stringify(ui.calls[0].body)}});
  assert.equal(rows[0][4],9);
  assert.equal(rows[0][6],'[참석 인원: 본인 포함 10명 이상] 총 12명 참석합니다.');
});

test('10명 이상 안내 때문에 메시지가 잘리면 전송 전에 수정을 요청하고 내용을 보존한다',async()=>{
  const ui=setup();ui.form.elements.companions.value='9';ui.form.elements.message.value='가'.repeat(300);await ui.submit();
  assert.equal(ui.calls.length,0);assert.equal(ui.form.elements.message.value.length,300);
  assert.match(ui.node('rsvp-status').textContent,/자 이내/);
  ui.form.elements.attend.value='불참';ui.change();await ui.submit();
  assert.equal(ui.calls[0].body.message,'가'.repeat(300));assert.equal(ui.calls[0].body.companions,0);
});
test('마감, 저장 주소 누락, 빈 성함, 이미 전달한 상태에서는 전송하지 않는다',async()=>{
  for(const config of [{deadline:'2000-01-01'},{endpoint:''}]){
    const ui=setup({config});await ui.submit();assert.equal(ui.calls.length,0);assert.equal(ui.node('rsvp-submit').disabled,true);
  }
  const blank=setup();blank.form.elements.name.value='   ';await blank.submit();assert.equal(blank.calls.length,0);
  const done=setup({sent:true});await done.submit();assert.equal(done.calls.length,0);assert.equal(done.form.hidden,true);
});
