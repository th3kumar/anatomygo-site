\set ON_ERROR_STOP on
-- 202610310001_revamp_card: the card read, feature counts, attachment links and account deletion.
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end;$$;
create function pg_temp.assert_denied(statement text,pattern text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
 if sqlerrm not ilike '%'||pattern||'%' then raise exception 'Unexpected error: %',sqlerrm;end if;return;
 end;
 raise exception 'FAILED: action allowed: %',statement;
end;$$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into playground_private.admins values('00000000-0000-0000-0000-000000000003');
insert into public.pg_structures values('bone','Scapula','skeletal',repeat('0',64),repeat('1',64),4,'{}'),('muscle','Subscapularis','muscular',repeat('0',64),repeat('2',64),4,'{}');
insert into public.pg_landmarks(id,mesh_id,label) values('fossa','bone','Subscapular fossa'),('plain','bone','Plain feature'),('none','bone','Unpinned feature'),('gone','bone','Archived feature'),('origin','muscle','Origin: subscapular fossa');
update public.pg_landmarks set archived=true where id='gone';
-- A starter pin (no author) on the muscle, as the imports write them.
insert into public.pg_proposals(landmark_id,mesh_id,label,description,geometry,triangle,u,v,request_id,request_body) values('origin','muscle','Origin: subscapular fossa','Starter',repeat('0',64),1,.2,.2,gen_random_uuid(),'[]');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.pg_set_profile('Contributor One');
select public.pg_submit(gen_random_uuid(),'plain','bone','Plain, first','','Biology',repeat('0',64),0,.2,.3) as first \gset
select public.pg_submit(gen_random_uuid(),'fossa','bone','Subscapular fossa','','Biology',repeat('0',64),2,.2,.3) as fossa \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select public.pg_set_profile('Contributor Two');
select public.pg_submit(gen_random_uuid(),'plain','bone','Plain, second','','Biology',repeat('0',64),1,.2,.3) as second \gset
select public.pg_vote(:'first',-1);
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select public.pg_vote(:'second',1);
select public.pg_moderate(:'fossa','approve');
reset role;

-- The card, as a signed-out visitor.
set local request.jwt.claim.sub='';
set local role anon;
select public.pg_card('bone') as card \gset
select pg_temp.assert_true(jsonb_array_length(:'card'::jsonb->'pins')=2,'one pin per feature: published + best community');
select pg_temp.assert_true((:'card'::jsonb->'pins'->0->>'kind')='published' and (:'card'::jsonb->'pins'->0->>'proposal')=:'fossa','published pins come first');
select pg_temp.assert_true((:'card'::jsonb->'pins'->1->>'proposal')=:'second','the best-voted placement is the community pin');
select pg_temp.assert_true((:'card'::jsonb->'pins'->1->>'by')='Contributor Two' and (:'card'::jsonb->'pins'->1->>'upvotes')='1','byline and votes');
select pg_temp.assert_true((:'card'::jsonb->'pins'->1->'at') is not null,'date for "just now"');
select pg_temp.assert_true(:'card'::jsonb->'needsPin'=jsonb_build_array(jsonb_build_object('id','none','label','Unpinned feature','latinName','')),'needs a pin: unpinned, not archived');
select pg_temp.assert_true(:'card'::jsonb->'mine'='{}'::jsonb,'no votes for a signed-out visitor');
select pg_temp.assert_true((select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(:'card'::jsonb->'pins') x where x->>'kind'='published')
 =(select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(public.pg_published_pack('bone')->'pins') x),'published pins match the app pack');
select pg_temp.assert_true(public.pg_card('missing') is null,'unknown structure');
select pg_temp.assert_true((select jsonb_agg(to_jsonb(c) order by c.mesh_id) from public.pg_feature_counts(array['bone','muscle']) c)
 ='[{"mesh_id":"bone","features":3,"pinned":2,"published":1},{"mesh_id":"muscle","features":1,"pinned":1,"published":0}]'::jsonb,'feature counts, archived left out');
select pg_temp.assert_denied($q$update public.pg_landmarks set attaches_to='fossa' where id='origin'$q$,'permission denied');
select pg_temp.assert_denied($q$select public.pg_delete_my_account()$q$,'permission denied');
select pg_temp.assert_denied($q$select playground_private.delete_account('a@b.co')$q$,'permission denied');
reset role;

-- A signed-in visitor sees their own votes.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(public.pg_card('bone')->'mine'=jsonb_build_object(:'second',1),'own votes only');
reset role;

-- Attachment links: set by admins, checked, shown from both ends.
select pg_temp.assert_denied($q$update public.pg_landmarks set attaches_to='plain' where id='fossa'$q$,'another structure');
select pg_temp.assert_denied($q$update public.pg_landmarks set attaches_to='gone' where id='origin'$q$,'current feature');
update public.pg_landmarks set attaches_to='fossa' where id='origin';
select pg_temp.assert_true(public.pg_card('bone')->'attached'=jsonb_build_array(jsonb_build_object('feature','fossa','id','origin','meshId','muscle','structure','Subscapularis','label','Origin: subscapular fossa')),'bone lists the muscle attached');
select pg_temp.assert_true((public.pg_card('muscle')->'pins'->0->'attachesTo'->>'id')='fossa' and (public.pg_card('muscle')->'pins'->0->'by')='null'::jsonb,'muscle pin names its bone feature; starter pin has no byline');

-- A hidden placement drops out; the next best takes its place.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select public.pg_moderate(:'second','hide');
select pg_temp.assert_true((public.pg_card('bone')->'pins'->1->>'proposal')=:'first','hidden placement replaced by the next');

-- Account deletion: votes, name and sign-in go; pins stay without a name.
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"is_anonymous":true}';
select pg_temp.assert_denied($q$select public.pg_delete_my_account()$q$,'Sign in');
set local request.jwt.claims='{}';
select public.pg_delete_my_account();
reset role;
select pg_temp.assert_true(not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000001'),'sign-in deleted');
select pg_temp.assert_true(not exists(select 1 from public.pg_profiles where id='00000000-0000-0000-0000-000000000001'),'name deleted');
select pg_temp.assert_true(not exists(select 1 from public.pg_votes where voter_id='00000000-0000-0000-0000-000000000001'),'votes deleted');
select pg_temp.assert_true((select count(*) from public.pg_proposals where id in (:'first',:'fossa') and author_id is null)=2,'pins kept without a name');
select pg_temp.assert_true((public.pg_card('bone')->'pins'->0->'by')='null'::jsonb,'card shows no byline after deletion');
select pg_temp.assert_true(jsonb_array_length(public.pg_published_pack('bone')->'pins')=1,'published pin still in the app pack');
-- The owner answering an emailed request (SQL editor): by email, case-insensitive; signed-in visitors can't.
update auth.users set email='Two@Example.com' where id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_denied($q$select playground_private.delete_account('two@example.com')$q$,'permission denied');
reset role;
select pg_temp.assert_denied($q$select playground_private.delete_account('nobody@example.com')$q$,'No account');
select playground_private.delete_account(' two@example.com ');
select pg_temp.assert_true(not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000002') and (select author_id from public.pg_proposals where id=:'second') is null,'deleted by email, pin kept without a name');
-- An admin can still move a linked feature: the link check only runs when the link itself changes.
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select public.pg_move_landmark('origin','bone');
reset role;
rollback;
\echo 'PASS: card read, feature counts, attachment links and account deletion'
