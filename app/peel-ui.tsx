/** The scalpel's controls (app/peel.ts), as in the film "AnatomyGo · Peel tool":
 * - desktop: a Scalpel button at the end of the view pill; while it is up it widens and turns mint. Once a part is
 *   peeled, the count ("2 peeled") and an undo grow out of it. The count opens the Peeled list above it, which forms
 *   with guide lines while the page behind dims a little.
 * - phone: a scalpel button between search and Systems (with the count on it while parts are peeled). Tapped, it slides to the start of the row, search and Systems
 *   step out, and the row becomes the scalpel bar (hint, or count and undo, then Done). The count opens a sheet.
 * - the New card: once per device, on a later visit (app/peel.ts introDue). Trying it condenses the card into the
 *   scalpel button, which is picked up as the card lands. */
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,m,useAnimate} from 'motion/react';
import {ChevronUp,RotateCcw,Undo2} from 'lucide-react';
import {tween,reducedMotion} from './motion';
import './peel.css';

export type PeeledItem={id:string;name:string};
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);

export function ScalpelIcon({size=17}:{size?:number}){
 return <svg className="scalpel-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M3 3c5 1.5 9 4.5 12 8.5l-2.6 2.6C8.5 11 5 7.5 3 3Z"/><path d="m13.8 13.8 7.2 7.2"/>
 </svg>;
}

/** The count's number changes in place: the old one fades up and out as the new one rises in. */
function Count({n,suffix=' peeled'}:{n:number,suffix?:string}){
 return <span className="peel-n"><AnimatePresence mode="popLayout" initial={false}><m.span key={n} initial={{opacity:0,y:5}} animate={{opacity:1,y:0,transition:tween('out',.22)}} exit={{opacity:0,y:-5,transition:tween('in',.14)}}>{n}{suffix}</m.span></AnimatePresence></span>;
}

/** Desktop: the end of the view pill. The count keeps showing its last number while it shrinks away. */
export function ScalpelTools({on,count,fresh,listOpen,onToggle,onCount,onUndo}:{on:boolean,count:number,fresh:boolean,listOpen:boolean,onToggle:()=>void,onCount:()=>void,onUndo:()=>void}){
 const last=useRef(count);if(count)last.current=count;
 return <>
  <span className="vsep" aria-hidden="true"/>
  <button type="button" data-scalpel="" className={`vbtn scalpel-btn ${on?'is-on':''}`} onClick={onToggle} aria-pressed={on} aria-label={on?'Put the scalpel down':'Scalpel: peel parts away'} title={on?'Put the scalpel down (Esc)':'Scalpel: double-click a part to peel it'}>
   <ScalpelIcon/><span className="scalpel-label" aria-hidden="true">Scalpel</span>{fresh&&!on&&<span className="new-dot" aria-hidden="true"/>}
  </button>
  <div className={`peel-count ${count?'is-on':''}`} inert={!count}>
   <button type="button" className="vbtn peel-count-btn" onClick={onCount} aria-expanded={listOpen} aria-haspopup="dialog" aria-label={`${last.current} peeled: show the list`}><Count n={last.current}/><ChevronUp size={13}/></button>
   <button type="button" className="vbtn" onClick={onUndo} aria-label="Put back the last part peeled" title="Put back (Ctrl+Z)"><Undo2 size={17}/></button>
  </div>
 </>;
}

