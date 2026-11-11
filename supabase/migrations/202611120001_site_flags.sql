-- Switches for the website, turned on and off in the Supabase dashboard without a deploy:
--   Table editor › site_flags › tick or untick `enabled`, or
--   update public.site_flags set enabled=true where name='android_app_loading';
-- The site reads a switch when a page loads (app/flags.ts), so a change shows on the next page load. A switch the site
-- can't read (this migration not applied, the row missing, the request failing) counts as off.
-- Everyone can read the switches: they only say which optional parts of the page are on. Only the dashboard writes them.
create table public.site_flags(
 name text primary key check(name ~ '^[a-z][a-z0-9_]{1,39}$'),
 enabled boolean not null default false,
 note text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.site_flags enable row level security;
revoke all on public.site_flags from public, anon, authenticated;
grant select on public.site_flags to anon, authenticated;
create policy site_flags_read on public.site_flags for select to anon, authenticated using (true);

-- `updated_at` says when a switch was last changed.
create function public.site_flags_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end;$$;
revoke all on function public.site_flags_touch() from public, anon, authenticated;
create trigger site_flags_touch before update on public.site_flags for each row execute function public.site_flags_touch();

-- The first switch, off: the loading card's link to the Android app (app/play.ts appAudience says who can see it).
insert into public.site_flags(name,note) values
 ('android_app_loading','Loading card shows "The Android app works offline" (a link to Google Play) to Android visitors in Africa and most of Asia.');
