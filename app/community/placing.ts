import type {Session} from '@supabase/supabase-js';
import type {Anchor} from '../draft-pin-layer';
import {cloud,rpc} from './cloud';
import {rest} from '../supabase-rest';
import {track,bucket} from '../analytics';

/** A pin being placed, then saved (films K7–K10). Every suggestion is a point: lines and areas belong to reviewed pins.
 * `kind`: a feature's first pin, a new spot for a pinned feature (correction), or a part that isn't listed (new). */
export interface Draft {request:string;mesh:string;kind:'first_pin'|'correction'|'new';landmark:string|null;supersedes:string|null;
 label:string;latin:string;description:string;anchor:Anchor|null;note:string}
/** What `pg_submit` needs, kept on this device when the visitor is signed out (`anatomygo.drafts`) until sign-in. */
export interface Saved {request:string;mesh:string;kind:Draft['kind'];landmark:string|null;supersedes:string|null;label:string;latin:string;description:string;geometry:string;anchor:Anchor;at:string}

const KEY='anatomygo.drafts';
export function keptDrafts():Saved[]{try{const v=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function keep(list:Saved[]){try{if(list.length)localStorage.setItem(KEY,JSON.stringify(list));else localStorage.removeItem(KEY);}catch{/* private mode: the pin lasts this visit */}}
export function keepDraft(s:Saved){keep([...keptDrafts().filter(x=>x.request!==s.request),s]);}
export function dropDraft(request:string){keep(keptDrafts().filter(x=>x.request!==request));}

/** The draft as it will be stored: the note is the description (a correction keeps the pin's own description unless a
 * note replaces it). */
export function toSaved(d:Draft,geometry:string):Saved{
 return {request:d.request,mesh:d.mesh,kind:d.kind,landmark:d.landmark,supersedes:d.supersedes,label:d.label.trim(),latin:d.latin.trim(),
  description:d.note.trim()||d.description,geometry,anchor:d.anchor!,at:new Date().toISOString()};
}

/** A pin needs a public name. It is the Google first name, set without asking; it can be changed in About. */
export async function ensureName(session:Session){
 const c=await cloud(),{data}=await c.from('pg_profiles').select('display_name').eq('id',session.user.id).maybeSingle();if(data)return;
 const meta=session.user.user_metadata??{},name=String(meta.given_name||String(meta.full_name||meta.name||'').split(' ')[0]||'').trim().slice(0,60);
 if(name.length<2)throw Error('Add a first name to your Google account, then try again.');
 await rpc('pg_set_profile',{p_name:name});track('public_name_set',{first:1});
}

/** Sends a saved pin; resolves to the new placement's id. Sending the same request again returns the same pin. */
export async function submit(s:Saved,session:Session):Promise<string>{
 await ensureName(session);
 const id=await rpc<string>('pg_submit',{p_request:s.request,p_landmark:s.landmark,p_mesh:s.mesh,p_label:s.label,p_latin:s.latin,p_description:s.description,
  p_geometry:s.geometry,p_triangle:s.anchor.triangle,p_u:s.anchor.u,p_v:s.anchor.v,p_supersedes:s.supersedes});
 track('pin_saved',{kind:s.kind,has_latin:s.latin?1:0,description:bucket(s.description.length)});
 return id;
}

/** Triangles of a structure that can't hold a pin (read once per structure). */
const invalid=new Map<string,Promise<number[]>>();
export function unusable(mesh:string){
 return invalid.get(mesh)??invalid.set(mesh,rest<{invalid_triangles:number[]}[]>(`pg_structures?select=invalid_triangles&id=eq.${encodeURIComponent(mesh)}`).then(r=>r[0]?.invalid_triangles??[]).catch(()=>{invalid.delete(mesh);return [];})).get(mesh)!;
}
