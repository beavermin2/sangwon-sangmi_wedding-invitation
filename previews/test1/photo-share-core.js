export const MAX_FILES=5,MAX_FILE_BYTES=25*1024*1024,MAX_UPLOAD_BYTES=2*1024*1024;
export function validatePhotos(files){
  if(!files.length)throw new Error('사진을 선택해 주세요.');
  if(files.length>MAX_FILES)throw new Error('한 번에 사진을 5장까지 선택할 수 있어요.');
  for(const file of files){
    if(file.size>MAX_FILE_BYTES)throw new Error('사진 한 장의 크기는 25MB 이하여야 합니다.');
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))throw new Error('JPG, PNG, WebP 또는 휴대폰 사진을 선택해 주세요.');
  }
}
export async function validatePhotoSignature(file){
  const bytes=new Uint8Array(await file.slice(0,64).arrayBuffer()),text=new TextDecoder('ascii').decode(bytes);
  const type=file.type.toLowerCase();
  const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    type==='image/png'?[137,80,78,71,13,10,26,10].every((byte,i)=>bytes[i]===byte):
    type==='image/webp'?text.slice(0,4)==='RIFF'&&text.slice(8,12)==='WEBP':
    /^image\/(heic|heif)$/.test(type)&&text.slice(4,8)==='ftyp'&&/heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8));
  if(!valid)throw new Error('사진 파일 형식을 확인하지 못했습니다. JPG, PNG, WebP 또는 HEIC 사진을 선택해 주세요.');
}
export async function sendPhoto(client,entry,sender,message){
  if(entry.done)return;
  if(!entry.path){
    const result=await client.rpc('reserve_wedding_photo_v2',{request_id:entry.id,sender_name:sender,photo_message:message,photo_mode:entry.storageMode||'compressed',photo_type:entry.blob.type||'image/jpeg',photo_name:entry.file?.name||''});
    if(result.error)throw result.error;
    entry.path=result.data;
  }
  const finish=()=>client.rpc('finish_wedding_photo',{request_id:entry.id});
  let completed=await finish();
  if(completed.error)throw completed.error;
  if(completed.data===true){entry.done=true;return;}
  const bucket=entry.storageMode==='original'?'wedding-original-photos':'wedding-shared-photos';
  const uploaded=await client.storage.from(bucket).upload(entry.path,entry.blob,{contentType:entry.blob.type||'image/jpeg',upsert:false,cacheControl:'3600'});
  // A timed-out request may have reached storage. Confirm before retrying a file.
  completed=await finish();
  if(completed.data===true&&!completed.error){entry.done=true;return;}
  throw uploaded.error||completed.error||new Error('사진 저장 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
}
