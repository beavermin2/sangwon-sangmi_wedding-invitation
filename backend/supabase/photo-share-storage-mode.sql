-- Upgrade an existing private photo inbox without changing existing files or access.
begin;
alter table public.wedding_photo_settings add column if not exists storage_mode text not null default 'compressed' check(storage_mode in ('compressed','original'));
alter table public.wedding_shared_photos add column if not exists storage_mode text not null default 'compressed' check(storage_mode in ('compressed','original'));
alter table public.wedding_shared_photos add column if not exists mime_type text not null default 'image/jpeg';
alter table public.wedding_shared_photos add column if not exists original_name text not null default '';
alter table public.wedding_shared_photos add column if not exists bucket_id text not null default 'wedding-shared-photos';
update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/jpeg'] where id='wedding-shared-photos';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wedding-original-photos','wedding-original-photos',false,26214400,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.wedding_photo_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode',mode,'opensAt',opens_at,'canUpload',mode='now' or(mode='ceremony' and now()>=opens_at),'storageMode',storage_mode)
 from public.wedding_photo_settings where id=true;
$$;
create or replace function public.set_wedding_photo_settings(admin_secret text,new_mode text,start_at timestamptz,new_storage_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wedding_photo_admin where secret_hash=encode(sha256(convert_to(admin_secret,'UTF8')),'hex')) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if new_mode is null or new_mode not in ('now','ceremony','closed') or start_at is null
   or new_storage_mode is null or new_storage_mode not in ('compressed','original') then raise exception 'Invalid settings'; end if;
 update public.wedding_photo_settings set mode=new_mode,opens_at=start_at,storage_mode=new_storage_mode where id=true;
 return public.wedding_photo_status();
end;
$$;
create or replace function public.reserve_wedding_photo_v2(request_id uuid,sender_name text,photo_message text,photo_mode text,photo_type text,photo_name text) returns text
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); result text; extension text; current_mode text;
begin
 if viewer is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not coalesce((public.wedding_photo_status()->>'canUpload')::boolean,false) then raise exception 'PHOTO_CLOSED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(viewer::text,0));
 select object_path into result from public.wedding_shared_photos where id=request_id and user_id=viewer;
 if result is not null then return result; end if;
 select storage_mode into current_mode from public.wedding_photo_settings where id=true;
 if photo_mode is distinct from current_mode then raise exception 'PHOTO_SETTINGS_CHANGED'; end if;
 extension:=case photo_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' end;
 if extension is null or (photo_mode='compressed' and photo_type<>'image/jpeg') then raise exception 'Invalid photo type'; end if;
 if (select count(*) from public.wedding_shared_photos where user_id=viewer)>=50 then raise exception 'PHOTO_LIMIT'; end if;
 result:=viewer::text||'/'||request_id::text||'.'||extension;
 insert into public.wedding_shared_photos(id,user_id,sender,message,object_path,storage_mode,mime_type,original_name,bucket_id)
 values(request_id,viewer,trim(sender_name),trim(coalesce(photo_message,'')),result,photo_mode,photo_type,left(coalesce(photo_name,''),255),case photo_mode when 'original' then 'wedding-original-photos' else 'wedding-shared-photos' end);
 return result;
end;
$$;
-- Cached older clients remain compatible with compressed mode only.
create or replace function public.reserve_wedding_photo(request_id uuid,sender_name text,photo_message text default '') returns text
language sql security definer set search_path='' as $$
 select public.reserve_wedding_photo_v2(request_id,sender_name,photo_message,'compressed','image/jpeg','');
$$;
create or replace function public.can_upload_wedding_photo_to_bucket(path text,target_bucket text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.can_upload_wedding_photo(path) and exists(
   select 1 from public.wedding_shared_photos
   where object_path=path and user_id=auth.uid() and bucket_id=target_bucket
 );
$$;
create or replace function public.finish_wedding_photo(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare photo public.wedding_shared_photos;
begin
 select * into photo from public.wedding_shared_photos where id=request_id and user_id=auth.uid();
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id=photo.bucket_id and name=photo.object_path) then return false; end if;
 update public.wedding_shared_photos set uploaded_at=coalesce(uploaded_at,now()) where id=request_id;
 return true;
end;
$$;
drop policy if exists "Wedding photo inbox insert" on storage.objects;
create policy "Wedding photo inbox insert" on storage.objects for insert to authenticated
with check(bucket_id in ('wedding-shared-photos','wedding-original-photos') and public.can_upload_wedding_photo_to_bucket(name,bucket_id));
revoke all on function public.set_wedding_photo_settings(text,text,timestamptz,text),public.reserve_wedding_photo_v2(uuid,text,text,text,text,text),public.can_upload_wedding_photo_to_bucket(text,text) from public,anon,authenticated;
grant execute on function public.set_wedding_photo_settings(text,text,timestamptz,text) to anon;
grant execute on function public.reserve_wedding_photo_v2(uuid,text,text,text,text,text),public.can_upload_wedding_photo_to_bucket(text,text) to authenticated;
commit;