/** Desktop: the Peeled list, above the count. Rows in the order they were peeled; putting one back folds its row away. */
export function PeelList({items,onRestore,onAll,onClose}:{items:PeeledItem[],onRestore:(id:string)=>void,onAll:()=>void,onClose:(method:string)=>void}){
 const [at,setAt]=useState<{left:number,bottom:number,top:number,width:number}|null>(null),box=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const place=()=>{const r=document.querySelector('.peel-count')?.getBoundingClientRect();if(!r)return;const w=330,left=Math.max(16,Math.min(innerWidth-w-16,r.left+r.width/2-w/2));setAt({left,bottom:innerHeight-r.top+12,top:r.top,width:w});};
  place();addEventListener('resize',place);return()=>removeEventListener('resize',place);},[]);
 useEffect(()=>{box.current?.focus({preventScroll:true});},[at!==null]);
 if(!at)return null;
 const still=reducedMotion();
 return <>
  <m.div key="dim" className="peel-dim" initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.22)}} exit={{opacity:0,transition:tween('in',.16)}} onClick={()=>onClose('outside')}/>
  {!still&&<div className="peel-guides" aria-hidden="true">
   <i className="guide gy" style={{left:at.left,top:at.top-260,height:250}}/>
   <i className="guide gy" style={{left:at.left+at.width,top:at.top-260,height:250,animationDelay:'.04s'}}/>
  </div>}
  <m.div ref={box} key="list" className="panel peel-list" role="dialog" aria-label="Peeled parts" tabIndex={-1} style={{left:at.left,bottom:at.bottom,width:at.width}}
   initial={{opacity:0,y:6}} animate={{opacity:1,y:0,transition:tween('out',.22,still?0:.09)}} exit={{opacity:0,y:4,transition:tween('in',.14)}}>
   <p className="t-label peel-list-head">Peeled · in order</p>
   <div className="peel-rows">
    <AnimatePresence initial={false}>{items.map((p,i)=><m.div key={p.id} className="peel-row" style={{animationDelay:`${.15+Math.min(i,8)*.05}s`}} exit={{height:0,opacity:0,transition:tween('io',.22)}}>
     <span>{cap(p.name)}</span><button type="button" className="peel-undo" onClick={()=>onRestore(p.id)} aria-label={`Put back ${p.name}`} title="Put back"><Undo2 size={15}/></button>
    </m.div>)}</AnimatePresence>
   </div>
   <div className="peel-list-foot"><button type="button" className="link-mint peel-all" onClick={onAll}><RotateCcw size={15}/>Put all back</button></div>
  </m.div>
 </>;
}

/** Phone: the bottom row as three slots that change in place rather than buttons that come and go. Picking up the
 * scalpel, the search pill narrows into the scalpel (mint), the scalpel widens into the bar's middle (the hint, then
 * the count and undo), and Systems becomes Done; putting it down plays the same swap back. Each slot is one glass pill
 * whose width and tint ease (340 ms) while its old content fades out and the new one fades in, so nothing jumps.
 * `search` and `systems` are the row's usual controls. */
