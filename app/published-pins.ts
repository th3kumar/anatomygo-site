import {useEffect,useState} from 'react';
import {parseFeatureShape,type FeatureShape} from '../lib/feature-shape';
import {RestError,missingRpc,rest,supabaseConfig} from './supabase-rest';
import type {OpenFeature} from './structure-card';
/** A pin drawn on an isolated structure. `id` is the feature (landmark) ID, so each feature shows one pin.
 * Community pins are the Playground's unreviewed placements: `proposal` links back to the pin there, and
 * `by` is the contributor's public name, '' when they have none, or null for a starter pin (no author). */
export interface PublishedPin {id:string;label:string;latinName:string;description:string;anchor:{triangle:number;u:number;v:number};shape?:FeatureShape|null;kind?:'published'|'community';proposal?:string;by?:string|null;upvotes?:number;at?:string}
interface Pack {schema:number;meshId:string;geometry:string;pins:PublishedPin[]}
interface Row {id:string;landmark_id:string;label:string;latin_name:string|null;description:string|null;geometry:string;triangle:number;u:number;v:number;shape?:unknown;author_id:string|null;pg_profiles:{display_name:string|null}|null}
const cache=new Map<string,{at:number;pins:PublishedPin[];needsPin:OpenFeature[]}>();
let geometry:Promise<string>|undefined;
function fingerprint(){return geometry??=fetch('/models/playground-geometry.json').then(r=>{if(!r.ok)throw Error('Model metadata unavailable');return r.json()}).then(x=>{const value=(x as {geometry?:unknown}).geometry;if(typeof value!=='string'||value.length!==64)throw Error('Model metadata invalid');return value;}).catch(e=>{geometry=undefined;throw e;});}
const validAnchor=(a:{triangle:number;u:number;v:number}|undefined)=>!!a&&Number.isInteger(a.triangle)&&a.triangle>=0&&Number.isFinite(a.u)&&Number.isFinite(a.v)&&a.u>=0&&a.v>=0&&a.u+a.v<=1;
export function validatePublishedPack(value:unknown,mesh:string,expectedGeometry:string):PublishedPin[]{
 const p=value as Pack;
 if(!p||p.schema!==1||p.meshId!==mesh||p.geometry!==expectedGeometry||!Array.isArray(p.pins)||p.pins.length>100)throw Error('Published pins do not match this model.');
 const ids=new Set<string>();for(const pin of p.pins){if(typeof pin.id!=='string'||ids.has(pin.id)||typeof pin.label!=='string'||typeof pin.description!=='string'||!validAnchor(pin.anchor))throw Error('Published pin data is invalid.');ids.add(pin.id);}
 // A malformed shape is dropped, not fatal: the pin still shows as a point.
 return p.pins.map(pin=>({...pin,shape:parseFeatureShape(pin.shape)}));
}
/** Community pins for the features that have no published pin: the best-voted placement of each (newest on a tie),
 * as the Playground shows first. Placements made on other geometry, or with a malformed anchor, are left out. */
export function communityPins(rows:Row[],totals:{proposal_id:string;upvotes:number;downvotes:number}[],published:Set<string>,expectedGeometry:string):PublishedPin[]{
 const score=new Map(totals.map(t=>[t.proposal_id,{up:Number(t.upvotes),net:Number(t.upvotes)-Number(t.downvotes)}])),best=new Map<string,Row>();
 for(const r of rows){if(published.has(r.landmark_id)||r.geometry!==expectedGeometry||typeof r.label!=='string'||!validAnchor(r))continue;const b=best.get(r.landmark_id);if(!b||(score.get(r.id)?.net??0)>(score.get(b.id)?.net??0))best.set(r.landmark_id,r);}
 return [...best.values()].slice(0,100).map(r=>({id:r.landmark_id,proposal:r.id,label:r.label,latinName:r.latin_name??'',description:r.description??'',anchor:{triangle:r.triangle,u:r.u,v:r.v},shape:parseFeatureShape(r.shape),kind:'community' as const,by:r.author_id?r.pg_profiles?.display_name??'':null,upvotes:score.get(r.id)?.up??0})).sort((a,b)=>a.label.localeCompare(b.label));
}
/** One structure's card, as `pg_card` returns it. */
interface Card {schema:number;meshId:string;geometry:string;pins:(PublishedPin&{kind:'published'|'community'})[];needsPin:{id:string;label:string;latinName:string}[]}
/** The card's pins, checked as the pack is: same model, valid anchors, at most 200; a malformed shape is dropped. */
export function validateCard(value:unknown,mesh:string,expectedGeometry:string):PublishedPin[]{
 const c=value as Card;
 if(!c||c.schema!==1||c.meshId!==mesh||c.geometry!==expectedGeometry||!Array.isArray(c.pins)||c.pins.length>200)throw Error('Pins do not match this model.');
 const ids=new Set<string>(),out:PublishedPin[]=[];
 for(const pin of c.pins){if(typeof pin.id!=='string'||ids.has(pin.id)||typeof pin.label!=='string'||!validAnchor(pin.anchor))continue;ids.add(pin.id);
  out.push({id:pin.id,proposal:pin.proposal,label:pin.label,latinName:pin.latinName??'',description:pin.description??'',anchor:pin.anchor,shape:parseFeatureShape(pin.shape),kind:pin.kind,by:pin.by,upvotes:Number(pin.upvotes)||0,at:pin.at});}
 return [...out.filter(p=>p.kind==='published'),...out.filter(p=>p.kind!=='published').sort((a,b)=>a.label.localeCompare(b.label))];
}
/** Published pins first, then one community pin per remaining feature: one `pg_card` read, or the older four reads
 * until that migration is live. A failed community read leaves the published ones. */
