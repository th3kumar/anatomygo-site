-- Search "Ask for it": a search that found nothing, sent on purpose by the visitor so the structure can be added to the
-- model. Kept in the private schema next to website feedback (site_private, from 202610260001_site_feedback.sql), which
-- the public API cannot read; the team reads it in the Supabase dashboard:
--   select query, count(*), max(created_at) from site_private.search_asks group by query order by 2 desc;
create table site_private.search_asks(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 -- The site sends the search cleaned: lowercase letters (any script) and spaces only, at most 40 characters (search-terms.ts searchText).
 query text not null check(char_length(query) between 2 and 40 and query ~ '^[[:alpha:] ]+$'),
 platform text not null check(platform in ('website','phone'))
);
create index search_asks_created on site_private.search_asks(created_at desc);
create index search_asks_query on site_private.search_asks(query);
alter table site_private.search_asks enable row level security;
revoke all on site_private.search_asks from public, anon, authenticated;

-- The only way in. Text that isn't a cleaned search is dropped, not stored. A flood guard caps the whole site at 60 asks a
-- minute, and the same words asked again within ten minutes (a double tap, a retry) are stored once.
create function public.site_search_ask(p_query text,p_platform text)
returns void language plpgsql security definer set search_path='' as $$
declare v_query text := btrim(lower(coalesce(p_query,'')));
begin
 if char_length(v_query) not between 2 and 40 or v_query !~ '^[[:alpha:] ]+$' or p_platform not in ('website','phone') then return; end if;
 if (select count(*) from site_private.search_asks where created_at>now()-interval '1 minute')>=60 then return; end if;
 if exists(select 1 from site_private.search_asks a where a.query=v_query and a.created_at>now()-interval '10 minutes') then return; end if;
 insert into site_private.search_asks(query,platform) values(v_query,p_platform);
end;$$;
revoke all on function public.site_search_ask(text,text) from public,anon,authenticated;
grant execute on function public.site_search_ask(text,text) to anon,authenticated;
