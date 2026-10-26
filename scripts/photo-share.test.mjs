import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotos,validatePhotoSignature,sendPhoto,MAX_FILE_BYTES} from '../previews/test1/photo-share-core.js';
import {photoDashboardBase} from './lib/photo-share-admin.mjs';
const file={type:'image/jpeg',size:1000};
test('프로젝트를 바꾸면 관리자 사진 확인 링크도 새 프로젝트로 연결한다',()=>{
  assert.equal(photoDashboardBase('https://new-project-ref.supabase.co'),'https://supabase.com/dashboard/project/new-project-ref/storage/files/buckets/');
  assert.equal(photoDashboardBase('https://photos.example.com'),null);
});
test('사진 수와 크기 및 형식을 제한한다',()=>{
  validatePhotos([file]);validatePhotos(Array(5).fill(file));validatePhotos([{...file,size:MAX_FILE_BYTES}]);
  for(const files of [[],Array(6).fill(file),[{...file,size:MAX_FILE_BYTES+1}],[{type:'text/html',size:5}]])assert.throws(()=>validatePhotos(files));
});
function mock({uncertain=false,failed=false}={}){
  let uploaded=false,reservations=0,uploads=0;
  return {get reservations(){return reservations;},get uploads(){return uploads;},client:{
    rpc:async(name)=>name==='reserve_wedding_photo_v2'?(reservations++,{data:'user/photo.jpg'}):{data:uploaded},
    storage:{from:()=>({upload:async()=>{uploads++;if(failed)return {error:new Error('offline')};uploaded=true;return uncertain?{error:new Error('timeout')}:{};}})}
  }};
}
test('불확실한 업로드 응답도 저장 완료를 확인하고 중복 전송하지 않는다',async()=>{
  const backend=mock({uncertain:true}),entry={id:'test',blob:new Blob(['photo'])};
  await sendPhoto(backend.client,entry,'하객','축하합니다');assert.equal(entry.done,true);
  await sendPhoto(backend.client,entry,'하객','축하합니다');assert.equal(backend.uploads,1);assert.equal(backend.reservations,1);
});
test('실패 후에도 같은 예약 경로를 사용해 다시 보낸다',async()=>{
  const backend=mock({failed:true}),entry={id:'test',blob:new Blob(['photo'])};
  await assert.rejects(sendPhoto(backend.client,entry,'하객',''));
  await assert.rejects(sendPhoto(backend.client,entry,'하객',''));
  assert.equal(backend.reservations,1);assert.equal(backend.uploads,2);assert.equal(entry.done,undefined);
});
test('서버에서 업로드 기간이 닫혀 있으면 파일을 보내지 않는다',async()=>{
  let uploaded=false;
  const client={rpc:async()=>({error:new Error('PHOTO_CLOSED')}),storage:{from:()=>{uploaded=true;}}};
  await assert.rejects(sendPhoto(client,{id:'test',blob:new Blob(['photo'],{type:'image/jpeg'})},'하객',''),/PHOTO_CLOSED/);assert.equal(uploaded,false);
});
test('원본 PNG의 바이트와 형식을 그대로 전송한다',async()=>{
  const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])],'original.png',{type:'image/png'});
  const entry={id:'original',file,blob:file,storageMode:'original'};let uploaded=false;
  const client={rpc:async(name,args)=>{
    if(name==='reserve_wedding_photo_v2'){
      assert.equal(args.photo_mode,'original');assert.equal(args.photo_type,'image/png');assert.equal(args.photo_name,'original.png');return {data:'user/original.png'};
    }
    return {data:uploaded};
  },storage:{from:(bucket)=>{assert.equal(bucket,'wedding-original-photos');return {upload:async(path,blob,options)=>{
    assert.equal(path,'user/original.png');assert.equal(blob,file);assert.equal(options.contentType,'image/png');uploaded=true;return {};
  }};}}};
  await sendPhoto(client,entry,'점검','');assert.equal(entry.done,true);
});
test('이미지로 위장한 문서와 동영상 헤더를 거부한다',async()=>{
  for(const type of ['image/jpeg','image/png','image/webp','image/heic'])await assert.rejects(validatePhotoSignature(new Blob(['not an image'],{type})));
  await assert.rejects(validatePhotoSignature(new Blob(['0000ftypisom00000000'],{type:'image/heic'})));
  await validatePhotoSignature(new Blob([new Uint8Array([255,216,255,224])],{type:'image/jpeg'}));
  await validatePhotoSignature(new Blob(['0000ftypheic0000mif1'],{type:'image/heic'}));
});
