import {useCallback,useEffect,useRef,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {cloud,rpc} from './cloud';
import {track} from '../analytics';

/** Votes on pins (films C1 and P1). Signed in, a vote is sent at once. Signed out, it counts here straight away and is
 * kept on this device (`anatomygo.votes`) until sign-in, then sent; a pin removed meanwhile, or your own, is dropped. */
export type Vote=1|-1|0;
const KEY='anatomygo.votes';
type Votes=Record<string,1|-1>;
function stored():Votes{try{const v=JSON.parse(localStorage.getItem(KEY)??'{}');return v&&typeof v==='object'?v:{};}catch{return {};}}
function store(v:Votes){try{if(Object.keys(v).length)localStorage.setItem(KEY,JSON.stringify(v));else localStorage.removeItem(KEY);}catch{/* private mode: the vote lasts this visit */}}

export function useVotes(session:Session|null,proposals:string[]){
 const [local,setLocal]=useState<Votes>(stored),[server,setServer]=useState<Votes>({}),[loaded,setLoaded]=useState<Votes>({}),[error,setError]=useState('');
 const key=proposals.join(','),signedIn=!!session,busy=useRef(false);
 // Signed in: your own votes on the pins shown, as they were when the counts were read.
 useEffect(()=>{if(!signedIn||!key)return;let live=true;
  void cloud().then(c=>c.from('pg_votes').select('proposal_id,value').in('proposal_id',key.split(','))).then(({data})=>{if(!live||!data)return;const v=Object.fromEntries(data.map(r=>[r.proposal_id,r.value as 1|-1]));setServer(v);setLoaded(v);}).catch(()=>{});
  return()=>{live=false;};},[signedIn,key]);
 // After sign-in, the votes kept on this device are sent, then forgotten here.
 useEffect(()=>{if(!signedIn)return;const pending=stored(),ids=Object.keys(pending);if(!ids.length)return;
  void (async()=>{for(const id of ids){try{await rpc('pg_vote',{p_proposal:id,p_value:pending[id]});setServer(s=>({...s,[id]:pending[id]}));}catch{/* removed, or your own pin */}}
   store({});setLocal({});})();},[signedIn]);
 const mine=useCallback((id:string):Vote=>(signedIn?server[id]:local[id])??0,[signedIn,server,local]);
 /** The count to show: the read count, moved by what you changed since it was read. */
 const count=useCallback((id:string,read:number)=>read-(signedIn&&loaded[id]===1?1:0)+(mine(id)===1?1:0),[signedIn,loaded,mine]);
 /** Sets your vote; returns 'kept' when it stayed on this device (signed out), so the caller can offer sign-in. */
 const vote=useCallback(async(id:string,value:Vote):Promise<'sent'|'kept'|'failed'>=>{
  setError('');track('vote_cast',{vote:value===1?'up':value===-1?'down':'clear',practice:0});
  if(!signedIn){const next={...stored()};if(value)next[id]=value;else delete next[id];store(next);setLocal(next);return 'kept';}
  if(busy.current)return 'failed';busy.current=true;const before=server[id]??0;setServer(s=>({...s,[id]:value as 1|-1}));
  try{await rpc('pg_vote',{p_proposal:id,p_value:value});return 'sent';}
  catch(e){setServer(s=>({...s,[id]:before as 1|-1}));setError(/own/.test(String(e))?'That’s your own pin.':'Your vote didn’t send. Please try again.');return 'failed';}
  finally{busy.current=false;}
 },[signedIn,server]);
 return {mine,count,vote,error};
}
