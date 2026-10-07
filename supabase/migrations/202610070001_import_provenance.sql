-- Bulk-imported suggestions (first: Z-Anatomy candidate pins). The public sees an ordinary unreviewed
-- community proposal without an author; where it came from stays here, out of reach of browser roles.
-- Imported proposals have no author_id, so (author_id, request_id) cannot keep reruns idempotent:
-- one row per source candidate does, and lets an interrupted import reconcile what was actually written.
create table playground_private.imports (
 candidate_key text primary key check(candidate_key ~ '^[0-9a-f]{64}$'),
 source text not null check(length(source) between 1 and 80),
 batch text not null check(length(batch) between 1 and 80),
 proposal_id uuid not null unique references public.pg_proposals(id),
 landmark_id text not null references public.pg_landmarks(id),
 created_landmark boolean not null,
 content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
 provenance jsonb not null,
 -- Engineering diagnostics only (fit, projection, normals). Never evidence of anatomical accuracy.
 geometry_checks jsonb not null,
 -- Anatomical acceptance is a separate, human decision; publication still goes through pg_moderate.
 anatomical_review text not null default 'not_reviewed' check(anatomical_review in ('not_reviewed','accepted','needs_adjustment','rejected')),
 imported_at timestamptz not null default now()
);
create index imports_batch_idx on playground_private.imports(source,batch);
create index imports_landmark_idx on playground_private.imports(landmark_id);
revoke all on playground_private.imports from public,anon,authenticated;
