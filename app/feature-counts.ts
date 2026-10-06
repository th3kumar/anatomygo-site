import {useEffect,useState} from 'react';
/** How many parts & features the Playground lists for each piece, read straight from the public table. */
const cache=new Map<string,{at:number;count:number}>();
export function useFeatureCounts(ids:string[]):Record<string,number>|null{
 const key=ids.slice(0,50).join(',');
 const [counts,setCounts]=useState<Record<string,number>|null>(null);
 useEffect(()=>{setCounts(null);const url=import.meta.env.VITE_SUPABASE_URL,anon=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;if(!key||!url||!anon)return;
  const list=key.split(','),fresh=(id:string)=>{const c=cache.get(id);return !!c&&Date.now()-c.at<60000;};
  if(list.every(fresh)){setCounts(Object.fromEntries(list.map(id=>[id,cache.get(id)!.count])));return;}
  let live=true;const abort=new AbortController();
  fetch(`${url}/rest/v1/pg_landmarks?select=mesh_id&archived=eq.false&mesh_id=in.(${list.map(encodeURIComponent).join(',')})`,{headers:{apikey:anon},signal:abort.signal})
   .then(r=>{if(!r.ok)throw Error('Feature counts unavailable');return r.json() as Promise<{mesh_id:string}[]>;})
   .then(rows=>{const next:Record<string,number>=Object.fromEntries(list.map(id=>[id,0]));for(const r of rows)if(r.mesh_id in next)next[r.mesh_id]++;for(const id of list)cache.set(id,{at:Date.now(),count:next[id]});while(cache.size>300)cache.delete(cache.keys().next().value!);if(live)setCounts(next);})
   .catch(()=>{/* the entry still works without a count */});
  return()=>{live=false;abort.abort();};
 },[key]);
 return counts;
}