export function useStructurePins(mesh:string|null){
 const [pins,setPins]=useState<PublishedPin[]>([]),[needsPin,setNeedsPin]=useState<OpenFeature[]>([]),[error,setError]=useState('');
 useEffect(()=>{setPins([]);setNeedsPin([]);setError('');if(!mesh||!supabaseConfig())return;
 const cached=cache.get(mesh);if(cached&&Date.now()-cached.at<60000){setPins(cached.pins);setNeedsPin(cached.needsPin);return;}
 let live=true;const abort=new AbortController(),signal=abort.signal;
 Promise.all([fingerprint(),rest<unknown>('rpc/pg_card',{body:{p_mesh:mesh},signal}).catch(e=>{if(missingRpc(e))return null;throw e;})])
  .then(([g,card])=>card?{pins:validateCard(card,mesh,g),needsPin:openFeatures((card as Card).needsPin)}:olderReads(mesh,g,signal))
  .then(next=>{if(!live)return;cache.set(mesh,{at:Date.now(),...next});while(cache.size>30)cache.delete(cache.keys().next().value!);setPins(next.pins);setNeedsPin(next.needsPin);})
  .catch(e=>{if(live&&!signal.aborted)setError(e instanceof RestError||e.name==='TypeError'?'Pins couldn’t load. Check your connection.':e.message);});
 return()=>{live=false;abort.abort();};
 },[mesh]);
 return {pins,needsPin,error};
}
/** Features with no placement yet, by name (at most 200). */
const openFeatures=(list:unknown):OpenFeature[]=>Array.isArray(list)?list.filter(f=>f&&typeof f.id==='string'&&typeof f.label==='string').slice(0,200).map(f=>({id:f.id,label:f.label,latinName:typeof f.latinName==='string'?f.latinName:''})):[];
async function olderReads(mesh:string,g:string,signal:AbortSignal):Promise<{pins:PublishedPin[];needsPin:OpenFeature[]}>{
 const features=rest<{id:string;label:string;latin_name:string}[]>(`pg_landmarks?select=id,label,latin_name&mesh_id=eq.${encodeURIComponent(mesh)}&archived=eq.false&order=label&limit=1000`,{signal}).catch(e=>{if(signal.aborted)throw e;return [];});
 const rows=rest<Row[]>(`pg_proposals?select=id,landmark_id,label,latin_name,description,geometry,triangle,u,v,shape,author_id,pg_profiles(display_name)&mesh_id=eq.${encodeURIComponent(mesh)}&status=eq.community&order=created_at.desc,id&limit=500`,{signal}).catch(e=>{if(signal.aborted)throw e;return [] as Row[];});
 const [pack,list]=await Promise.all([rest('rpc/pg_published_pack',{body:{p_mesh:mesh},signal}),rows]);
 const published=validatePublishedPack(pack,mesh,g).map(p=>({...p,kind:'published' as const})),done=new Set(published.map(p=>p.id));
 const open=list.filter(r=>!done.has(r.landmark_id)).map(r=>r.id).slice(0,500);
 const totals=open.length?await rest<{proposal_id:string;upvotes:number;downvotes:number}[]>('rpc/pg_vote_totals',{body:{p_ids:open},signal}).catch(e=>{if(signal.aborted)throw e;return [];}):[];
 const pins=[...published,...communityPins(list,totals,done,g)],placed=new Set([...pins.map(x=>x.id),...list.map(r=>r.landmark_id)]);
 return {pins,needsPin:openFeatures((await features).filter(f=>!placed.has(f.id)).map(f=>({id:f.id,label:f.label,latinName:f.latin_name})))};
}
