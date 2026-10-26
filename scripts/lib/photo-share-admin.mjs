import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function photoDashboardBase(projectUrl){
  const ref=new URL(projectUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];
  return ref?'https://supabase.com/dashboard/project/'+ref+'/storage/files/buckets/':null;
}

export async function photoShareAdmin(root, mode, storageMode) {
  const config=JSON.parse(await readFile(join(root,'previews/test1/guestbook-config.json'),'utf8'));
  let rpc='wedding_photo_status',body={};
  if(mode!==undefined){
    if(!['now','ceremony','closed'].includes(mode))throw new Error('업로드 시작 설정을 확인해 주세요.');
    if(!['compressed','original'].includes(storageMode))throw new Error('사진 저장 방식을 선택해 주세요.');
    let credentials;
    try{credentials=JSON.parse(await readFile(join(root,'.work/photo-share-admin.json'),'utf8'));}
    catch{throw new Error('사진 공유 관리자 연결 파일이 없습니다. 이 PC에서 저장소 연결을 먼저 완료해 주세요.');}
    const wedding=JSON.parse(await readFile(join(root,'data/wedding.json'),'utf8'));
    rpc='set_wedding_photo_settings';body={admin_secret:credentials.secret,new_mode:mode,start_at:wedding.ceremony.datetime.slice(0,10)+'T00:00:00+09:00',new_storage_mode:storageMode};
  }
  const response=await fetch(config.projectUrl+'/rest/v1/rpc/'+rpc,{
    method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('사진 저장소 설정을 확인하지 못했습니다. 관리자 연결 상태를 확인해 주세요.');
  return {...await response.json(),dashboardBase:photoDashboardBase(config.projectUrl)};
}
