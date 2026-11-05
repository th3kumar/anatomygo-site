import {useEffect,useState} from 'react';
import {rest,supabaseConfig} from '../supabase-rest';

/** Parts & features (pins) for a query: one call to the pins API per query, from 3 letters on, 150 ms after typing
 * stops, matching the start of a word in the English label or the Latin name. Cached for the visit. When a typo
 * correction is on offer, the same call also asks for the corrected words, so search can tell whether what was typed
 * is a real feature name ("greater", "acetabulum") before showing the correction. */
export interface FeatureHit {id:string;label:string;latin:string;mesh:string}
export interface Features {
 /** idle: under 3 letters. loading: waiting for the call. done: the call answered, failed or timed out. */
 status:'idle'|'loading'|'done';
 /** Hits for the typed words, and for the corrected words when a correction was asked for too. */
 typed:FeatureHit[];fixed:FeatureHit[];
}
const IDLE:Features={status:'idle',typed:[],fixed:[]};
const DELAY=150,TIMEOUT=3000,LIMIT=80;
const cache=new Map<string,Omit<Features,'status'>>();

// PostgREST filters: the start of the label, or of any word in it, for each of the words in order ("greater troch" →
// "greater*troch*" and "* greater*troch*"). Words are letters and digits only, so they can't change the filter.
const patterns=(text:string)=>{const p=text.split(' ').filter(Boolean).join('*')+'*';return [`"${p}"`,`"* ${p}"`];};
const filter=(texts:string[])=>`(${texts.flatMap(patterns).flatMap(p=>[`label.ilike.${p}`,`latin_name.ilike.${p}`]).join(',')})`;
const starts=(text:string,hit:FeatureHit)=>{const re=new RegExp(`(^|\\s)${text.split(' ').map(w=>w.replace(/[^\p{L}\p{N}]/gu,'')).join('.*')}`,'iu');return re.test(hit.label)||re.test(hit.latin);};

/** `typed`: the typed words, and their folded forms when those differ ("lungs", "lung"). `fixed`: a correction on offer. */
export function useFeatures(typed:string[],fixed:string|null):Features{
 const texts=[...new Set(typed.filter(t=>t.replace(/ /g,'').length>=3))];
 const key=texts.length?`${texts.join('/')}|${fixed??''}`:'';
 const [state,setState]=useState<{key:string,value:Features}>({key:'',value:IDLE});
 useEffect(()=>{
  if(!key||!supabaseConfig()){setState({key,value:IDLE});return;}
  const known=cache.get(key);if(known){setState({key,value:{status:'done',...known}});return;}
  setState({key,value:{status:'loading',typed:[],fixed:[]}});
  const abort=new AbortController();
  const done=(value:Omit<Features,'status'>,keep:boolean)=>{if(keep){cache.set(key,value);while(cache.size>150)cache.delete(cache.keys().next().value!);}setState(s=>s.key===key?{key,value:{status:'done',...value}}:s);};
  // A slow connection never keeps search waiting: after 3 s the structures stand on their own.
  const giveUp=setTimeout(()=>{abort.abort();done({typed:[],fixed:[]},false);},DELAY+TIMEOUT);
  const t=setTimeout(()=>{
   const all=[...texts,...(fixed&&!texts.includes(fixed)?[fixed]:[])];
   rest<{id:string;label:string;latin_name:string|null;mesh_id:string}[]>(`pg_landmarks?select=id,label,latin_name,mesh_id&archived=eq.false&or=${encodeURIComponent(filter(all))}&order=label&limit=${LIMIT}`,{signal:abort.signal})
    .then(rows=>{clearTimeout(giveUp);
     const hits=rows.map(r=>({id:r.id,label:r.label,latin:r.latin_name??'',mesh:r.mesh_id}));
     done({typed:hits.filter(h=>texts.some(t=>starts(t,h))),fixed:fixed?hits.filter(h=>starts(fixed,h)):[]},true);})
    .catch(()=>{clearTimeout(giveUp);if(!abort.signal.aborted)done({typed:[],fixed:[]},false);});
  },DELAY);
  return()=>{clearTimeout(t);clearTimeout(giveUp);abort.abort();};
 },[key]);
 return state.key===key?state.value:key?{status:'loading',typed:[],fixed:[]}:IDLE;
}