const SLOT={scalpel:54,systems:116,done:80,gap:8};
export function PhoneScalpelRow({on,count,fresh,search,systems,onToggle,onCount,onUndo,onDone}:{on:boolean,count:number,fresh:boolean,search:ReactNode,systems:ReactNode,onToggle:()=>void,onCount:()=>void,onUndo:()=>void,onDone:()=>void}){
 const row=useRef<HTMLDivElement>(null),[w,setW]=useState(0),last=useRef(count);if(count)last.current=count;
 useLayoutEffect(()=>{const el=row.current;if(!el)return;const measure=()=>setW(el.clientWidth);measure();const o=new ResizeObserver(measure);o.observe(el);return()=>o.disconnect();},[]);
 const wide=(right:number)=>Math.max(SLOT.scalpel,w-SLOT.scalpel-right-2*SLOT.gap);
 const widths=w?(on?[SLOT.scalpel,wide(SLOT.done),SLOT.done]:[wide(SLOT.systems),SLOT.scalpel,SLOT.systems]):null;
 const slot=(i:number)=>widths?{width:widths[i]}:i===0?{flex:1}:{width:i===1?SLOT.scalpel:SLOT.systems};
 // A layer is the slot's content in one state: shown, or faded out and out of reach.
 const layer=(shown:boolean)=>({className:`morph-layer ${shown?'is-shown':''}`,inert:!shown,'aria-hidden':!shown||undefined});
 const hinted=on&&!count;
 return <div ref={row} className={`bottom-row morph-row ${on?'is-scalpel':''}`}>
  <div className={`morph-slot ${on?'is-mint':''}`} style={slot(0)}>
   <div {...layer(!on)}>{search}</div>
   <div {...layer(on)}><button type="button" data-scalpel={on?'':undefined} className="morph-btn scalpel-phone is-on" onClick={onToggle} aria-pressed="true" aria-label="Put the scalpel down"><ScalpelIcon size={20}/></button></div>
  </div>
  <div className="morph-slot" style={slot(1)}>
   <div {...layer(!on)}><button type="button" data-scalpel={on?undefined:''} className="morph-btn scalpel-phone" onClick={onToggle} aria-pressed="false" aria-label={count?`Scalpel: ${count} peeled`:'Scalpel: peel parts away'}><ScalpelIcon size={20}/></button></div>
   <div {...layer(hinted)}><p className="morph-btn row-hint">Double-tap a part to peel it</p></div>
   <div {...layer(on&&count>0)}><div className="row-count">
    <button type="button" className="morph-btn peel-count-phone" onClick={onCount} aria-haspopup="dialog" aria-label={`${last.current} peeled: show the list`}><Count n={last.current}/><ChevronUp size={14}/></button>
    <span className="row-count-sep" aria-hidden="true"/>
    <button type="button" className="morph-btn peel-undo-phone" onClick={onUndo} aria-label="Put back the last part peeled"><Undo2 size={18}/></button>
   </div></div>
   {!on&&count>0?<span className="peel-badge" aria-hidden="true">{count}</span>:fresh&&!on&&<span className="new-dot" aria-hidden="true"/>}
  </div>
  <div className="morph-slot" style={slot(2)}>
   <div {...layer(!on)}>{systems}</div>
   <div {...layer(on)}><button type="button" className="morph-btn scalpel-done" onClick={onDone}>Done</button></div>
  </div>
 </div>;
}

/** Phone: the Peeled sheet. A guide line marks its top edge, then it rises (360 ms) and its rows settle. */
export function PeelSheet({items,onRestore,onAll,onClose}:{items:PeeledItem[],onRestore:(id:string)=>void,onAll:()=>void,onClose:(method:string)=>void}){
 const still=reducedMotion();
 return <>
  <m.div key="scrim" className="sheet-scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={tween('out',.22)} onClick={()=>onClose('outside')}/>
  {!still&&<i key="guide" className="guide gx peel-sheet-guide" aria-hidden="true"/>}
  <m.section key="sheet" className="sheet peel-sheet" role="dialog" aria-label="Peeled parts" initial={{y:'100%'}} animate={{y:0,transition:tween('out',.36,still?0:.06)}} exit={{y:'100%',transition:tween('in',.22)}}
   drag="y" dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.6}} onDragEnd={(_,i)=>{if(i.offset.y>80||i.velocity.y>500)onClose('drag');}}>
   <span className="grab" aria-hidden="true"/>
   <div className="peel-sheet-head"><h2 className="t-body peel-sheet-title">Peeled · {items.length}</h2><button type="button" className="link-mint peel-all" onClick={onAll}>Put all back</button></div>
   <div className="peel-rows">
    <AnimatePresence initial={false}>{items.map((p,i)=><m.div key={p.id} className="peel-row tile" style={{animationDelay:`${.3+Math.min(i,6)*.05}s`}} exit={{height:0,opacity:0,marginTop:0,transition:tween('io',.22)}}>
     <span>{cap(p.name)}</span><button type="button" className="peel-undo" onClick={()=>onRestore(p.id)} aria-label={`Put back ${p.name}`}><Undo2 size={16}/></button>
    </m.div>)}</AnimatePresence>
   </div>
   <button type="button" className="btn-accent peel-keep" onClick={()=>onClose('keep')}>Keep dissecting</button>
  </m.section>
 </>;
}

