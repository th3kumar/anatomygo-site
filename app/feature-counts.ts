import {useEffect,useState} from 'react';
import {missingRpc,rest,supabaseConfig} from './supabase-rest';
/** For the opened pieces, from the public API: how many parts & features the Playground lists,
 * how many of them have a pin (community or published), and how many are published. */
export interface FeatureCounts {features:number;pinned:number;published:number}
const cache=new Map<string,{at:number;counts:FeatureCounts}>();
const total=(list:FeatureCounts[])=>list.reduce((a,b)=>({features:a.features+b.features,pinned:a.pinned+b.pinned,published:a.published+b.published}),{features:0,pinned:0,published:0});
export function useFeatureCounts(ids:string[]):FeatureCounts|null{
 const key=ids.slice(0,50).join(',');
 const [counts,setCounts]=useState<FeatureCounts|null>(null);
 useEffect(()=>{setCounts(null);if(!key||!supabaseConfig())return;
  const list=key.split(','),fresh=(id:string)=>{const c=cache.get(id);return !!c&&Date.now()-c.at<60000;};
  if(list.every(fresh)){setCounts(total(list.map(id=>cache.get(id)!.counts)));return;}
  let live=true;const abort=new AbortController(),signal=abort.signal;
  // The numbers alone (pg_feature_counts); until that migration is live, count the rows as before.
  rest<({mesh_id:string}&FeatureCounts)[]>('rpc/pg_feature_counts',{body:{p_meshes:list},signal})
   .catch(e=>{if(!missingRpc(e))throw e;return countRows(list,signal);})
   .then(rows=>{
    const next:Record<string,FeatureCounts>=Object.fromEntries(list.map(id=>[id,{features:0,pinned:0,published:0}]));
    for(const r of rows)if(next[r.mesh_id])next[r.mesh_id]={features:r.features,pinned:r.pinned,published:r.published};
    for(const id of list)cache.set(id,{at:Date.now(),counts:next[id]});while(cache.size>300)cache.delete(cache.keys().next().value!);if(live)setCounts(total(list.map(id=>next[id])));})
   .catch(()=>{/* the entry still works without a count */});
  return()=>{live=false;abort.abort();};
 },[key]);
 return counts;
}
/** The older count: every feature and placement row of these structures (the API returns at most 1,000 of each). */
async function countRows(list:string[],signal:AbortSignal){
 const meshes=list.map(encodeURIComponent).join(',');
 const [landmarks,proposals]=await Promise.all([rest<{id:string;mesh_id:string;published_proposal:string|null}[]>(`pg_landmarks?select=id,mesh_id,published_proposal&archived=eq.false&mesh_id=in.(${meshes})`,{signal}),
  rest<{landmark_id:string}[]>(`pg_proposals?select=landmark_id&status=eq.community&mesh_id=in.(${meshes})`,{signal})]);
 const pinned=new Set(proposals.map(p=>p.landmark_id)),out=new Map<string,{mesh_id:string}&FeatureCounts>();
 for(const l of landmarks){const c=out.get(l.mesh_id)??{mesh_id:l.mesh_id,features:0,pinned:0,published:0};out.set(l.mesh_id,c);c.features++;if(pinned.has(l.id)||l.published_proposal)c.pinned++;if(l.published_proposal)c.published++;}
 return [...out.values()];
}
