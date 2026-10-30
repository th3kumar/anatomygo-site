import {useEffect,useState} from 'react';
/** Parts & features whose name matches a search, read from the public features table (at most 8, from 3 letters on,
 * a moment after typing stops). Each says which piece it is on, so choosing it can open that piece on that feature. */
export interface FeatureHit {id:string;label:string;mesh:string}
const cache=new Map<string,FeatureHit[]>();
export function useFeatureSearch(query:string):FeatureHit[]{
 const term=query.trim().toLowerCase(),[hits,setHits]=useState<FeatureHit[]>([]);
 useEffect(()=>{
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(term.length<3||!url||!key){setHits([]);return;}
  const known=cache.get(term);if(known){setHits(known);return;}
  const abort=new AbortController();
  // PostgREST pattern: * is the wildcard; the name's own * , ( ) are dropped so they can't change the query.
  const pattern=encodeURIComponent(`*${term.replace(/[*,()]/g,' ')}*`);
  const t=setTimeout(()=>{fetch(`${url}/rest/v1/pg_landmarks?select=id,label,mesh_id&archived=eq.false&label=ilike.${pattern}&order=label&limit=8`,{headers:{apikey:key},signal:abort.signal})
   .then(r=>{if(!r.ok)throw Error('Feature search unavailable');return r.json() as Promise<{id:string;label:string;mesh_id:string}[]>;})
   .then(rows=>{const next=rows.map(r=>({id:r.id,label:r.label,mesh:r.mesh_id}));cache.set(term,next);while(cache.size>100)cache.delete(cache.keys().next().value!);setHits(next);})
   .catch(()=>{/* structures still show without features */});},250);
  return()=>{clearTimeout(t);abort.abort();};
 },[term]);
 return hits;
}
