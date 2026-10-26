-- Fresh-project baseline, matched to the live guestbook schema on 2026-10-27.
-- Run before likes.sql. This does not import guest messages or Storage files.
begin;
create table if not exists public.wedding_guestbook (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  name text not null check(char_length(btrim(name)) between 1 and 30),
  message text not null check(char_length(btrim(message)) between 1 and 1000),
  image_path text,
  created_at timestamptz not null default now(),
  is_visible boolean not null default true,
  check(image_path is null or image_path=owner_id::text||'/photo.webp')
);
create index if not exists wedding_guestbook_visible_created_at on public.wedding_guestbook(created_at desc) where is_visible=true;
alter table public.wedding_guestbook enable row level security;
revoke all on public.wedding_guestbook from public,anon,authenticated;
grant select(id,name,message,image_path,created_at) on public.wedding_guestbook to anon,authenticated;
grant insert(name,message,image_path) on public.wedding_guestbook to authenticated;

drop policy if exists "Read visible wedding messages" on public.wedding_guestbook;
create policy "Read visible wedding messages" on public.wedding_guestbook for select to anon,authenticated using(is_visible=true);
drop policy if exists "Write own wedding message" on public.wedding_guestbook;
create policy "Write own wedding message" on public.wedding_guestbook for insert to authenticated with check(owner_id=(select auth.uid()) and is_visible=true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wedding-guestbook','wedding-guestbook',false,512000,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=512000,allowed_mime_types=array['image/webp'];
drop policy if exists "Upload own wedding photo" on storage.objects;
create policy "Upload own wedding photo" on storage.objects for insert to authenticated
with check(bucket_id='wedding-guestbook' and name=(select auth.uid())::text||'/photo.webp');
drop policy if exists "Read photos attached to visible wedding message" on storage.objects;
create policy "Read photos attached to visible wedding message" on storage.objects for select to anon,authenticated
using(bucket_id='wedding-guestbook' and exists(select 1 from public.wedding_guestbook entry where entry.image_path=objects.name));
-- The subquery is subject to guestbook SELECT RLS, so hidden entries do not grant access.
-- No guest UPDATE or DELETE permission on messages or objects.
notify pgrst,'reload schema';
commit;
