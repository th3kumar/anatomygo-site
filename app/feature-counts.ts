import {useEffect,useState} from 'react';
/** For the opened pieces, read straight from the public tables: how many parts & features the Playground lists,
 * how many of them have a pin (community or published), and how many are published. */
export interface FeatureCounts {features:number;pinned:number;published:number}
const cache=new Map<string,{at:number;counts:FeatureCounts}>();
const total=(list:FeatureCounts[])=>list.reduce((a,b)=>({features:a.features+b.features,pinned:a.pinned+b.pinned,published:a.published+b.published}),{features:0,pinned:0,published:0});
export function useFeatureCounts(ids:string[]):FeatureCounts|null{
 const key=ids.slice(0,50).join(',');
 const [counts,setCounts]=useState<FeatureCounts|null>(null);
 useEffect(()=>{setCounts(null);const url=import.meta.env.VITE_SUPABASE_URL,anon=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;if(!key||!url||!anon)return;
  const list=key.split(','),fresh=(id:string)=>{const c=cache.get(id);return !!c&&Date.now()-c.at<60000;};
  if(list.every(fresh)){setCounts(total(list.map(id=>cache.get(id)!.counts)));return;}
  let live=true;const abort=new AbortController(),meshes=list.map(encodeURIComponent).join(',');
  const read=<R,>(path:string)=>fetch(`${url}/rest/v1/${path}`,{headers:{apikey:anon},signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Feature counts unavailable');return r.json() as Promise<R>;});
  Promise.all([read<{id:string;mesh_id:string;published_proposal:string|null}[]>(`pg_landmarks?select=id,mesh_id,published_proposal&archived=eq.false&mesh_id=in.(${meshes})`),
   read<{landmark_id:string}[]>(`pg_proposals?select=landmark_id&status=eq.community&mesh_id=in.(${meshes})`)])
   .then(([landmarks,proposals])=>{
    const pinned=new Set(proposals.map(p=>p.landmark_id)),next:Record<string,FeatureCounts>=Object.fromEntries(list.map(id=>[id,{features:0,pinned:0,published:0}]));
    for(const l of landmarks){const c=next[l.mesh_id];if(!c)continue;c.features++;if(pinned.has(l.id)||l.published_proposal)c.pinned++;if(l.published_proposal)c.published++;}
    for(const id of list)cache.set(id,{at:Date.now(),counts:next[id]});while(cache.size>300)cache.delete(cache.keys().next().value!);if(live)setCounts(total(list.map(id=>next[id])));})
   .catch(()=>{/* the entry still works without a count */});
  return()=>{live=false;abort.abort();};
 },[key]);
 return counts;
}
