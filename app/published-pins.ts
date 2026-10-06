import {useEffect,useState} from 'react';
export interface PublishedPin {id:string;label:string;latinName:string;description:string;anchor:{triangle:number;u:number;v:number}}
interface Pack {schema:number;meshId:string;geometry:string;pins:PublishedPin[]}
const cache=new Map<string,{at:number;pins:PublishedPin[]}>();
let geometry:Promise<string>|undefined;
function fingerprint(){return geometry??=fetch('/models/playground-geometry.json').then(r=>{if(!r.ok)throw Error('Model metadata unavailable');return r.json()}).then(x=>{const value=(x as {geometry?:unknown}).geometry;if(typeof value!=='string'||value.length!==64)throw Error('Model metadata invalid');return value;}).catch(e=>{geometry=undefined;throw e;});}
export function validatePublishedPack(value:unknown,mesh:string,expectedGeometry:string):PublishedPin[]{
 const p=value as Pack;
 if(!p||p.schema!==1||p.meshId!==mesh||p.geometry!==expectedGeometry||!Array.isArray(p.pins)||p.pins.length>100)throw Error('Published pins do not match this model.');
 const ids=new Set<string>();for(const pin of p.pins){const a=pin.anchor;if(typeof pin.id!=='string'||ids.has(pin.id)||typeof pin.label!=='string'||typeof pin.description!=='string'||!a||!Number.isInteger(a.triangle)||a.triangle<0||!Number.isFinite(a.u)||!Number.isFinite(a.v)||a.u<0||a.v<0||a.u+a.v>1)throw Error('Published pin data is invalid.');ids.add(pin.id);}
 return p.pins;
}
export function usePublishedPins(mesh:string|null){
 const [pins,setPins]=useState<PublishedPin[]>([]),[error,setError]=useState('');
 useEffect(()=>{setPins([]);setError('');if(!mesh)return;const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return;
 const cached=cache.get(mesh);if(cached&&Date.now()-cached.at<60000){setPins(cached.pins);return;}
 let live=true;const abort=new AbortController();
 Promise.all([fingerprint(),fetch(`${url}/rest/v1/rpc/pg_published_pack`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_mesh:mesh}),signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Published pins could not be loaded.');return r.json();})]).then(([g,p])=>{const next=validatePublishedPack(p,mesh,g);if(!live)return;cache.set(mesh,{at:Date.now(),pins:next});while(cache.size>30)cache.delete(cache.keys().next().value!);setPins(next);}).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);});
 return()=>{live=false;abort.abort();};
 },[mesh]);
 return {pins,error};
}
