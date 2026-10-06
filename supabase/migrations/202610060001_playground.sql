-- Public Playground. Browser roles only read permitted rows and call bounded RPCs.
create schema if not exists playground_private;
revoke all on schema playground_private from public, anon, authenticated;
create table playground_private.admins (user_id uuid primary key references auth.users(id));
create table playground_private.actions (user_id uuid not null, kind text not null, created_at timestamptz not null default now());
create index on playground_private.actions(user_id, kind, created_at);
create table public.pg_structures (
 id text primary key, name text not null, system text not null, geometry text not null check(length(geometry)=64),
 mesh_digest text not null, triangle_count integer not null check(triangle_count>0),
 invalid_triangles integer[] not null default '{}'
);
create table public.pg_profiles (
 id uuid primary key references auth.users(id), display_name text not null check(length(btrim(display_name)) between 2 and 60)
);
create table public.pg_landmarks (
 id text primary key default gen_random_uuid()::text check(id ~ '^[A-Za-z0-9_-]{1,80}$'),
 mesh_id text not null references public.pg_structures(id), label text not null check(length(btrim(label)) between 1 and 160),
 latin_name text not null default '' check(length(latin_name)<=200), description text not null default '' check(length(description)<=4000),
 published_proposal uuid, archived boolean not null default false, created_at timestamptz not null default now()
);
create index on public.pg_landmarks(mesh_id);
create table public.pg_proposals (
 id uuid primary key default gen_random_uuid(), landmark_id text not null references public.pg_landmarks(id),
 mesh_id text not null references public.pg_structures(id), author_id uuid references public.pg_profiles(id),
 label text not null check(length(btrim(label)) between 1 and 160), latin_name text not null default '' check(length(latin_name)<=200),
 description text not null default '' check(length(description)<=4000),
 geometry text not null, triangle integer not null check(triangle>=0), u double precision not null, v double precision not null,
 status text not null default 'community' check(status in ('community','withdrawn','hidden')),
 supersedes uuid references public.pg_proposals(id), request_id uuid not null, request_body jsonb not null,
 created_at timestamptz not null default now(), unique(author_id, request_id),
 check(u>=0 and u<=1 and v>=0 and v<=1 and u+v<=1)
);
alter table public.pg_landmarks add foreign key(published_proposal) references public.pg_proposals(id);
create index on public.pg_proposals(landmark_id,created_at desc);
create table public.pg_votes (
 proposal_id uuid not null references public.pg_proposals(id), voter_id uuid not null references auth.users(id),
 value smallint not null check(value in (-1,1)), primary key(proposal_id,voter_id)
);
create table public.pg_comments (
 id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.pg_proposals(id),
 author_id uuid not null references public.pg_profiles(id), body text not null check(length(btrim(body)) between 1 and 2000),
 hidden boolean not null default false, request_id uuid not null, created_at timestamptz not null default now(), unique(author_id,request_id)
);
create index on public.pg_comments(proposal_id,created_at);
create table public.pg_reports (
 id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.pg_proposals(id),
 reporter_id uuid not null references auth.users(id), reason text not null check(length(btrim(reason)) between 3 and 1000),
 resolved boolean not null default false, created_at timestamptz not null default now(), unique(proposal_id,reporter_id)
);
create table playground_private.audit (
 id bigint generated always as identity primary key, actor uuid, action text not null, target text not null,
 detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table playground_private.unmapped_imports (id text primary key, bucket_label text not null, state jsonb not null);

create function public.pg_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from playground_private.admins where user_id=auth.uid());
$$;
create function playground_private.require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to contribute' using errcode='42501'; end if;
 return uid;
