import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../previews/test1/rsvp-entry.js',import.meta.url),'utf8');
function setup({opening=false,seen=false,sent=false,today=false,deadline='2099-01-01',enabled=true}={}){
  const listeners={},nodes=new Map(),memory=new Map();
  const key='paper-rose-rsvp:https://example.invalid:2099-01-01';
  if(seen)memory.set(key+':entry-seen','1');
  if(sent)memory.set(key,'sent');
  if(today)memory.set(key+':entry-hidden-day',new Date(Date.now()+9*3600000).toISOString().slice(0,10));
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:!opening,open:false,listeners:{},clicks:0,
      addEventListener(type,fn){this.listeners[type]=fn;},show(){this.open=true;},
      close(){this.open=false;this.listeners.close?.();},click(){this.clicks++;this.listeners.click?.();}});
    return nodes.get(id);
  };
  const storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  vm.runInNewContext(source,{window:{PREVIEW_DATA:{date:'2099-01-01',rsvp:{enabled,endpoint:'https://example.invalid',deadline}},sessionStorage:storage,localStorage:storage},document:{getElementById:node,querySelector:()=>null,body:{append(){},classList:{add(){throw new Error('첫 안내는 배경 스크롤을 잠그면 안 된다');}}},addEventListener:(type,fn)=>listeners[type]=fn}});
  return {node,listeners,memory,key};
}
test('첫 접속 안내는 오프닝 종료를 기다리고 작성 버튼으로 기존 입력창을 연다',()=>{
  const s=setup({opening:true});assert.equal(s.node('rsvp-entry').open,false);
  s.listeners['invitation:opening-finished']();assert.equal(s.node('rsvp-entry').open,true);
  s.node('rsvp-entry-write').click();assert.equal(s.node('rsvp-entry').open,false);assert.equal(s.node('rsvp-open').clicks,1);
});
test('오프닝이 없는 접속도 안내 표시, 오늘 보지 않기는 한국 날짜로 저장',()=>{
  const s=setup();assert.equal(s.node('rsvp-entry').open,true);
  s.node('rsvp-entry-later').click();assert.equal(s.node('rsvp-entry').open,false);
  assert.equal(s.memory.get(s.key+':entry-hidden-day'),new Date(Date.now()+9*3600000).toISOString().slice(0,10));
});
test('이전에 안내를 본 방문도 새로고침하면 다시 표시한다',()=>{
  assert.equal(setup({seen:true}).node('rsvp-entry').open,true);
});
test('전달 완료, 오늘 숨김, 마감, 기능 비활성화에는 표시하지 않는다',()=>{
  for(const options of [{sent:true},{today:true},{deadline:'2000-01-01'},{enabled:false}])assert.equal(setup(options).node('rsvp-entry').open,false);
});
