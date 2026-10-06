-- A save racing an admin host move must validate against a locked, current host.
create or replace function playground_private.validate_anchor() returns trigger language plpgsql set search_path='' as $$
declare s public.pg_structures; l public.pg_landmarks;
begin
 select * into s from public.pg_structures where id=new.mesh_id for share;
 select * into l from public.pg_landmarks where id=new.landmark_id for share;
 if s.id is null or l.mesh_id<>new.mesh_id or l.archived or s.geometry<>new.geometry or new.triangle>=s.triangle_count or new.triangle=any(s.invalid_triangles) then
 raise exception 'This placement does not match the current structure geometry'; end if;
 return new;
end; $$;
revoke all on function playground_private.validate_anchor() from public,anon,authenticated;
