-- The revamp's reads and account deletion. Add-only: no existing table, function, policy or grant changes, so the live
-- site and Playground behave exactly as before. Undo: supabase/rollback/202610310001_revamp_card.sql.
-- Give up rather than queue behind live reads if a table lock isn't free at once.
set lock_timeout='3s';

-- A muscle's attachment feature ("Origin: subscapular fossa" on subscapularis) can point at the bone's own feature
-- (subscapular fossa on the scapula). Set by admins and pilot rounds; browser roles can't write pg_landmarks.
alter table public.pg_landmarks add column attaches_to text references public.pg_landmarks(id);
create index pg_landmarks_attaches_idx on public.pg_landmarks(attaches_to) where attaches_to is not null;
create function playground_private.validate_attachment() returns trigger language plpgsql set search_path='' as $$
begin
 if new.attaches_to is not null and not exists(select 1 from public.pg_landmarks t where t.id=new.attaches_to and not t.archived and t.mesh_id<>new.mesh_id) then
 raise exception 'An attachment must point at a current feature on another structure'; end if;
 return new;
end; $$;
-- Only when the link itself is set: an admin moving a feature (pg_move_landmark) is never blocked by it.
create trigger validate_attachment before insert or update of attaches_to on public.pg_landmarks for each row execute function playground_private.validate_attachment();
revoke all on function playground_private.validate_attachment() from public,anon,authenticated;

-- Feature counts for the opened structures, as numbers: replaces reading every row (which the API caps at 1,000).
-- Pinned = a published pin or any community placement, as the home page counted it.
create function public.pg_feature_counts(p_meshes text[]) returns table(mesh_id text,features integer,pinned integer,published integer)
language sql stable security definer set search_path='' as $$
 select l.mesh_id,count(*)::integer,
 count(*) filter(where l.published_proposal is not null or exists(select 1 from public.pg_proposals p where p.landmark_id=l.id and p.status='community'))::integer,
 count(*) filter(where l.published_proposal is not null)::integer
 from public.pg_landmarks l where l.mesh_id=any(p_meshes[1:300]) and not l.archived group by l.mesh_id;
$$;

-- Everything a structure card shows, in one read:
--  pins      published pins, then the best community placement of each other feature (most net votes, newest on a tie,
--            at most 100), each with its byline, date, votes and, for a muscle's attachment, the bone feature it sits on;
--  needsPin  features with no placement yet;
--  attached  for a bone, the muscle attachments linked to each of its features;
--  mine      the signed-in visitor's own votes on these pins.
-- Placements on other geometry are left out; the client still checks `geometry` against its model.
-- `by` is null for a starter pin (no author), as in the Playground.
create function public.pg_card(p_mesh text) returns jsonb language sql stable security definer set search_path='' as $$
 with s as (select * from public.pg_structures where id=p_mesh),
 l as (select l.* from public.pg_landmarks l join s on s.id=l.mesh_id where not l.archived),
 p as (select p.id,p.landmark_id,p.label,p.latin_name,p.description,p.triangle,p.u,p.v,p.shape,p.author_id,p.created_at,pr.display_name,
  (select count(*) from public.pg_votes v where v.proposal_id=p.id and v.value=1) up,
  (select count(*) from public.pg_votes v where v.proposal_id=p.id and v.value=-1) down,
  (l.published_proposal=p.id) published,l.attaches_to
  from public.pg_proposals p join l on l.id=p.landmark_id join s on s.geometry=p.geometry left join public.pg_profiles pr on pr.id=p.author_id
  where p.status='community' and p.mesh_id=p_mesh),
 best as (select distinct on (p.landmark_id) p.* from p join l on l.id=p.landmark_id where l.published_proposal is null
  order by p.landmark_id,(p.up-p.down) desc,p.created_at desc,p.id),
 shown as ((select p.*,0 rank from p where p.published) union all (select b.*,1 from best b order by b.created_at desc,b.id limit 100))
 select jsonb_build_object('schema',1,'meshId',s.id,'geometry',s.geometry,
 'pins',coalesce((select jsonb_agg(jsonb_build_object('id',x.landmark_id,'proposal',x.id,'label',x.label,'latinName',x.latin_name,'description',x.description,
   'anchor',jsonb_build_object('triangle',x.triangle,'u',x.u,'v',x.v),'kind',case when x.published then 'published' else 'community' end,
   'by',case when x.author_id is null then null else coalesce(x.display_name,'') end,'at',x.created_at,'upvotes',x.up,'downvotes',x.down)
   ||case when x.shape is null then '{}'::jsonb else jsonb_build_object('shape',x.shape) end
   ||coalesce((select jsonb_build_object('attachesTo',jsonb_build_object('id',t.id,'meshId',t.mesh_id,'label',t.label)) from public.pg_landmarks t where t.id=x.attaches_to and not t.archived),'{}'::jsonb)
   order by x.rank,x.label,x.id) from shown x),'[]'::jsonb),
 'needsPin',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'label',l.label,'latinName',l.latin_name) order by l.label,l.id)
   from l where l.published_proposal is null and not exists(select 1 from p where p.landmark_id=l.id)),'[]'::jsonb),
 'attached',coalesce((select jsonb_agg(jsonb_build_object('feature',l.id,'id',m.id,'meshId',m.mesh_id,'structure',ms.name,'label',m.label) order by l.label,ms.name,m.id)
   from l join public.pg_landmarks m on m.attaches_to=l.id and not m.archived join public.pg_structures ms on ms.id=m.mesh_id),'[]'::jsonb),
 'mine',case when auth.uid() is null then '{}'::jsonb else coalesce((select jsonb_object_agg(v.proposal_id,v.value)
   from public.pg_votes v join shown x on x.id=v.proposal_id where v.voter_id=auth.uid()),'{}'::jsonb) end)
 from s;
$$;

-- Account deletion, for erasure requests. Removes the person's votes, reports, comments, rate-limit records, name and
-- sign-in. Their pins stay for learners, without a name (author_id becomes null). Audit keeps only the bare ID.
create function public.pg_delete_my_account() returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := playground_private.require_user();
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 delete from public.pg_votes where voter_id=uid;
 delete from public.pg_reports where reporter_id=uid;
 delete from public.pg_comments where author_id=uid;
 update public.pg_proposals set author_id=null where author_id=uid;
 delete from public.pg_profiles where id=uid;
 delete from playground_private.actions where user_id=uid;
 delete from playground_private.admins where user_id=uid;
 insert into playground_private.audit(actor,action,target) values(null,'delete_account',uid::text);
 delete from auth.users where id=uid;
end; $$;

-- Supabase lets every role run new functions by default; grant each one explicitly instead.
revoke all on function public.pg_feature_counts(text[]),public.pg_card(text),public.pg_delete_my_account() from public,anon,authenticated;
grant execute on function public.pg_feature_counts(text[]),public.pg_card(text) to anon,authenticated;
grant execute on function public.pg_delete_my_account() to authenticated;
