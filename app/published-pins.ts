import {useEffect,useState} from 'react';
/** A pin drawn on an isolated structure. `id` is the feature (landmark) ID, so each feature shows one pin.
 * Community pins are the Playground's unreviewed placements: `proposal` links back to the pin there, and
 * `by` is the contributor's public name, '' when they have none, or null for a starter pin (no author). */
export interface PublishedPin {id:string;label:string;latinName:string;description:string;anchor:{triangle:number;u:number;v:number};kind?:'published'|'community';proposal?:string;by?:string|null;upvotes?:number}
interface Pack {schema:number;meshId:string;geometry:string;pins:PublishedPin[]}
interface Row {id:string;landmark_id:string;label:string;latin_name:string|null;description:string|null;geometry:string;triangle:number;u:number;v:number;author_id:string|null;pg_profiles:{display_name:string|null}|null}
const cache=new Map<string,{at:number;pins:PublishedPin[]}>();
let geometry:Promise<string>|undefined;
function fingerprint(){return geometry??=fetch('/models/playground-geometry.json').then(r=>{if(!r.ok)throw Error('Model metadata unavailable');return r.json()}).then(x=>{const value=(x as {geometry?:unknown}).geometry;if(typeof value!=='string'||value.length!==64)throw Error('Model metadata invalid');return value;}).catch(e=>{geometry=undefined;throw e;});}
const validAnchor=(a:{triangle:number;u:number;v:number}|undefined)=>!!a&&Number.isInteger(a.triangle)&&a.triangle>=0&&Number.isFinite(a.u)&&Number.isFinite(a.v)&&a.u>=0&&a.v>=0&&a.u+a.v<=1;
export function validatePublishedPack(value:unknown,mesh:string,expectedGeometry:string):PublishedPin[]{
 const p=value as Pack;
 if(!p||p.schema!==1||p.meshId!==mesh||p.geometry!==expectedGeometry||!Array.isArray(p.pins)||p.pins.length>100)throw Error('Published pins do not match this model.');
 const ids=new Set<string>();for(const pin of p.pins){if(typeof pin.id!=='string'||ids.has(pin.id)||typeof pin.label!=='string'||typeof pin.description!=='string'||!validAnchor(pin.anchor))throw Error('Published pin data is invalid.');ids.add(pin.id);}
 return p.pins;
}
/** Community pins for the features that have no published pin: the best-voted placement of each (newest on a tie),
 * as the Playground shows first. Placements made on other geometry, or with a malformed anchor, are left out. */
export function communityPins(rows:Row[],totals:{proposal_id:string;upvotes:number;downvotes:number}[],published:Set<string>,expectedGeometry:string):PublishedPin[]{
 const score=new Map(totals.map(t=>[t.proposal_id,{up:Number(t.upvotes),net:Number(t.upvotes)-Number(t.downvotes)}])),best=new Map<string,Row>();
 for(const r of rows){if(published.has(r.landmark_id)||r.geometry!==expectedGeometry||typeof r.label!=='string'||!validAnchor(r))continue;const b=best.get(r.landmark_id);if(!b||(score.get(r.id)?.net??0)>(score.get(b.id)?.net??0))best.set(r.landmark_id,r);}
 return [...best.values()].slice(0,100).map(r=>({id:r.landmark_id,proposal:r.id,label:r.label,latinName:r.latin_name??'',description:r.description??'',anchor:{triangle:r.triangle,u:r.u,v:r.v},kind:'community' as const,by:r.author_id?r.pg_profiles?.display_name??'':null,upvotes:score.get(r.id)?.up??0})).sort((a,b)=>a.label.localeCompare(b.label));
}
/** Published pins first, then one community pin per remaining feature. A failed community read leaves the published ones. */
export function useStructurePins(mesh:string|null){
 const [pins,setPins]=useState<PublishedPin[]>([]),[error,setError]=useState('');
 useEffect(()=>{setPins([]);setError('');if(!mesh)return;const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return;
 const cached=cache.get(mesh);if(cached&&Date.now()-cached.at<60000){setPins(cached.pins);return;}
 let live=true;const abort=new AbortController();
 const rest=<R,>(path:string,body?:unknown)=>fetch(`${url}/rest/v1/${path}`,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Pins could not be loaded.');return r.json() as Promise<R>;});
 const rows=rest<Row[]>(`pg_proposals?select=id,landmark_id,label,latin_name,description,geometry,triangle,u,v,author_id,pg_profiles(display_name)&mesh_id=eq.${encodeURIComponent(mesh)}&status=eq.community&order=created_at.desc,id&limit=500`).catch(e=>{if(e.name==='AbortError')throw e;return [] as Row[];});
 Promise.all([fingerprint(),rest('rpc/pg_published_pack',{p_mesh:mesh}),rows]).then(async([g,pack,rows])=>{
  const published=validatePublishedPack(pack,mesh,g).map(p=>({...p,kind:'published' as const})),done=new Set(published.map(p=>p.id));
  const open=rows.filter(r=>!done.has(r.landmark_id)).map(r=>r.id).slice(0,500);
  const totals=open.length?await rest<{proposal_id:string;upvotes:number;downvotes:number}[]>('rpc/pg_vote_totals',{p_ids:open}).catch(e=>{if(e.name==='AbortError')throw e;return [];}):[];
  const next=[...published,...communityPins(rows,totals,done,g)];if(!live)return;
  cache.set(mesh,{at:Date.now(),pins:next});while(cache.size>30)cache.delete(cache.keys().next().value!);setPins(next);
 }).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);});
 return()=>{live=false;abort.abort();};
 },[mesh]);
 return {pins,error};
}
