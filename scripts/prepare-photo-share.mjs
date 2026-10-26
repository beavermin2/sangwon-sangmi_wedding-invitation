// Prepare a narrowly scoped local admin credential. Never ship .work/ to the website.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),file=resolve(root,'.work/photo-share-admin.json');
await mkdir(resolve(root,'.work'),{recursive:true});
let secret;
try{secret=JSON.parse(await readFile(file,'utf8')).secret;}catch(error){if(error.code!=='ENOENT')throw error;secret=randomBytes(32).toString('hex');await writeFile(file,JSON.stringify({secret})+'\n',{mode:0o600});}
const hash=createHash('sha256').update(secret).digest('hex');
const source=await readFile(resolve(root,'backend/supabase/photo-share.sql'),'utf8');
const storageModeUpgrade=await readFile(resolve(root,'backend/supabase/photo-share-storage-mode.sql'),'utf8');
await writeFile(resolve(root,'.work/photo-share-install.sql'),source.replaceAll('__ADMIN_HASH__',hash)+'\n'+storageModeUpgrade);
console.log('Prepared .work/photo-share-install.sql. Local credential stays in .work/photo-share-admin.json.');
