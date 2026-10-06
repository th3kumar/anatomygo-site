-- Enforce the byte limit as well as the pin-count limit before approval commits.
create or replace function public.pg_moderate(p_proposal uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
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
 if octet_length(public.pg_published_pack(p.mesh_id)::text)>524288 then raise exception 'This structure exceeds the 512 KiB app pack limit'; end if;
 elsif p_action='unpublish' then
 update public.pg_landmarks set published_proposal=null where published_proposal=p.id;
 elsif p_action='hide' then
 update public.pg_landmarks set published_proposal=null where published_proposal=p.id;
 update public.pg_proposals set status='hidden' where id=p.id;
 else raise exception 'Unknown moderation action'; end if;
 update public.pg_reports set resolved=true where proposal_id=p.id;
 insert into playground_private.audit(actor,action,target) values(auth.uid(),p_action,p.id::text);
end; $$;
