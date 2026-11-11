/** Where the visitor was: the systems shown, the structure open, the feature, the card's tab and the camera. Kept for
 * this tab only (sessionStorage), so a reload, or the browser bringing a closed or sleeping tab back, returns to the
 * same place. A fresh visit, a new tab or a link opened in this tab starts as usual.
 * Why: 4% of visitors keep one tab open for more than a day and do 29% of all pin reading (BigQuery, 2-10 Nov 2026);
 * half of the people who come back pick the same structure again; and a new version only reaches an open tab by a
 * reload (app/update.ts), which must not cost them their place. */
import type {SystemId,View} from './anatomy';

/** The camera over the whole body: where it stands and what it looks at, in model metres. */
export type Pose={pos:[number,number,number];target:[number,number,number]};
export interface Place{visible:SystemId[];view:View;chosen:string|null;selected:string[];isolate:boolean;glass:boolean;pin:string|null;tab:string;focus:Record<string,boolean>;pose:Pose|null}

const KEY='anatomygo.place',VERSION=1;
const triple=(v:unknown):v is [number,number,number]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(s=>typeof s==='string');

/** How this page load began: 'reload' and 'back_forward' (which covers a restored tab) continue a visit; 'navigate' is
 * a new arrival. Browsers without Navigation Timing read as a new arrival. */
export function arrival():string{try{return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'navigate';}catch{return 'navigate';}}

/** The place to return to, or null on a new arrival, when nothing was kept, or when what was kept can't be read. */
export function keptPlace():Place|null{
 if(arrival()==='navigate')return null;
 try{
  const p=JSON.parse(sessionStorage.getItem(KEY)??'null');
  if(!p||p.v!==VERSION||!strings(p.visible)||!strings(p.selected)||typeof p.view!=='string')return null;
  const pose=p.pose&&triple(p.pose.pos)&&triple(p.pose.target)?{pos:p.pose.pos,target:p.pose.target}:null;
  return {visible:p.visible,view:p.view,chosen:typeof p.chosen==='string'?p.chosen:null,selected:p.selected,isolate:p.isolate===true,glass:p.glass===true,pin:typeof p.pin==='string'?p.pin:null,
   tab:typeof p.tab==='string'?p.tab:'about',focus:p.focus&&typeof p.focus==='object'?p.focus:{},pose};
 }catch{return null;}
}

/** Storage can be missing or full (private windows, blocked site data): then the place is simply not kept. */
export function keepPlace(place:Place){try{sessionStorage.setItem(KEY,JSON.stringify({v:VERSION,...place}));}catch{/* not kept */}}
