import {useEffect,useMemo,useRef,useState} from 'react';
import type {Atlas} from '../anatomy';
import {track,bucket,queryKind} from '../analytics';
import {rest} from '../supabase-rest';
import {searchTerms,searchText} from '../search-terms';
import {searchIndex,type SearchIndex} from './atlas-index';
import {assemble,type Panel} from './assemble';
import {useFeatures} from './features';
import {match} from './match';
import {recentKeys,starters} from './memory';
import {clean} from './text';

/** Search for the page: the index (built the first time search opens, or when the browser is idle after load), the
 * matched rows, the features call, and the search analytics. The page only opens what is picked. */
export type Platform='website'|'phone';
const LOADING_AFTER=300,QUERY_EVENT_AFTER=600,NO_RESULT_AFTER=1200;

export function useSearch(atlas:Atlas|null,query:string,open:boolean,platform:Platform){
 const [index,setIndex]=useState<SearchIndex|null>(null);
 // Built ahead of time while the browser is idle, so the first keystroke never waits for it.
 useEffect(()=>{
  if(!atlas||index)return;
  if(open){setIndex(searchIndex(atlas));return;}
  const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number;cancelIdleCallback?:(id:number)=>void};
  if(w.requestIdleCallback){const id=w.requestIdleCallback(()=>setIndex(searchIndex(atlas)),{timeout:8000});return()=>w.cancelIdleCallback?.(id);}
  const t=setTimeout(()=>setIndex(searchIndex(atlas)),3000);return()=>clearTimeout(t);
 },[atlas,open,index]);

 // "Search instead for …": the typed text, searched exactly as typed.
 const [literal,setLiteral]=useState('');
 const text=clean(query);
 const matched=useMemo(()=>index&&text?match(index,text,{literal:literal===text}):null,[index,text,literal]);
 const fixed=matched?.rescue?.kind==='typo'?matched.rescue.shown:null;
 const typedTexts=matched&&!matched.short?[...new Set([matched.query.raw.join(' '),matched.query.match.join(' ')])]:[];
 const features=useFeatures(open?typedTexts:[],open?fixed:null);
 // Placeholder rows only when the features call is slow; a quick answer just appears.
 const [slow,setSlow]=useState(false);
 useEffect(()=>{if(features.status!=='loading'){setSlow(false);return;}const t=setTimeout(()=>setSlow(true),LOADING_AFTER);return()=>clearTimeout(t);},[features.status,text]);

 const panel:Panel|null=useMemo(()=>{
  if(!index)return null;
  const recent=recentKeys().map(k=>index.byKey.get(k)).filter((e):e is NonNullable<typeof e>=>!!e);
  const start=starters().map(k=>index.byKey.get(k)).filter((e):e is NonNullable<typeof e>=>!!e);
  return assemble(index,matched,features,{recent,starters:start,loadingShown:slow});
 },[index,matched,features,slow,open]);

 // Analytics. What a query found, once typing pauses and the features call has answered (search_query); a query that
 // found nothing at all, features included (search_no_result); a search closed without a pick (search_abandoned).
 const session=useRef({open:false,picked:false,queried:'',missed:'',abandoned:''});
 const terms=atlas&&text?searchTerms(text,atlas):'';
 useEffect(()=>{
  if(!open||!text||!panel||features.status==='loading')return;
  const t=setTimeout(()=>{
   const s=session.current;if(s.queried===text)return;s.queried=text;
   const count=(kind:string)=>panel.rows.filter(r=>r.kind===kind).length;
   track('search_query',{platform,query_kind:queryKind(text),search_terms:terms,result_count:bucket(panel.nothing?0:panel.rows.length),
    structures:bucket(count('structure')+count('part')),features:bucket(count('feature')),systems:count('system'),rescue:panel.rescueKind});
  },QUERY_EVENT_AFTER);
  return()=>clearTimeout(t);
 },[open,text,panel,features.status]);
 useEffect(()=>{
  if(!open||!panel?.nothing||!text)return;
  const t=setTimeout(()=>{const s=session.current;if(s.missed&&text.startsWith(s.missed))return;s.missed=text;
   track('search_no_result',{platform,query_kind:queryKind(text),count:bucket(text.length),search_terms:terms,search_text:searchText(text)});},NO_RESULT_AFTER);
  return()=>clearTimeout(t);
 },[open,panel?.nothing,text]);
 useEffect(()=>{const s=session.current;
  if(open){if(!s.open){s.open=true;s.picked=false;}return;}
  if(!s.open)return;s.open=false;
  if(!s.picked&&text&&panel&&!panel.nothing&&panel.rows.length&&text!==s.abandoned){s.abandoned=text;track('search_abandoned',{platform,query_kind:queryKind(text),result_count:bucket(panel.rows.length),search_terms:terms});}
 },[open]);

 // Ask for it: once per query. The words go to the team's list (Supabase, private) and to analytics.
 const [asked,setAsked]=useState<Set<string>>(()=>new Set());
 const ask=()=>{
  const words=searchText(text);if(!words||asked.has(text))return;
  setAsked(a=>new Set(a).add(text));
  track('search_ask',{platform,query_kind:queryKind(text),search_text:words});
  rest('rpc/site_search_ask',{body:{p_query:words,p_platform:platform}}).catch(()=>{/* the analytics event still counts it */});
 };

 return {index,matched,panel,features,
  /** Search the typed text exactly, without the correction. */
  searchLiteral:()=>setLiteral(text),
  asked:asked.has(text),ask,
  /** Call when a row is opened, so closing isn't counted as abandoned. */
  picked:()=>{session.current.picked=true;}};
}
