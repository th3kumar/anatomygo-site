import {useEffect,useState} from 'react';
import {rest} from '../supabase-rest';
import type {Anchor} from '../draft-pin-layer';

/** Every spot people placed for one feature (on this model), with votes, and the comments on the spot being viewed.
 * Public reads; loaded when a feature opens, again when `version` changes (after a post or a delete). */
export interface Spot {proposal:string;label:string;latinName:string;description:string;anchor:Anchor;by:string|null;author:string|null;at:string;upvotes:number}
export interface Remark {id:string;body:string;by:string;author:string;at:string}
interface ProposalRow {id:string;label:string;latin_name:string|null;description:string|null;triangle:number;u:number;v:number;author_id:string|null;created_at:string;pg_profiles:{display_name:string|null}|null}
interface CommentRow {id:string;body:string;author_id:string;created_at:string;pg_profiles:{display_name:string|null}|null}
const PAGE=30;

export function useFeatureDetail(landmark:string|null,proposal:string|null,geometry:string|null,version:number){
 const [spots,setSpots]=useState<Spot[]>([]),[remarks,setRemarks]=useState<Remark[]>([]),[more,setMore]=useState(false);
 useEffect(()=>{setSpots([]);if(!landmark||!geometry)return;const abort=new AbortController(),signal=abort.signal;
  rest<ProposalRow[]>(`pg_proposals?select=id,label,latin_name,description,triangle,u,v,author_id,created_at,pg_profiles(display_name)&landmark_id=eq.${encodeURIComponent(landmark)}&status=eq.community&geometry=eq.${geometry}&order=created_at.desc&limit=50`,{signal})
   .then(async rows=>{const totals=rows.length?await rest<{proposal_id:string;upvotes:number}[]>('rpc/pg_vote_totals',{body:{p_ids:rows.map(r=>r.id)},signal}).catch(()=>[]):[];const up=new Map(totals.map(t=>[t.proposal_id,Number(t.upvotes)]));
    setSpots(rows.map(r=>({proposal:r.id,label:r.label,latinName:r.latin_name??'',description:r.description??'',anchor:{triangle:r.triangle,u:r.u,v:r.v},by:r.author_id?r.pg_profiles?.display_name??'':null,author:r.author_id,at:r.created_at,upvotes:up.get(r.id)??0})));})
   .catch(()=>{/* the feature still shows its main spot */});
  return()=>abort.abort();},[landmark,geometry,version]);
 const read=(before?:string)=>rest<CommentRow[]>(`pg_comments?select=id,body,author_id,created_at,pg_profiles(display_name)&proposal_id=eq.${proposal}&hidden=eq.false&order=created_at.desc,id.desc&limit=${PAGE}${before?`&created_at=lt.${encodeURIComponent(before)}`:''}`)
  .then(rows=>rows.map(c=>({id:c.id,body:c.body,by:c.pg_profiles?.display_name??'Someone',author:c.author_id,at:c.created_at})));
 useEffect(()=>{setRemarks([]);setMore(false);if(!proposal)return;let live=true;
  read().then(r=>{if(live){setRemarks(r);setMore(r.length===PAGE);}}).catch(()=>{/* comments stay hidden; the pin still works */});
  return()=>{live=false;};},[proposal,version]); // eslint-disable-line react-hooks/exhaustive-deps
 const older=async()=>{const r=await read(remarks.at(-1)?.at);setRemarks(x=>[...x,...r]);setMore(r.length===PAGE);};
 return {spots,remarks,more,older};
}
