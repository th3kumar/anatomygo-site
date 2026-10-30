import {useEffect,useState} from 'react';
import {rest,supabaseConfig} from './supabase-rest';
/** Parts & features whose name matches a search, read from the public features table (at most 8, from 3 letters on,
 * a moment after typing stops). Each says which piece it is on, so choosing it can open that piece on that feature. */
export interface FeatureHit {id:string;label:string;mesh:string}
const cache=new Map<string,FeatureHit[]>();
export function useFeatureSearch(query:string):FeatureHit[]{
 const term=query.trim().toLowerCase(),[hits,setHits]=useState<FeatureHit[]>([]);
 useEffect(()=>{
  if(term.length<3||!supabaseConfig()){setHits([]);return;}
  const known=cache.get(term);if(known){setHits(known);return;}
  const abort=new AbortController();
  // PostgREST pattern: * is the wildcard; the name's own * , ( ) are dropped so they can't change the query.
  const pattern=encodeURIComponent(`*${term.replace(/[*,()]/g,' ')}*`);
  const t=setTimeout(()=>{rest<{id:string;label:string;mesh_id:string}[]>(`pg_landmarks?select=id,label,mesh_id&archived=eq.false&label=ilike.${pattern}&order=label&limit=8`,{signal:abort.signal})
   .then(rows=>{const next=rows.map(r=>({id:r.id,label:r.label,mesh:r.mesh_id}));cache.set(term,next);while(cache.size>100)cache.delete(cache.keys().next().value!);setHits(next);})
   .catch(()=>{/* structures still show without features */});},250);
  return()=>{clearTimeout(t);abort.abort();};
 },[term]);
 return hits;
}
