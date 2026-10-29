-- Feature shapes: a pin can carry an optional line or area (a ridge, border, fossa, surface or muscle attachment)
-- instead of marking a single spot. The format is documented in lib/feature-shape.ts. Null keeps a plain point pin.
-- Shapes are written by admins only (there is no update grant on pg_proposals); contributors still place points.
alter table public.pg_proposals add column shape jsonb;

create function playground_private.shape_number_ok(x jsonb, lo numeric, hi numeric) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(x)='number' and (x::text)::numeric between lo and hi;
$$;

create function playground_private.shape_anchor_ok(a jsonb, p_triangles integer, p_invalid integer[]) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(a)='object' and jsonb_typeof(a->'triangle')='number' and (a->>'triangle') ~ '^[0-9]+$'
  and (a->>'triangle')::bigint < p_triangles and not ((a->>'triangle')::integer = any(coalesce(p_invalid,'{}')))
  and playground_private.shape_number_ok(a->'u',0,1) and playground_private.shape_number_ok(a->'v',0,1)
  and (a->>'u')::numeric+(a->>'v')::numeric <= 1.000000001;
$$;

-- Mirrors parseFeatureShape(): at most 16 parts and 64 drawn primitives; ovals 0.5-60 mm, lines 2-64 points and 0.5-20 mm wide.
create function playground_private.shape_ok(p_shape jsonb, p_triangles integer, p_invalid integer[]) returns boolean language plpgsql immutable set search_path='' as $$
declare part jsonb; primitives integer := 0; n integer;
begin
 if p_shape is null then return true; end if;
 if jsonb_typeof(p_shape)<>'object' or p_shape->'v' is distinct from '1'::jsonb or coalesce(p_shape->>'role','') not in ('feature','origin','insertion')
    or jsonb_typeof(p_shape->'shapes') is distinct from 'array' then return false; end if;
 n := jsonb_array_length(p_shape->'shapes');
 if n < 1 or n > 16 then return false; end if;
 for part in select value from jsonb_array_elements(p_shape->'shapes') loop
  if part->>'type' = 'oval' then
   if not (playground_private.shape_anchor_ok(part->'at',p_triangles,p_invalid) and playground_private.shape_number_ok(part->'rx',0.5,60)
           and playground_private.shape_number_ok(part->'ry',0.5,60) and playground_private.shape_number_ok(part->'angle',0,180)) then return false; end if;
   primitives := primitives + 1;
  elsif part->>'type' = 'line' then
   if jsonb_typeof(part->'points') is distinct from 'array' or jsonb_array_length(part->'points') not between 2 and 64
      or not playground_private.shape_number_ok(part->'width',0.5,20)
      or exists(select 1 from jsonb_array_elements(part->'points') pt where not playground_private.shape_anchor_ok(pt.value,p_triangles,p_invalid)) then return false; end if;
   primitives := primitives + jsonb_array_length(part->'points') - 1;
  else return false; end if;
 end loop;
 return primitives <= 64;
end; $$;

create function playground_private.validate_shape() returns trigger language plpgsql set search_path='' as $$
declare s public.pg_structures;
begin
 if new.shape is null then return new; end if;
 select * into s from public.pg_structures where id=new.mesh_id for share;
 if s.id is null or s.geometry<>new.geometry or not playground_private.shape_ok(new.shape,s.triangle_count,s.invalid_triangles) then
  raise exception 'This shape does not match the current structure geometry'; end if;
 return new;
end; $$;
create trigger validate_shape before insert or update of shape, geometry, mesh_id on public.pg_proposals for each row execute function playground_private.validate_shape();

-- The app pack gains an optional "shape" per pin. Schema stays 1: readers that do not know shapes ignore the key.
create or replace function public.pg_published_pack(p_mesh text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schema',1,'meshId',s.id,'label',s.name,'geometry',s.geometry,'pins',coalesce((
 select jsonb_agg(jsonb_build_object('id',l.id,'label',p.label,'latinName',p.latin_name,'description',p.description,'anchor',jsonb_build_object('triangle',p.triangle,'u',p.u,'v',p.v))
                  || case when p.shape is null then '{}'::jsonb else jsonb_build_object('shape',p.shape) end order by l.id)
 from public.pg_landmarks l join public.pg_proposals p on p.id=l.published_proposal
 where l.mesh_id=s.id and not l.archived and p.status='community' and p.geometry=s.geometry and p.mesh_id=s.id),'[]'::jsonb))
 from public.pg_structures s where s.id=p_mesh;
$$;
