-- Supabase SQL Editor에서 전체 실행: 기존 방명록/사진은 변경하지 않습니다.
begin;

create table if not exists public.wedding_guestbook_likes (
  guestbook_id uuid not null references public.wedding_guestbook(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guestbook_id, user_id)
);
alter table public.wedding_guestbook_likes enable row level security;
revoke all on public.wedding_guestbook_likes from public, anon, authenticated;

-- 공개 글의 합계와 현재 사용자의 상태만 공개합니다. 사용자 목록은 노출하지 않습니다.
create or replace function public.guestbook_like_stats(entry_ids uuid[])
returns table (guestbook_id uuid, like_count bigint, liked boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(cardinality(entry_ids), 0) > 100 then
    raise exception 'At most 100 entries per request' using errcode = '22023';
  end if;
  return query
    select w.id, count(l.user_id), coalesce(bool_or(l.user_id = auth.uid()), false)
    from public.wedding_guestbook w
    left join public.wedding_guestbook_likes l on l.guestbook_id = w.id
    where w.is_visible = true and w.id = any(entry_ids)
    group by w.id;
end;
$$;

-- 토글 대신 원하는 상태를 지정하므로 재전송해도 중복 증가하지 않습니다.
create or replace function public.set_guestbook_like(entry_id uuid, should_like boolean)
returns table (guestbook_id uuid, like_count bigint, liked boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if should_like is null then
    raise exception 'Like state required' using errcode = '22023';
  end if;
  -- 글 단위로 직렬화하여 동시 클릭에도 응답 합계를 일관되게 반환합니다.
  perform 1 from public.wedding_guestbook w
    where w.id = entry_id and w.is_visible = true for update;
  if not found then
    raise exception 'Guestbook entry unavailable' using errcode = 'P0002';
  end if;
  if should_like then
    insert into public.wedding_guestbook_likes (guestbook_id, user_id)
      values (entry_id, viewer) on conflict do nothing;
  else
    delete from public.wedding_guestbook_likes l
      where l.guestbook_id = entry_id and l.user_id = viewer;
  end if;
  return query
    select l.guestbook_id, count(*), coalesce(bool_or(l.user_id = viewer), false)
      from public.wedding_guestbook_likes l where l.guestbook_id = entry_id
      group by l.guestbook_id;
  if not found then
    return query select entry_id, 0::bigint, false;
  end if;
end;
$$;

revoke all on function public.guestbook_like_stats(uuid[]) from public, anon, authenticated;
revoke all on function public.set_guestbook_like(uuid, boolean) from public, anon, authenticated;
grant execute on function public.guestbook_like_stats(uuid[]) to anon, authenticated;
grant execute on function public.set_guestbook_like(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
