\set ON_ERROR_STOP on
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
insert into public.pg_structures values('test_mesh','Test structure','skeletal',repeat('0',64),repeat('1',64),2,array[1]);
insert into public.pg_structures values('test_target','Target structure','skeletal',repeat('0',64),repeat('2',64),2,array[1]);
insert into public.pg_landmarks(id,mesh_id,label) values('test_landmark','test_mesh','Test landmark');
insert into playground_private.unmapped_imports values('test_unmapped','Unmapped test bucket','{"label":"Unplaced landmark","archived":0}');
set local role anon;
select pg_temp.assert_true((select count(*)>0 from public.pg_structures),'anonymous catalogue');
select pg_temp.assert_true(not public.pg_is_admin(),'anonymous is not admin');
select pg_temp.assert_denied($q$select public.pg_submit(gen_random_uuid(),'test_landmark','test_mesh','Pin','','Biology',repeat('0',64),0,.2,.3)$q$,'permission denied');
select pg_temp.assert_denied($q$insert into public.pg_votes values(gen_random_uuid(),gen_random_uuid(),1)$q$,'permission denied');
select pg_temp.assert_denied($q$select * from playground_private.unmapped_imports$q$,'permission denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.pg_set_profile('Contributor One');
select pg_temp.assert_denied($q$update public.pg_landmarks set published_proposal=null$q$,'permission denied');
select pg_temp.assert_denied($q$insert into playground_private.admins values(auth.uid())$q$,'permission denied');
select pg_temp.assert_denied($q$select public.pg_admin_queue()$q$,'Admin access required');
select pg_temp.assert_denied($q$select public.pg_submit(gen_random_uuid(),'test_landmark','test_mesh','Pin','','Biology',repeat('0',64),1,.2,.3)$q$,'geometry');
select pg_temp.assert_denied($q$select public.pg_submit(gen_random_uuid(),'test_landmark','test_mesh','Pin','','Biology',repeat('1',64),0,.2,.3)$q$,'geometry');
select pg_temp.assert_denied($q$select public.pg_submit(gen_random_uuid(),'test_landmark','test_mesh','Pin','','Biology',repeat('0',64),0,'NaN',.3)$q$,'check constraint');
select public.pg_submit('11111111-1111-1111-1111-111111111111','test_landmark','test_mesh','Pin','','Biology',repeat('0',64),0,.2,.3) as proposal \gset
select pg_temp.assert_true(public.pg_submit('11111111-1111-1111-1111-111111111111','test_landmark','test_mesh','Pin','','Biology',repeat('0',64),0,.2,.3)=:'proposal'::uuid,'idempotent save');
select pg_temp.assert_denied($q$select public.pg_submit('11111111-1111-1111-1111-111111111111','test_landmark','test_mesh','Changed','','Biology',repeat('0',64),0,.2,.3)$q$,'different content');
select pg_temp.assert_denied(format('select public.pg_vote(%L,1)',:'proposal'),'own proposal');
select pg_temp.assert_denied(format('select public.pg_moderate(%L,''approve'')',:'proposal'),'Admin access required');
select pg_temp.assert_true(jsonb_array_length(public.pg_published_pack('test_mesh')->'pins')=0,'unapproved content excluded');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select public.pg_set_profile('Contributor Two');
select public.pg_vote(:'proposal',1);
select public.pg_vote(:'proposal',1);
select pg_temp.assert_true((select upvotes=1 from public.pg_vote_totals(array[:'proposal'::uuid])),'one vote per account');
select public.pg_vote(:'proposal',-1);
select pg_temp.assert_true((select upvotes=0 and downvotes=1 from public.pg_vote_totals(array[:'proposal'::uuid])),'vote changed');
select pg_temp.assert_denied(format('select public.pg_withdraw(%L)',:'proposal'),'Only the contributor');
select public.pg_comment(:'proposal','Check this from the anterior view.','22222222-2222-2222-2222-222222222222') as comment \gset
select public.pg_comment(:'proposal','Check this from the anterior view.','22222222-2222-2222-2222-222222222222');
select pg_temp.assert_true((select count(*)=1 from public.pg_comments where proposal_id=:'proposal'),'idempotent comment');
select public.pg_report(:'proposal','The landmark may belong on another structure.');
select pg_temp.assert_true((select count(*)=0 from public.pg_reports),'reports private to admins');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert_true(public.pg_is_admin(),'admin identity');
select public.pg_moderate(:'proposal','approve');
select pg_temp.assert_true(jsonb_array_length(public.pg_published_pack('test_mesh')->'pins')=1,'approved content exported');
select pg_temp.assert_true(jsonb_array_length(public.pg_admin_queue())>0,'admin queue');
select pg_temp.assert_true(jsonb_array_length(public.pg_unmapped())>=1,'unresolved buckets preserved');
select public.pg_remove_comment(:'comment');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.assert_denied(format('select public.pg_withdraw(%L)',:'proposal'),'Published pins');
select public.pg_submit('33333333-3333-3333-3333-333333333333','test_landmark','test_mesh','Pin moved','','New biology',repeat('0',64),0,.3,.3,:'proposal') as revised \gset
select pg_temp.assert_true((public.pg_published_pack('test_mesh')->'pins'->0->>'label')='Pin','old approved revision retained');
select pg_temp.assert_true((select upvotes=0 and downvotes=0 from public.pg_vote_totals(array[:'revised'::uuid])),'votes do not carry to revision');
select pg_temp.assert_true((select count(*)=0 from public.pg_comments where id=:'comment'),'hidden comments absent');
select public.pg_withdraw(:'revised');
select pg_temp.assert_true((select count(*)=0 from public.pg_proposals where id=:'revised'),'withdrawn proposal absent');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select public.pg_move_landmark('test_landmark','test_target');
select pg_temp.assert_true(jsonb_array_length(public.pg_published_pack('test_mesh')->'pins')=0,'move withdraws old host');
select pg_temp.assert_true(jsonb_array_length(public.pg_published_pack('test_target')->'pins')=0,'move does not transfer coordinates');
select public.pg_set_profile('Test Admin');
do $$ declare candidate uuid; refused boolean:=false; begin
 for n in 1..50 loop
 candidate:=public.pg_submit(gen_random_uuid(),null,'test_mesh','Large description '||n,'',repeat('☃',4000),repeat('0',64),0,.2,.3);
 begin perform public.pg_moderate(candidate,'approve');
 exception when others then if sqlerrm not like '%512 KiB%' then raise;end if;refused:=true;exit;end;
 end loop;
 perform pg_temp.assert_true(refused,'oversized UTF-8 pack refused');
 perform pg_temp.assert_true(octet_length(public.pg_published_pack('test_mesh')::text)<=524288,'last valid pack retained');
end; $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"is_anonymous":true}';
select pg_temp.assert_denied($q$select public.pg_set_profile('Guest')$q$,'Sign in');
reset role;
rollback;
\echo 'PASS: permissions, validation, idempotency, ownership, moderation, publication and mapping'
