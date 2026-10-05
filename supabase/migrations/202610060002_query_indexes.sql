-- Query paths used by the public viewer and admin queues.
create index pg_landmarks_published_idx on public.pg_landmarks(published_proposal);
create index pg_proposals_mesh_created_idx on public.pg_proposals(mesh_id,created_at desc,id);
create index pg_proposals_supersedes_idx on public.pg_proposals(supersedes);
create index pg_reports_reporter_idx on public.pg_reports(reporter_id);
create index pg_votes_voter_idx on public.pg_votes(voter_id);
alter table playground_private.actions add column id bigint generated always as identity primary key;
alter policy own_votes on public.pg_votes using(voter_id=(select auth.uid()));
alter policy landmarks_read on public.pg_landmarks using(not archived or (select public.pg_is_admin()));
alter policy proposals_read on public.pg_proposals using((status='community' and exists(select 1 from public.pg_landmarks l where l.id=landmark_id and not l.archived)) or (select public.pg_is_admin()));
alter policy comments_read on public.pg_comments using((not hidden and exists(select 1 from public.pg_proposals p where p.id=proposal_id and p.status='community')) or (select public.pg_is_admin()));
alter policy reports_admin on public.pg_reports using((select public.pg_is_admin()));
-- Public published reads need no elevated privileges: RLS already allows this data.
alter function public.pg_published_pack(text) security invoker;
