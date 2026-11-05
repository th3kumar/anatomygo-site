/** What search remembers on this device: recent picks, the side used last, and the visit's Start with order. Storage
 * can be missing or full (private windows, blocked site data): every read falls back and every write may fail quietly. */
import type {Side} from './text';

const RECENT='anatomygo.search.recent',SIDE='anatomygo.side',STARTER_ORDER='anatomygo.starters';

/** Row keys of the structures picked last, newest first. */
export function recentKeys():string[]{
 try{const v=JSON.parse(localStorage.getItem(RECENT)??'[]');return Array.isArray(v)?v.filter((k):k is string=>typeof k==='string').slice(0,5):[];}catch{return [];}
}
export function remember(key:string){
 try{localStorage.setItem(RECENT,JSON.stringify([key,...recentKeys().filter(k=>k!==key)].slice(0,5)));}catch{/* not remembered */}
}

/** Paired structures open the side used last; the right until one is picked. */
export function lastSide():Side{try{return localStorage.getItem(SIDE)==='left'?'left':'right';}catch{return 'right';}}
export function rememberSide(side:Side){try{localStorage.setItem(SIDE,side);}catch{/* not remembered */}}

// Search's Start with list. While SHUFFLE_STARTERS is on, each visit gets its own order (kept for the whole visit), so
// picks can be split into the pull of the row and the pull of the structure (`index`, the row, and `structure_id` on
// structure_selected). Turn it off two weeks after it goes live (about 14 Nov 2026), and fix the order from the data.
export const STARTERS=['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'];
export const SHUFFLE_STARTERS=true;
export function starters(){
 if(!SHUFFLE_STARTERS)return STARTERS;
 try{const kept=JSON.parse(sessionStorage.getItem(STARTER_ORDER)??'null');if(Array.isArray(kept)&&kept.length===STARTERS.length&&STARTERS.every(n=>kept.includes(n)))return kept as string[];}catch{}
 const order=[...STARTERS];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 try{sessionStorage.setItem(STARTER_ORDER,JSON.stringify(order));}catch{}
 return order;
}