/** The New card. It forms in the middle with guide lines while the page steps back; Try condenses it into the scalpel
 * button and Later (or Esc, or a click outside) lets it go. `onTry` picks the scalpel up and `onDone` removes the card
 * once it has landed. The two are timed apart so the control is ready under the card as it arrives:
 * - desktop (620 ms flight): the scalpel is picked up 140 ms before landing, as the button widens under the card, and
 *   the card fades as it lands;
 * - phone (900 ms flight): the bar forms while the card is still in the air (the scalpel slides to the start of the row,
 *   search and Systems step out), and the card lands on the scalpel's new place, dissolving into it as it arrives, so
 *   nothing moves after it lands. */
export function PeelIntro({phone,onTry,onDone,onLater}:{phone:boolean,onTry:()=>void,onDone:()=>void,onLater:(method:string)=>void}){
 const [scope,animate]=useAnimate<HTMLDivElement>(),[leaving,setLeaving]=useState(false);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!leaving){e.stopImmediatePropagation();onLater('escape');}};addEventListener('keydown',key,{capture:true});return()=>removeEventListener('keydown',key,{capture:true});},[leaving,onLater]);
 const tryIt=async()=>{if(leaving)return;setLeaving(true);
  const card=scope.current,button=[...document.querySelectorAll<HTMLElement>('[data-scalpel]')].find(e=>e.offsetParent!==null),r=button?.getBoundingClientRect();
  if(!card||!r||reducedMotion()){onTry();onDone();return;}
  // Where the scalpel will be once it is up. Desktop: the button widens about its centre (44 → 108 px). Phone: it moves
  // to the start of the bottom row, at its own size.
  const row=phone?button!.closest('.bottom-row')?.getBoundingClientRect():null;
  const target=phone?{left:row?.left??r.left,top:r.top,width:r.width,height:r.height,radius:16}:{left:r.left-32,top:r.top,width:r.width+64,height:r.height,radius:r.height/2};
  const from=card.getBoundingClientRect(),flight=phone?.9:.62,pickUp=phone?.32:.48;
  // Fixed at its own place first, so the move starts exactly where the card is.
  Object.assign(card.style,{position:'fixed',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,margin:'0'});
  await animate('.peel-intro-in',{opacity:0},{duration:phone?.16:.13,ease:[.4,0,1,1]});
  const move=animate(card,{left:target.left,top:target.top,width:target.width,height:target.height,borderRadius:target.radius},{duration:flight,ease:[.45,0,.2,1]});
  // Phone: the card dissolves into the mint scalpel over its last 260 ms, rather than sitting on it and then fading.
  if(phone)void animate(card,{opacity:0},{duration:.26,delay:flight-.26,ease:[.4,0,1,1]});
  await new Promise(res=>setTimeout(res,pickUp*1000));onTry();if(!phone){onDone();return;}await move;onDone();};
 return <div className={`peel-intro-layer ${leaving?'is-leaving':''} ${phone?'is-phone':''}`}>
  <m.div className="peel-intro-scrim" initial={{opacity:0}} animate={leaving?{opacity:0,transition:tween('io',phone?.6:.5)}:{opacity:1,transition:tween('out',.36)}} onClick={()=>{if(!leaving)onLater('outside');}}/>
  <div className="peel-intro-guides" aria-hidden="true"><i className="guide gx g0"/><i className="guide gx g1"/><i className="guide gy g2"/><i className="guide gy g3"/></div>
  <div ref={scope} className="panel peel-intro" role="dialog" aria-labelledby="peel-intro-title">
   <div className="peel-intro-in">
    <span className="peel-intro-icon"><ScalpelIcon size={20}/></span>
    <div>
     <p className="peel-intro-new">New</p>
     <h2 id="peel-intro-title" className="t-body peel-intro-title">Dissect the body</h2>
     <p className="t-body2 peel-intro-line">Pick up the scalpel, then {phone?'double-tap':'double-click'} a part to peel it away.</p>
     <div className="action-row peel-intro-actions"><button type="button" className="btn-quiet" onClick={()=>onLater('later')}>Later</button><button type="button" className="btn-quiet btn-quiet-on" onClick={()=>void tryIt()} autoFocus={!phone}>Try the scalpel</button></div>
    </div>
   </div>
  </div>
 </div>;
}
