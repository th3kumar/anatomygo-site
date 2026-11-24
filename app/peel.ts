/** The scalpel (Peel tool): pick it up, then double-click (double-tap on a phone) a part to lift it away and see what lies
 * beneath. Peeled parts stay peeled when the scalpel goes down, and come back one by one from the Peeled list, the undo
 * button, or all at once. Design: the Motion film "AnatomyGo · Peel tool" (23 Nov 2026); analytics in docs/peel-tool.md.
 *
 * This module holds the timings and the per-device memory; the scene (app/scene.tsx) draws the lift, and
 * app/peel-ui.tsx the controls. */

/** Seconds, from the film: the lift away, the way back, the hover delay before a part is named, and the gap that still
 * counts as a double-click or double-tap. */
export const PEEL={out:.42,back:.32,nameAfter:.4,lightAfter:.09,doubleMs:450,doubleTapMs:380};

/** What this device remembers about the scalpel: when it first saw the site with the scalpel on it, whether the New card
 * has been shown (and how it ended) and whether the scalpel has ever been used (which also clears the New dot). */
interface Memory{first:number;intro?:'shown'|'tried'|'later';used?:1}
const KEY='anatomygo.peel';
/** Keys an earlier visit leaves behind: a visitor who has any of them has been here before the scalpel shipped. */
const EARLIER=['anatomygo.appearance','anatomygo.home.tips','anatomygo.feedback','anatomygo.playground.visited','anatomygo.about.app','anatomygo.analytics','anatomygo.side'];

function read():Memory|null{try{const v=JSON.parse(localStorage.getItem(KEY)??'null');return v&&typeof v.first==='number'?v:null;}catch{return null;}}
function write(m:Memory):boolean{try{localStorage.setItem(KEY,JSON.stringify(m));return localStorage.getItem(KEY)!==null;}catch{return false;}}

/** Called once per page load. A device seen for the first time is stamped now, or as long ago when an earlier visit left
 * its marks (so returning visitors count as returning from the first day). */
export function peelMemory():Memory{
 const m=read();if(m)return m;
 let earlier=false;try{earlier=EARLIER.some(k=>localStorage.getItem(k)!==null)||Object.keys(localStorage).some(k=>k.startsWith('anatomygo.search'));}catch{}
 const fresh={first:earlier?0:Date.now()};write(fresh);return fresh;
}

/** The New card shows once per device, to new and returning visitors alike (the user's call, 24 Nov 2026: an
 * exception to the first-visit rule in app/coach.ts, made for this one launch card). Never again once it has been shown,
 * nor once the scalpel has been used. Storage that can't be written never shows it, so it can't come back every visit. */
export function introDue(m:Memory){return !m.intro&&!m.used;}
/** For analytics: a device first seen within the last half hour is on its first visit. */
export function visitorKind(m:Memory,now=Date.now()){return now-m.first<30*60*1000?'first':'returning';}
export function markIntro(state:'shown'|'tried'|'later'):boolean{const m=read()??{first:0};return write({...m,intro:state});}
export function markUsed(){const m=read()??{first:0};if(!m.used)write({...m,used:1});}
export function scalpelUsed(){return !!read()?.used;}
