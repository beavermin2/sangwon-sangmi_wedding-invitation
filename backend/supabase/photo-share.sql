-- Dedicated private photo inbox. Replace __ADMIN_HASH__ before initial installation.
begin;
create table if not exists public.wedding_photo_settings (
  id boolean primary key default true check(id),
  mode text not null check(mode in ('now','ceremony','closed')),
  opens_at timestamptz not null
);
create table if not exists public.wedding_photo_admin (
  id boolean primary key default true check(id), secret_hash text not null
);
create table if not exists public.wedding_shared_photos (
  id uuid primary key, user_id uuid not null references auth.users(id),
  sender text not null check(char_length(sender) between 1 and 30),
  message text not null default '' check(char_length(message)<=300),
  object_path text not null unique, created_at timestamptz not null default now(),
  uploaded_at timestamptz
);
alter table public.wedding_photo_settings enable row level security;
alter table public.wedding_photo_admin enable row level security;
alter table public.wedding_shared_photos enable row level security;
revoke all on public.wedding_photo_settings, public.wedding_photo_admin, public.wedding_shared_photos from public, anon, authenticated;
insert into public.wedding_photo_settings(id,mode,opens_at) values(true,'now','2027-01-30T00:00:00+09:00') on conflict do nothing;
insert into public.wedding_photo_admin values(true,'__ADMIN_HASH__') on conflict do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wedding-shared-photos','wedding-shared-photos',false,2097152,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];

create or replace function public.wedding_photo_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode',mode,'opensAt',opens_at,'canUpload',mode='now' or(mode='ceremony' and now()>=opens_at))
 from public.wedding_photo_settings where id=true;
$$;
create or replace function public.set_wedding_photo_mode(admin_secret text,new_mode text,start_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wedding_photo_admin where secret_hash=encode(sha256(convert_to(admin_secret,'UTF8')),'hex')) then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if new_mode not in ('now','ceremony','closed') or start_at is null then raise exception 'Invalid settings'; end if;
 update public.wedding_photo_settings set mode=new_mode,opens_at=start_at where id=true;
 return public.wedding_photo_status();
end;
$$;
create or replace function public.reserve_wedding_photo(request_id uuid,sender_name text,photo_message text default '') returns text
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); result text;
begin
 if viewer is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not coalesce((public.wedding_photo_status()->>'canUpload')::boolean,false) then raise exception 'PHOTO_CLOSED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(viewer::text,0));
 select object_path into result from public.wedding_shared_photos where id=request_id and user_id=viewer;
 if result is not null then return result; end if;
 if (select count(*) from public.wedding_shared_photos where user_id=viewer)>=50 then raise exception 'PHOTO_LIMIT'; end if;
 result:=viewer::text||'/'||request_id::text||'.jpg';
 insert into public.wedding_shared_photos(id,user_id,sender,message,object_path)
 values(request_id,viewer,trim(sender_name),trim(coalesce(photo_message,'')),result);
 return result;
end;
$$;
create or replace function public.can_upload_wedding_photo(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((public.wedding_photo_status()->>'canUpload')::boolean,false)
 and exists(select 1 from public.wedding_shared_photos where object_path=path and user_id=auth.uid() and uploaded_at is null);
$$;
create or replace function public.finish_wedding_photo(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare photo public.wedding_shared_photos;
begin
 select * into photo from public.wedding_shared_photos where id=request_id and user_id=auth.uid();
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='wedding-shared-photos' and name=photo.object_path) then return false; end if;
 update public.wedding_shared_photos set uploaded_at=coalesce(uploaded_at,now()) where id=request_id;
 return true;
end;
$$;
drop policy if exists "Wedding photo inbox insert" on storage.objects;
create policy "Wedding photo inbox insert" on storage.objects for insert to authenticated
with check(bucket_id='wedding-shared-photos' and public.can_upload_wedding_photo(name));
-- No SELECT, UPDATE or DELETE policies: guests cannot list or download uploaded photos.
revoke all on function public.wedding_photo_status(),public.set_wedding_photo_mode(text,text,timestamptz),public.reserve_wedding_photo(uuid,text,text),public.can_upload_wedding_photo(text),public.finish_wedding_photo(uuid) from public,anon,authenticated;
grant execute on function public.wedding_photo_status() to anon,authenticated;
grant execute on function public.set_wedding_photo_mode(text,text,timestamptz) to anon;
grant execute on function public.reserve_wedding_photo(uuid,text,text),public.can_upload_wedding_photo(text),public.finish_wedding_photo(uuid) to authenticated;
commit;