end; $$;
create function playground_private.rate_limit(kind text, maximum integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user();
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 delete from playground_private.actions a where a.user_id=uid and a.created_at<now()-interval '1 day';
 if (select count(*) from playground_private.actions a where a.user_id=uid and a.kind=rate_limit.kind and a.created_at>now()-interval '1 hour')>=maximum then
 raise exception 'Too many actions. Please try again later.' using errcode='P0001'; end if;
 insert into playground_private.actions(user_id,kind) values(uid,kind);
end; $$;
create function playground_private.validate_anchor() returns trigger language plpgsql set search_path='' as $$
declare s public.pg_structures; l public.pg_landmarks;
begin
 select * into s from public.pg_structures where id=new.mesh_id;
 select * into l from public.pg_landmarks where id=new.landmark_id;
 if s.id is null or l.mesh_id<>new.mesh_id or l.archived or s.geometry<>new.geometry or new.triangle>=s.triangle_count or new.triangle=any(s.invalid_triangles) then
 raise exception 'This placement does not match the current structure geometry'; end if;
 return new;
end; $$;
create trigger validate_anchor before insert on public.pg_proposals for each row execute function playground_private.validate_anchor();

-- No user can promote their own role or modify a canonical pin directly.
do $$ declare t text; begin
 foreach t in array array['pg_structures','pg_profiles','pg_landmarks','pg_proposals','pg_votes','pg_comments','pg_reports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
grant select on public.pg_structures,public.pg_profiles,public.pg_landmarks,public.pg_proposals,public.pg_comments to anon,authenticated;
grant select on public.pg_votes,public.pg_reports to authenticated;
create policy catalogue_read on public.pg_structures for select using(true);
create policy profiles_read on public.pg_profiles for select using(true);
create policy landmarks_read on public.pg_landmarks for select using(not archived or public.pg_is_admin());
create policy proposals_read on public.pg_proposals for select using((status='community' and exists(select 1 from public.pg_landmarks l where l.id=landmark_id and not l.archived)) or public.pg_is_admin());
create policy own_votes on public.pg_votes for select using(voter_id=auth.uid());
create policy comments_read on public.pg_comments for select using((not hidden and exists(select 1 from public.pg_proposals p where p.id=proposal_id and p.status='community')) or public.pg_is_admin());
create policy reports_admin on public.pg_reports for select using(public.pg_is_admin());

create function public.pg_set_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user();
begin
 perform playground_private.rate_limit('profile',20);
 insert into public.pg_profiles(id,display_name) values(uid,btrim(p_name)) on conflict(id) do update set display_name=excluded.display_name;
end; $$;

create function public.pg_submit(p_request uuid,p_landmark text,p_mesh text,p_label text,p_latin text,p_description text,p_geometry text,p_triangle integer,p_u double precision,p_v double precision,p_supersedes uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user(); old public.pg_proposals; lid text := p_landmark; result uuid; body jsonb;
begin
 body:=jsonb_build_array(p_landmark,p_mesh,p_label,p_latin,p_description,p_geometry,p_triangle,p_u,p_v,p_supersedes);
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into old from public.pg_proposals where author_id=uid and request_id=p_request;
 if found then
 if old.request_body<>body then raise exception 'Request was reused with different content'; end if;
 return old.id; end if;
 if not exists(select 1 from public.pg_profiles where id=uid) then raise exception 'Choose a public display name first'; end if;
 perform playground_private.rate_limit('submit',60);
 if p_supersedes is not null and not exists(select 1 from public.pg_proposals where id=p_supersedes and landmark_id=p_landmark and status='community') then raise exception 'The original proposal is no longer available'; end if;
 if lid is null then
 insert into public.pg_landmarks(mesh_id,label,latin_name,description) values(p_mesh,btrim(p_label),btrim(p_latin),btrim(p_description)) returning id into lid;
 end if;
 insert into public.pg_proposals(landmark_id,mesh_id,author_id,label,latin_name,description,geometry,triangle,u,v,request_id,request_body,supersedes)
 values(lid,p_mesh,uid,btrim(p_label),btrim(p_latin),btrim(p_description),p_geometry,p_triangle,p_u,p_v,p_request,body,p_supersedes) returning id into result;
 return result;
end; $$;

create function public.pg_vote(p_proposal uuid,p_value integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user(); p public.pg_proposals;
begin
 select * into p from public.pg_proposals where id=p_proposal and status='community' for share;
 if not found or not exists(select 1 from public.pg_landmarks where id=p.landmark_id and not archived) then raise exception 'Proposal is unavailable'; end if;
 if p.author_id=uid then raise exception 'You cannot vote for your own proposal'; end if;
 if p_value not in (-1,0,1) or p_value is null then raise exception 'Invalid vote'; end if;
 perform playground_private.rate_limit('vote',300);
 if p_value=0 then delete from public.pg_votes where proposal_id=p_proposal and voter_id=uid;
 else insert into public.pg_votes values(p_proposal,uid,p_value) on conflict(proposal_id,voter_id) do update set value=excluded.value; end if;
end; $$;
create function public.pg_vote_totals(p_ids uuid[]) returns table(proposal_id uuid,upvotes bigint,downvotes bigint) language sql stable security definer set search_path='' as $$
 select p.id,count(v.value) filter(where v.value=1),count(v.value) filter(where v.value=-1)
 from public.pg_proposals p left join public.pg_votes v on v.proposal_id=p.id
 join public.pg_landmarks l on l.id=p.landmark_id
 where p.id=any(p_ids[1:500]) and p.status='community' and not l.archived group by p.id;
$$;
create function public.pg_comment(p_proposal uuid,p_body text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user(); existing public.pg_comments; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into existing from public.pg_comments where author_id=uid and request_id=p_request;
 if found then
 if existing.body<>btrim(p_body) or existing.proposal_id<>p_proposal then raise exception 'Request was reused with different content'; end if;
 return existing.id; end if;
 if not exists(select 1 from public.pg_proposals p join public.pg_landmarks l on l.id=p.landmark_id where p.id=p_proposal and p.status='community' and not l.archived) then raise exception 'Proposal is unavailable'; end if;
 perform playground_private.rate_limit('comment',30);
 insert into public.pg_comments(proposal_id,author_id,body,request_id) values(p_proposal,uid,btrim(p_body),p_request) returning id into result;
 return result;
end; $$;
create function public.pg_withdraw(p_proposal uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user(); p public.pg_proposals;
begin
 select * into p from public.pg_proposals where id=p_proposal for update;
 if p.author_id is distinct from uid then raise exception 'Only the contributor can withdraw this proposal' using errcode='42501'; end if;
 perform 1 from public.pg_landmarks where id=p.landmark_id for update;
 if exists(select 1 from public.pg_landmarks where published_proposal=p_proposal) then raise exception 'Published pins need an admin decision. Suggest a correction or report this pin.'; end if;
 update public.pg_proposals set status='withdrawn' where id=p_proposal;
end; $$;
create function public.pg_report(p_proposal uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user();
begin
 if not exists(select 1 from public.pg_proposals where id=p_proposal and status='community') then raise exception 'Proposal is unavailable'; end if;
 perform playground_private.rate_limit('report',20);
 insert into public.pg_reports(proposal_id,reporter_id,reason) values(p_proposal,uid,btrim(p_reason)) on conflict(proposal_id,reporter_id) do update set reason=excluded.reason,resolved=false;
end; $$;

create function public.pg_moderate(p_proposal uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pg_proposals; s public.pg_structures;
begin
 if not public.pg_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select * into p from public.pg_proposals where id=p_proposal for update;
 if not found then raise exception 'Proposal is unavailable'; end if;
 select * into s from public.pg_structures where id=p.mesh_id for update;
 perform 1 from public.pg_landmarks where id=p.landmark_id for update;
 if p_action='approve' then
 if p.status<>'community' or length(btrim(p.description))=0 or p.geometry<>s.geometry or not exists(select 1 from public.pg_landmarks where id=p.landmark_id and mesh_id=p.mesh_id and not archived) then raise exception 'A current placement and biology description are required'; end if;
 if not exists(select 1 from public.pg_landmarks where id=p.landmark_id and published_proposal is not null) and (select count(*) from public.pg_landmarks where mesh_id=p.mesh_id and published_proposal is not null)>=100 then raise exception 'This structure has reached the app pack limit of 100 pins'; end if;
 update public.pg_landmarks set published_proposal=p.id where id=p.landmark_id;
 elsif p_action='unpublish' then
 update public.pg_landmarks set published_proposal=null where published_proposal=p.id;
 elsif p_action='hide' then
 update public.pg_landmarks set published_proposal=null where published_proposal=p.id;
 update public.pg_proposals set status='hidden' where id=p.id;
 else raise exception 'Unknown moderation action'; end if;
 update public.pg_reports set resolved=true where proposal_id=p.id;
 insert into playground_private.audit(actor,action,target) values(auth.uid(),p_action,p.id::text);
end; $$;
create function public.pg_remove_comment(p_comment uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.pg_is_admin() and not exists(select 1 from public.pg_comments where id=p_comment and author_id=auth.uid()) then raise exception 'Permission denied' using errcode='42501'; end if;
 update public.pg_comments set hidden=true where id=p_comment;
end; $$;
create function public.pg_move_landmark(p_landmark text,p_mesh text) returns void language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if not public.pg_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 -- Match proposal -> landmark lock order used by moderation/withdrawal.
 perform 1 from public.pg_proposals where landmark_id=p_landmark order by id for update;
 select mesh_id into previous from public.pg_landmarks where id=p_landmark for update;
 if previous is null or not exists(select 1 from public.pg_structures where id=p_mesh) then raise exception 'Unknown structure or landmark'; end if;
 if previous=p_mesh then return; end if;
 update public.pg_landmarks set mesh_id=p_mesh,published_proposal=null where id=p_landmark;
 update public.pg_proposals set status='hidden' where landmark_id=p_landmark;
 insert into playground_private.audit(actor,action,target,detail) values(auth.uid(),'move',p_landmark,jsonb_build_object('from',previous,'to',p_mesh));
end; $$;

-- Approved content alone, with no contributor identity or engineering notes.
create function public.pg_published_pack(p_mesh text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema',1,'meshId',s.id,'label',s.name,'geometry',s.geometry,'pins',coalesce((
 select jsonb_agg(jsonb_build_object('id',l.id,'label',p.label,'latinName',p.latin_name,'description',p.description,'anchor',jsonb_build_object('triangle',p.triangle,'u',p.u,'v',p.v)) order by l.id)
 from public.pg_landmarks l join public.pg_proposals p on p.id=l.published_proposal
 where l.mesh_id=s.id and not l.archived and p.status='community' and p.geometry=s.geometry and p.mesh_id=s.id),'[]'::jsonb))
 from public.pg_structures s where s.id=p_mesh;
$$;
-- Revoke implicit PUBLIC function execution, then explicitly allow the API.
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pg\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
grant execute on function public.pg_is_admin(),public.pg_vote_totals(uuid[]),public.pg_published_pack(text) to anon;
revoke all on all functions in schema playground_private from public,anon,authenticated;

create function public.pg_admin_queue(p_sort text default 'new',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.pg_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
 select p.id,p.landmark_id,p.mesh_id,p.label,p.description,p.created_at,s.name structure,
 (l.published_proposal=p.id) published,
 (select count(*) from public.pg_votes v where v.proposal_id=p.id and value=1) upvotes,
 (select count(*) from public.pg_votes v where v.proposal_id=p.id and value=-1) downvotes,
 (select count(*) from public.pg_reports r where r.proposal_id=p.id and not resolved) reports
 from public.pg_proposals p join public.pg_landmarks l on l.id=p.landmark_id join public.pg_structures s on s.id=p.mesh_id
 where p.status='community' and not l.archived
 order by case when p_sort='supported' then (select coalesce(sum(value),0) from public.pg_votes where proposal_id=p.id) else 0 end desc,
 case when p_sort='reported' then (select count(*) from public.pg_reports where proposal_id=p.id and not resolved) else 0 end desc,p.created_at desc,p.id
 limit 50 offset greatest(0,least(p_offset,100000))) q);
end; $$;
create function public.pg_unmapped() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.pg_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
 select u.bucket_label,count(*) remaining from playground_private.unmapped_imports u
 where not exists(select 1 from public.pg_landmarks l where l.id=u.id)
 and coalesce((u.state->>'archived')::integer,0)=0 and u.state->>'merged_into' is null
 group by u.bucket_label order by u.bucket_label) q);
end; $$;
create function public.pg_map_import(p_bucket text,p_mesh text) returns integer language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 if not public.pg_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.pg_structures where id=p_mesh) then raise exception 'Unknown structure'; end if;
 insert into public.pg_landmarks(id,mesh_id,label,latin_name,description)
 select u.id,p_mesh,u.state->>'label',coalesce(u.state->>'latin_name',''),coalesce(u.state->>'description','')
 from playground_private.unmapped_imports u where u.bucket_label=p_bucket
 and coalesce((u.state->>'archived')::integer,0)=0 and u.state->>'merged_into' is null
 on conflict(id) do nothing;
 get diagnostics total=row_count;
 insert into playground_private.audit(actor,action,target,detail) values(auth.uid(),'map_import',p_bucket,jsonb_build_object('mesh',p_mesh,'count',total));
 return total;
end; $$;
revoke all on function public.pg_admin_queue(text,integer),public.pg_unmapped(),public.pg_map_import(text,text) from public,anon;
grant execute on function public.pg_admin_queue(text,integer),public.pg_unmapped(),public.pg_map_import(text,text) to authenticated;
