// Assemble the complete fresh-project install without publishing the local admin key.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const prepared=spawnSync(process.execPath,[resolve(root,'scripts/prepare-photo-share.mjs')],{cwd:root,stdio:'inherit'});
if(prepared.status!==0)process.exit(prepared.status||1);
const files=['backend/supabase/guestbook.sql','backend/supabase/likes.sql','.work/photo-share-install.sql'];
const parts=[];
for(const file of files)parts.push('-- Source: '+file+'\n'+await readFile(resolve(root,file),'utf8'));
await writeFile(resolve(root,'.work/supabase-install.sql'),parts.join('\n\n')+'\n');
console.log('Prepared .work/supabase-install.sql for a fresh Supabase project. Do not commit .work/.');
