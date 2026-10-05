import { sha256Hex, type MeshBuffers, type Vec3 } from './geometry'
export interface Anchor { triangle: number; u: number; v: number }
export interface Part { id:string; name:string; conceptId:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; bounds:[Vec3,Vec3] }
export interface Atlas { parts:Part[]; concepts:{id:string;name:string;elements:string[]}[]; chunks:{url:string;bytes:number;gzip?:string}[] }
export interface LoadedMesh { meta: Part & { geometry:string;digest:string }; buffers:MeshBuffers }
export interface GeometryManifest { geometry:string; meshes:Record<string,{digest:string;invalidTriangles:number[]}> }
let catalogue:Promise<Atlas>|null=null, manifest:Promise<GeometryManifest>|null=null
const cache=new Map<string,Promise<LoadedMesh>>()
const chunkCache=new Map<number,Promise<ArrayBuffer>>()
async function json<T>(path:string):Promise<T> { const r=await fetch(path);if(!r.ok)throw new Error('The anatomy data could not be loaded. Please retry.');return r.json() }
export const loadAtlas=()=>catalogue??=json<Atlas>('/models/atlas.json').catch(e=>{catalogue=null;throw e})
export const loadManifest=()=>manifest??=json<GeometryManifest>('/models/playground-geometry.json').catch(e=>{manifest=null;throw e})
export function loadMesh(id:string):Promise<LoadedMesh> {
 const existing=cache.get(id);if(existing)return existing
 const task=(async()=>{
  const [atlas,info]=await Promise.all([loadAtlas(),loadManifest()]);const p=atlas.parts.find(p=>p.id===id)
  if(!p||!info.meshes[id])throw new Error('This structure is not available in the current model.')
  let download=chunkCache.get(p.chunk)
  if(!download){download=(async()=>{
   const chunk=atlas.chunks[p.chunk];const compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined'
   const r=await fetch(compressed?chunk.gzip!:chunk.url);if(!r.ok)throw new Error('The structure could not be downloaded. Please retry.')
   let buffer=await r.arrayBuffer()
   if(compressed&&new Uint8Array(buffer)[0]===31&&new Uint8Array(buffer)[1]===139)buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
   if(buffer.byteLength!==chunk.bytes)throw new Error('The model download is incomplete.')
   return buffer
  })();chunkCache.set(p.chunk,download);download.catch(()=>chunkCache.delete(p.chunk));while(chunkCache.size>3)chunkCache.delete(chunkCache.keys().next().value!)}
  const buffer=await download
  const buffers={positions:new Float32Array(buffer,p.positions,p.vertexCount*3).slice(),normals:new Int16Array(buffer,p.normals,p.vertexCount*3).slice(),indices:new Uint32Array(buffer,p.indices,p.indexCount).slice()}
  const digest=await sha256Hex(buffers.positions,buffers.normals,buffers.indices)
  if(digest!==info.meshes[id].digest)throw new Error('Model version mismatch. Reload before placing a pin.')
  return {meta:{...p,geometry:info.geometry,digest},buffers}
 })();cache.set(id,task);task.catch(()=>cache.delete(id));while(cache.size>8)cache.delete(cache.keys().next().value!);return task
}
export function neighbours(atlas:Atlas,host:Part):Part[] {
 const gap=(p:Part)=>Math.hypot(...[0,1,2].map(k=>Math.max(0,host.bounds[0][k]-p.bounds[1][k],p.bounds[0][k]-host.bounds[1][k])))
 return atlas.parts.filter(p=>p.id!==host.id&&p.system!=='integumentary').map(p=>({p,g:gap(p)})).filter(x=>x.g<.025).sort((a,b)=>a.g-b.g).slice(0,5).map(x=>x.p)
}
