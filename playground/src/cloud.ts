import { createClient } from '@supabase/supabase-js'
import type { Anchor } from './api'
const url=import.meta.env.VITE_SUPABASE_URL?.trim(),key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
if(key?.startsWith('sb_secret_'))throw new Error('A private Supabase key must never be used in the browser.')
if(key?.startsWith('eyJ')){try{if(JSON.parse(atob(key.split('.')[1])).role!=='anon')throw new Error('Only a publishable or anon key is allowed.')}catch{throw new Error('Invalid browser key configuration.')}}
export const cloud=url&&key&&!url.includes('YOUR_PROJECT')?createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null
export interface Landmark { id:string;mesh_id:string;label:string;latin_name:string;description:string;published_proposal:string|null }
export interface Proposal extends Anchor { id:string;landmark_id:string;mesh_id:string;label:string;latin_name:string;description:string;geometry:string;author_id:string|null;supersedes:string|null;status:string;created_at:string;pg_profiles?:{display_name:string}|null }
export interface Comment { id:string;body:string;author_id:string;created_at:string;pg_profiles:{display_name:string}|null }
export interface Draft { meshId:string;landmarkId:string|null;supersedes:string|null;label:string;latin:string;description:string;anchor:Anchor|null;requestId:string;geometry:string }
export interface Vote { upvotes:number;downvotes:number;mine:number }
export async function rpc<T=unknown>(name:string,args:Record<string,unknown>={}):Promise<T> {
 if(!cloud)throw new Error('Online contributions are not configured for this preview.')
 const {data,error}=await cloud.rpc(name,args);if(error)throw new Error(error.message);return data as T
}
export async function checklist(mesh:string):Promise<Landmark[]> {
 if(!cloud){const r=await fetch('/playground-seed.json');if(!r.ok)return[];const seed=await r.json();return seed.landmarks.filter((l:Landmark)=>l.mesh_id===mesh)}
 const all:Landmark[]=[]
 for(let offset=0;;offset+=500){const {data,error}=await cloud.from('pg_landmarks').select('id,mesh_id,label,latin_name,description,published_proposal').eq('mesh_id',mesh).eq('archived',false).order('id').range(offset,offset+499);if(error)throw new Error(error.message);all.push(...data);if(data.length<500)return all}
}
/** Landmarks and published pins per structure, for the structure finder. Read-only. */
export async function structureCounts():Promise<Record<string,{landmarks:number;published:number}>> {
 const count=(rows:{mesh_id:string|null;published_proposal:string|null}[])=>{const result:Record<string,{landmarks:number;published:number}>={};for(const r of rows){if(!r.mesh_id)continue;const c=result[r.mesh_id]??={landmarks:0,published:0};c.landmarks++;if(r.published_proposal)c.published++}return result}
 if(!cloud){const r=await fetch('/playground-seed.json');return r.ok?count((await r.json()).landmarks):{}}
 const all:{mesh_id:string|null;published_proposal:string|null}[]=[]
 for(let offset=0;;offset+=1000){const {data,error}=await cloud.from('pg_landmarks').select('mesh_id,published_proposal').eq('archived',false).order('id').range(offset,offset+999);if(error)throw new Error(error.message);all.push(...data);if(data.length<1000)return count(all)}
}
export async function placements(mesh:string,landmark?:string):Promise<Proposal[]> {
 if(!cloud){const r=await fetch('/playground-seed.json');if(!r.ok)return[];const seed=await r.json();return seed.proposals.filter((p:Proposal)=>p.mesh_id===mesh&&(!landmark||p.landmark_id===landmark))}
 const all:Proposal[]=[]
 for(let offset=0;;offset+=500){let q=cloud.from('pg_proposals').select('id,landmark_id,mesh_id,label,latin_name,description,geometry,triangle,u,v,author_id,supersedes,status,created_at,pg_profiles(display_name)').eq('mesh_id',mesh).eq('status','community');if(landmark)q=q.eq('landmark_id',landmark)
 const {data,error}=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+499);if(error)throw new Error(error.message);all.push(...data as unknown as Proposal[]);if(data.length<500)return all
 // Fetch each selected structure only. UI renders one alternative per landmark.
 }
}
export async function votes(ids:string[]):Promise<Record<string,Vote>> {
 if(!cloud||!ids.length)return{}
 const result:Record<string,Vote>={}
 for(let i=0;i<ids.length;i+=200){const part=ids.slice(i,i+200);const counts=await rpc<{proposal_id:string;upvotes:number;downvotes:number}[]>('pg_vote_totals',{p_ids:part});for(const c of counts)result[c.proposal_id]={upvotes:Number(c.upvotes),downvotes:Number(c.downvotes),mine:0}
 const {data:{session}}=await cloud.auth.getSession();if(session){const {data,error}=await cloud.from('pg_votes').select('proposal_id,value').in('proposal_id',part);if(error)throw new Error(error.message);for(const v of data)if(result[v.proposal_id])result[v.proposal_id].mine=v.value}}
 return result
}
export async function comments(id:string,before?:string):Promise<Comment[]> {
 if(!cloud)return[]
 let q=cloud.from('pg_comments').select('id,body,author_id,created_at,pg_profiles(display_name)').eq('proposal_id',id).eq('hidden',false).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30)
 if(before)q=q.lt('created_at',before)
 const {data,error}=await q;if(error)throw new Error(error.message);return data as unknown as Comment[]
}
export function saveDraft(draft:Draft|null){try{if(draft)sessionStorage.setItem('anatomygo.playground.draft',JSON.stringify(draft));else sessionStorage.removeItem('anatomygo.playground.draft')}catch{/* Saving still works when browser storage is unavailable. */}}
export function restoreDraft():Draft|null {try{return JSON.parse(sessionStorage.getItem('anatomygo.playground.draft')??'null')}catch{return null}}
export async function submit(d:Draft):Promise<string> {
 if(!d.anchor)throw new Error('Place the pin on the structure first.')
 return rpc<string>('pg_submit',{p_request:d.requestId,p_landmark:d.landmarkId,p_mesh:d.meshId,p_label:d.label,p_latin:d.latin,p_description:d.description,p_geometry:d.geometry,p_triangle:d.anchor.triangle,p_u:d.anchor.u,p_v:d.anchor.v,p_supersedes:d.supersedes})
}
/** Pages of this origin tell each other about a finished sign-in on this channel. */
export const AUTH_CHANNEL='anatomygo-auth'
/**
 * Google sign-in. On a desktop it runs in a small window, so the page and any unsaved pin stay as they are; the window
 * lands on /playground/?auth=popup (already an allowed redirect), finishes the sign-in and closes. Phones, and browsers
 * that block the window, use the usual full-page redirect back to the structure.
 */
export async function signInWithGoogle(structure:string):Promise<'popup'|'redirect'> {
 if(!cloud)throw new Error('Online contributions are not configured for this preview.')
 const back=location.origin+`/playground/?structure=${encodeURIComponent(structure)}`
 const w=480,h=640,popup=matchMedia('(pointer: coarse)').matches?null:window.open('','anatomygo-google',`popup,width=${w},height=${h},left=${Math.round(screenX+(outerWidth-w)/2)},top=${Math.round(screenY+(outerHeight-h)/2)}`)
 if(!popup){const {error}=await cloud.auth.signInWithOAuth({provider:'google',options:{redirectTo:back}});if(error)throw new Error(error.message);return 'redirect'}
 try{popup.document.title='Sign in · AnatomyGo';popup.document.body.style.cssText='margin:0;display:grid;place-items:center;height:100vh;font:14px -apple-system,sans-serif;color:#68727d';popup.document.body.textContent='Opening Google…'}catch{/* cosmetic only */}
 const {data,error}=await cloud.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/playground/?auth=popup',skipBrowserRedirect:true}})
 if(error||!data.url){popup.close();throw new Error(error?.message??'Google sign-in could not start.')}
 popup.location.href=data.url
 return 'popup'
}
