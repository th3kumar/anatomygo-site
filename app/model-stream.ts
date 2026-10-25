import {MeshoptDecoder} from 'meshoptimizer/decoder';
import {decodeModelResponse} from './model-download';
import type {Atlas} from './anatomy';

/** The streaming copy of the model (scripts/build-stream.mjs): the canonical parts re-packed from the outside in and
 * compressed with meshoptimizer's lossless codecs. Every part decodes to exactly the canonical bytes; the build checks it. */
export type Tier='outer'|'inner'|'hidden';
export interface StreamManifest {version:1;geometry:string;atlas:string;atlasFingerprint:string;encoder:string;chunks:{url:string;gzip:string;bytes:number;gzipBytes:number;tier:Tier}[];parts:[chunk:number,offset:number,positions:number,normals:number,indices:number][]}
export interface PartData {index:number;positions:Float32Array;normals:Int16Array;indices:Uint32Array}

let manifest:Promise<StreamManifest|null>|undefined;
/** Starts fetching the stream manifest and the decoder alongside the catalogue. Resolves to null when this browser or
 * host can't use the stream, and the viewer then loads the canonical chunks as before. */
export function preloadStream(){
 return manifest??=(async()=>{
  if(typeof WebAssembly!=='object'||typeof DecompressionStream==='undefined')return null;
  const [m]=await Promise.all([fetch('/models/stream/stream.json').then(r=>r.ok?r.json() as Promise<StreamManifest>:null),MeshoptDecoder.ready]);
  return m&&m.version===1&&MeshoptDecoder.supported?m:null;
 })().catch(e=>{console.warn('Stream model unavailable; loading the canonical files.',e);return null;});
}

function fnv1a(s:string){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return(h>>>0).toString(16).padStart(8,'0');}

/** Checks that a manifest was built for this catalogue: same part count, every part placed, and matching fingerprint. */
export function matchesAtlas(m:StreamManifest,atlas:Atlas){return m.parts.length===atlas.parts.length&&m.parts.every(p=>Array.isArray(p)&&p.length===5)&&m.atlasFingerprint===fnv1a(atlas.parts.map(p=>`${p.id},${p.vertexCount},${p.indexCount}`).join(';'));}

/** Chunk names carry a hash of their content, so a stored chunk never goes stale. Keeping them in Cache Storage lets a
 * repeat visit skip the server entirely; HTTP caching (max-age=600 on GitHub Pages) would re-check all 32 every visit
 * after ten minutes, one round trip each. Anything the store can't do (private mode, quota, no Cache API) falls back to
 * an ordinary fetch. */
const STORE='anatomygo-model-stream';
let stored=0;
/** How many stream chunks this visit read from Cache Storage instead of the network (for the load analytics). */
export const storedChunks=()=>stored;
let opened:Promise<Cache|null>|undefined,listed:Promise<Set<string>>|undefined;
const store=()=>opened??=typeof caches==='undefined'?Promise.resolve(null):caches.open(STORE).catch(()=>null);
/** The stored chunk URLs, listed once per visit, so a first visit downloads every chunk at once instead of asking the
 * store about each one first (which cost seconds on a slow phone). */
const storedUrls=()=>listed??=store().then(async s=>s?new Set((await s.keys()).map(r=>r.url)):new Set<string>()).catch(()=>new Set<string>());
/** Drops stored chunks the current manifest no longer lists (an earlier model build). */
export async function pruneStore(m:StreamManifest){
 try{const s=await store();if(!s)return;const keep=new Set(m.chunks.map(c=>new URL(c.gzip,location.href).href));for(const url of await storedUrls())if(!keep.has(url))await s.delete(url);}catch{}
}
async function chunkBytes(url:string,bytes:number,signal:AbortSignal){
 const s=await store(),href=new URL(url,location.href).href;
 if(s&&(await storedUrls()).has(href)){const hit=await s.match(href).catch(()=>undefined);if(hit){try{const b=await decodeModelResponse(hit,bytes,true);stored++;return b;}catch{await s.delete(href).catch(()=>false);}}}
 const response=await fetch(url,{signal});
 if(s&&response.ok)s.put(url,response.clone()).catch(()=>{});
 return decodeModelResponse(response,bytes,true);
}

/** Loads one stream chunk (stored or downloaded) and decodes its parts into the same arrays the canonical chunks give. */
export async function loadStreamChunk(m:StreamManifest,atlas:Atlas,chunk:number,signal:AbortSignal):Promise<PartData[]>{
 const c=m.chunks[chunk],buffer=new Uint8Array(await chunkBytes(c.gzip,c.bytes,signal));
 const out:PartData[]=[];
 m.parts.forEach(([ci,offset,lp,ln,li],index)=>{
  if(ci!==chunk)return;
  const n=atlas.parts[index].vertexCount,count=atlas.parts[index].indexCount;
  const positions=new Float32Array(n*3),padded=new Int16Array(n*4),indices=new Uint32Array(count);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(positions.buffer),n,12,buffer.subarray(offset,offset+lp));
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(padded.buffer),n,8,buffer.subarray(offset+lp,offset+lp+ln));
  MeshoptDecoder.decodeIndexSequence(new Uint8Array(indices.buffer),count,4,buffer.subarray(offset+lp+ln,offset+lp+ln+li));
  // Normals were padded from 3 to 4 shorts for the codec; drop the padding to get the canonical layout back.
  const normals=new Int16Array(n*3);for(let v=0;v<n;v++){normals[v*3]=padded[v*4];normals[v*3+1]=padded[v*4+1];normals[v*3+2]=padded[v*4+2];}
  out.push({index,positions,normals,indices});
 });
 return out;
}
