/** A pin's link: it opens the structure on its own, on that feature. Older Playground links name the placement
 * instead of the feature; the page accepts both. `share` is the share's own random id (`s`), so the open on the other
 * end can be matched to the share that sent it (pin_shared.share_id = shared_pin_opened.share_id in BigQuery). */
export const pinLink=(structure:string,feature:string,share?:string)=>`${location.origin}/?structure=${encodeURIComponent(structure)}&pin=${encodeURIComponent(feature)}${share?`&s=${share}`:''}`;

/** Copies text to the clipboard; false if the browser refused. */
export async function copy(text:string){
 try{await navigator.clipboard.writeText(text);return true;}catch{/* older or locked-down browsers */}
 try{const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();return ok;}catch{return false;}
}

export type ShareResult='shared'|'cancelled'|'copied'|'failed';

/** Phones open their own share sheet; anything without one (and every desktop) copies the link instead. A closed
 * share sheet is `cancelled`, not a failure. Call it straight from the tap, before any await, or the browser refuses
 * the share sheet for want of a user gesture. */
export async function sharePin(link:string,title:string,useSheet:boolean):Promise<{result:ShareResult;method:'share_sheet'|'copy'}>{
 if(useSheet&&typeof navigator.share==='function'){
  try{await navigator.share({title,text:title,url:link});return {result:'shared',method:'share_sheet'};}
  catch(e){if((e as Error)?.name==='AbortError')return {result:'cancelled',method:'share_sheet'};/* refused: copy instead */}
 }
 return {result:await copy(link)?'copied':'failed',method:'copy'};
}

// A share id is 8 random base-36 characters: short enough to keep the link tidy, random enough never to repeat.
const OWN='anatomygo.shares',OPENED='anatomygo.shares-opened',VIA='anatomygo.via-share',ID=/^[a-z0-9]{6,16}$/;
const read=(s:Storage,key:string):string[]=>{try{const v=JSON.parse(s.getItem(key)??'[]');return Array.isArray(v)?v:[];}catch{return [];}};
const keep=(s:Storage,key:string,id:string)=>{try{s.setItem(key,JSON.stringify([id,...read(s,key).filter(x=>x!==id)].slice(0,50)));}catch{}};

/** A fresh share id, remembered on this device so opening your own link is reported as `own`. */
export function newShare(){
 const b=new Uint8Array(8);crypto.getRandomValues(b);const id=Array.from(b,x=>(x%36).toString(36)).join('');
 try{keep(localStorage,OWN,id);}catch{}
 return id;
}

/** The share this visit arrived through, if any: set when a shared link is opened, so a share made from it names its
 * parent (`parent_share`) and a chain of re-shares can be followed. */
export function viaShare(){try{return sessionStorage.getItem(VIA)??'';}catch{return '';}}

/** The share id in this address (`?s=`), or '' if it has none or it is malformed. */
export function shareInUrl(){const s=new URLSearchParams(location.search).get('s')??'';return ID.test(s)?s:'';}

/** Notes that a shared link was opened and returns what the open event reports: the share id, whether this device
 * made the share (`own`), and whether this tab already reported it (`repeat`: a reload or a restored tab). */
export function openedShare(id:string):Record<string,string|number>{
 if(!id)return {};
 let own=0,repeat=0;
 try{own=read(localStorage,OWN).includes(id)?1:0;}catch{}
 try{repeat=read(sessionStorage,OPENED).includes(id)?1:0;keep(sessionStorage,OPENED,id);sessionStorage.setItem(VIA,id);}catch{}
 return {share_id:id,own,repeat};
}

/** What kind of pin a card shows, for analytics. Same rule as the card's byline: an editor's published pin, a starter
 * pin (no author at all), or one from the community. */
export const pinKind=(p:{kind?:string;by?:string|null})=>p.kind==='published'?'published':p.kind==='draft'?'draft':p.by===null?'starter':'community';
