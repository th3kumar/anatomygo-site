/** The structure card (handoff T2–T8, M2–M8): one glass card that is a peek after a tap, grows into the focus card on
 * Learn more (About and Parts), and pages to a feature when a part is chosen. On phones it is a bottom sheet that
 * springs between detents; drag it down to close it, swipe a feature sideways for the next one.
 * The header (kind, close, title) stays put from peek to focus; only what is under it changes. Pages push the way you
 * travel, worked out from what changed, so every path (buttons, Esc, pins on the model) moves the same way. */
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,animate,m,useMotionValue,type Variants} from 'motion/react';
import {ArrowUpRight,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Plus,SquarePen,X} from 'lucide-react';
import {DUR,css,spring,tween} from './motion';
import type {PublishedPin} from './published-pins';

export type CardMode='peek'|'focus'|'feature';
export type CardTab='about'|'parts';
export interface CardFacts {kind:string;title:string;description:string;curated:boolean;system:string;side:string|null;pieces:number;features:number|null;reference:string}

/** How the card got here: d is the direction of travel (+1 forward, -1 back, 0 a swap in place), `from` the mode it
 * left, `swipe` the finger's offset when a phone swipe committed the change. */
interface Nav {d:number;from:CardMode|null;swipe:number|null;width:number}

/** Pages: 24 px the way you travel; a committed swipe carries both pages on with the finger. From the peek, the focus
 * body does not slide: its parts rise into place under the header that stays. */
const pageV:Variants={
 enter:(c:Nav)=>c.swipe!==null?{opacity:1,x:c.d*c.width+c.swipe}:c.from==='peek'||c.d===0?{opacity:0,x:0}:{opacity:0,x:24*c.d},
 center:(c:Nav)=>({opacity:1,x:0,transition:c.swipe!==null?spring.settle:tween('out',DUR.enter,DUR.enterDelay)}),
 exit:(c:Nav)=>c.swipe!==null?{opacity:1,x:-c.d*c.width,transition:spring.settle}:c.d===0||c.from===null?{opacity:0,transition:tween('in',DUR.leave)}:{opacity:0,x:-24*c.d,transition:tween('in',DUR.leave)},
};
/** The focus body's pieces rise 6 px, 40 ms apart, as the card grows from the peek. */
const rise=(i:number,fromPeek:boolean)=>fromPeek?{initial:{opacity:0,y:6},animate:{opacity:1,y:0,transition:tween('out',.22,.12+i*.04)}}:{};
/** Tabs keep their sides: About lives to the left of Parts, so each always leaves and arrives on its own side. */
const tabPage=(side:number)=>({initial:{opacity:0,x:8*side},animate:{opacity:1,x:0,transition:tween('out',DUR.enter,DUR.enterDelay)},exit:{opacity:0,x:8*side,transition:tween('in',DUR.leave)}});
const fade={initial:{opacity:0},animate:{opacity:1,transition:tween('out',DUR.enter,DUR.enterDelay)},exit:{opacity:0,transition:tween('in',DUR.leave)}};

interface Props {
 mode:CardMode;phone:boolean;facts:CardFacts;tab:CardTab;
 members:{id:string;name:string}[];pins:PublishedPin[];pinsLoading:boolean;pinsError:string;
 pin:PublishedPin|null;counterpart:{id:string;name:string}|null;
 contributeHref:string;pinHref:(p:PublishedPin)=>string;
 onTab:(t:CardTab)=>void;onLearnMore:()=>void;onClose:()=>void;onBack:()=>void;
 onPin:(id:string)=>void;onPinClose:()=>void;onHoverPin:(id:string|null)=>void;onMember:(id:string)=>void;onCounterpart:()=>void;onContribute:(source:string)=>void;
 /** The phone sheet's resting height, so the camera can frame the space above it. */
 onRest?:(h:number)=>void;
 /** The card was minimised to its bar (or opened again), so the camera can use the space. */
 onMinimise?:(mini:boolean)=>void;
}

export function StructureCard(p:Props){
 const {mode,phone,facts,tab}=p;
 const sheet=useRef<HTMLElement>(null);
 // Previous and next loop: from the first feature, back goes to the last; from the last, on goes to the first.
 const index=p.pin?p.pins.findIndex(x=>x.id===p.pin!.id):-1,n=p.pins.length,prev=index>=0&&n>1?p.pins[(index-1+n)%n]:null,next=index>=0&&n>1?p.pins[(index+1)%n]:null;
 // The direction a step was asked for, so a wrap (last to first) still slides the way the button points.
 const intent=useRef(0);

 // Direction of travel, from what changed since the last render (refs, so every path that changes mode is covered).
 const was=useRef({mode:null as CardMode|null,index:-1,ref:''}),nav=useRef<Nav>({d:0,from:null,swipe:null,width:0}),swipe=useRef<number|null>(null);
 if(was.current.mode!==mode||was.current.index!==index||was.current.ref!==facts.reference){
  const w=was.current,d=w.ref!==facts.reference&&w.mode===mode?0:w.mode==='focus'&&mode==='feature'?1:w.mode==='feature'&&mode==='focus'?-1:w.mode==='feature'&&mode==='feature'?intent.current||Math.sign(index-w.index)||1:0;intent.current=0;
  nav.current={d,from:w.mode,swipe:mode==='feature'&&w.mode==='feature'?swipe.current:null,width:sheet.current?.offsetWidth??(typeof innerWidth==='number'?innerWidth:390)};
  swipe.current=null;was.current={mode,index,ref:facts.reference};
 }
 const c=nav.current,fromPeek=c.from==='peek'&&mode==='focus';
 const go=(to:PublishedPin|null,d=0)=>{if(to){intent.current=d;p.onPin(to.id);}};

 // The peek's height, measured, so Learn more springs between two numbers instead of from 'auto'.
 const head=useRef<HTMLDivElement>(null),peekBody=useRef<HTMLDivElement>(null),[peekH,setPeekH]=useState(0);
 useLayoutEffect(()=>{if(mode!=='peek')return;const measure=()=>{const h=(head.current?.offsetHeight??0)+(peekBody.current?.offsetHeight??0);if(h)setPeekH(h+2);};measure();const ro=new ResizeObserver(measure);[head.current,peekBody.current].forEach(e=>e&&ro.observe(e));return()=>ro.disconnect();},[mode,facts.reference]);

 // Where the Parts list was scrolled, so coming back from a feature returns to the same row.
 const partsScroll=useRef(0);
 useLayoutEffect(()=>{partsScroll.current=0;},[facts.reference]);

 const vh=typeof innerHeight==='number'?innerHeight:800;
 const deskH:number|'auto'=mode==='peek'?peekH||'auto':Math.min(600,vh-96-32);

 // Phone: a real bottom sheet. It is as tall as its content up to a resting height; with more to show, dragging it up
 // (by the handle, the header or the content) raises the whole sheet towards full height, and only then does the
 // content scroll. Dragged below its resting height it closes.
 const scroller=useRef<HTMLElement|null>(null),[fit,setFit]=useState(0),[full,setFull]=useState(false);
 // In focus and on a feature the card minimises instead of closing: leaving the structure is the Body button's job.
 const canMini=mode!=='peek',[mini,setMini]=useState(false),[safe,setSafe]=useState(0);
 useEffect(()=>{if(!canMini)setMini(false);},[canMini]);useEffect(()=>{setMini(false);},[facts.reference]);
 useEffect(()=>{p.onMinimise?.(mini);},[mini]);
 useLayoutEffect(()=>{if(!phone)return;const probe=document.createElement('div');probe.style.cssText='position:fixed;height:env(safe-area-inset-bottom);visibility:hidden';document.body.appendChild(probe);setSafe(probe.offsetHeight);probe.remove();},[phone]);
 const MINI=(mode==='feature'?118:78)+safe;
 const top=Math.min(vh-72,vh*.92),rest=mode==='peek'?(peekH?peekH+12:0):Math.min(fit||vh*.47,vh*.62),open=Math.max(rest,Math.min(fit,top));
 const target=mini?MINI:full&&open>rest+8?open:rest;
 useLayoutEffect(()=>{if(!phone)return;const measure=()=>{const s=sheet.current,sc=scroller.current;if(!s||mini)return;if(mode==='peek'){setFit(0);return;}if(!sc)return;
   // The content's own height (not the scroll box's), so a sheet with little to show can shrink to fit it.
   const kids=Array.from(sc.children) as HTMLElement[];if(!kids.length)return;const cs=getComputedStyle(sc),first=kids[0].getBoundingClientRect().top,last=Math.max(...kids.map(k=>k.getBoundingClientRect().bottom));
   setFit(Math.ceil(s.offsetHeight-sc.clientHeight+(last-first)+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)));};
  measure();const ro=new ResizeObserver(measure);const sc=scroller.current;if(sc){ro.observe(sc);for(const ch of Array.from(sc.children))ro.observe(ch);}return()=>ro.disconnect();});
 useEffect(()=>{setFull(false);},[mode,tab,facts.reference,index]);
 useEffect(()=>{if(phone&&rest)p.onRest?.(Math.round((mini?MINI:rest)/16)*16);},[phone,rest,mini]);
 const height=useMotionValue(0),dragging=useRef(false);
 useEffect(()=>{if(!phone||!target)return;if(!height.get()){height.set(target);return;}if(!dragging.current)animate(height,target,spring.sheet);},[phone,target]);
 const gesture=useRef<{y0:number;x0:number;h0:number;handle:boolean;on:boolean;last:number;at:number;v:number}|null>(null);
 const down=(e:React.PointerEvent)=>{if(!phone||e.button>0)return;const el=e.target as Element;const handle=!!el.closest('.grab-zone,.card-head,.card-row,.card-tabs,.card-mini');
  const sc=scroller.current;if(!handle&&full&&sc&&sc.scrollTop>0)return;gesture.current={y0:e.clientY,x0:e.clientX,h0:height.get(),handle,on:false,last:e.clientY,at:performance.now(),v:0};
  // Follow this pointer wherever it goes until it lifts: a quick flick leaves the sheet within its first move, and those
  // moves land on the 3D canvas, not here.
  const id=e.pointerId,onMove=(ev:PointerEvent)=>{if(ev.pointerId===id)move(ev);},onUp=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;removeEventListener('pointermove',onMove,true);removeEventListener('pointerup',onUp,true);removeEventListener('pointercancel',onUp,true);up(ev);};
  addEventListener('pointermove',onMove,true);addEventListener('pointerup',onUp,true);addEventListener('pointercancel',onUp,true);};
 const move=(e:PointerEvent)=>{const g=gesture.current;if(!g)return;const dy=e.clientY-g.y0,dx=e.clientX-g.x0;
  if(!g.on){if(Math.abs(dy)<6&&Math.abs(dx)<6)return;if(Math.abs(dx)>Math.abs(dy)){gesture.current=null;return;}
   // On the content, an upward drag of a sheet that is already full is a scroll, not a drag.
   if(!g.handle&&full&&dy<0){gesture.current=null;return;}g.on=true;dragging.current=true;}
  const now=performance.now();g.v=(e.clientY-g.last)/Math.max(1,now-g.at)*1000;g.last=e.clientY;g.at=now;
  height.set(Math.max(60,Math.min(open+24,g.h0-dy)));};
 const up=(e:PointerEvent)=>{const g=gesture.current;gesture.current=null;if(!g?.on)return;dragging.current=false;
  // The tap that ends a drag must not open a row.
  const stop=(ev:Event)=>{ev.stopPropagation();ev.preventDefault();};addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>removeEventListener('click',stop,{capture:true}),0);
  const h=height.get(),v=g.v,spring_={...spring.sheet,velocity:-v};
  // Minimised: dragged up it opens again, otherwise it settles back to the bar (it never leaves the structure).
  if(mini){if(h>MINI+40||v<-400){setMini(false);animate(height,rest,spring_);}else animate(height,MINI,spring_);return;}
  if(h<rest*.72||(v>900&&h<rest)){if(canMini){setMini(true);setFull(false);animate(height,MINI,spring_);}else p.onBack();return;}
  const toFull=open>rest+8&&(v<-500||(v<500&&h>(rest+open)/2));setFull(toFull);animate(height,toFull?open:rest,{...spring.sheet,velocity:-v});
  void e;};
 const size=phone?{}:mini?{width:360,height:mode==='feature'?110:68}:{width:mode==='peek'?416:392,height:deskH};

 const close=canMini?<button type="button" className="card-x" onClick={()=>setMini(true)} aria-label="Minimise" title="Minimise"><ChevronDown size={18}/></button>:<button type="button" className="card-x" onClick={p.onClose} aria-label="Close"><X size={16}/></button>;

 // Peek and focus share this header; it leaves with the focus body when a feature opens.
 const header=mode!=='feature'&&<m.div key={`head-${facts.reference}`} ref={head} className="card-head" custom={c} variants={pageV} initial="enter" animate="center" exit="exit">
  <div className="card-row"><p className="t-meta">{facts.kind}{facts.side?` · ${facts.side}`:''}</p>{close}</div>
  <h2 className="t-title card-title">{facts.title}</h2>
 </m.div>;

 const peek=<m.div key={`peek-${facts.reference}`} ref={peekBody} className="card-page card-peek" custom={c} variants={pageV} initial="enter" animate="center" exit={{opacity:0,transition:tween('in',.12)}}>
  <p className="t-body2 clamp-2">{facts.description}</p>
  <button type="button" className="learn-more" onClick={p.onLearnMore}><span className="learn-more-in">Learn more<ChevronRight size={18}/></span></button>
 </m.div>;

 const tabs=<div className="tabs card-tabs" role="tablist" aria-label="About this structure">
  <span className="tab-ind" aria-hidden="true" style={{width:'calc((100% - 6px - 2px) / 2)',transform:`translateX(calc(${tab==='parts'?1:0} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}`}}/>
  {(['about','parts'] as CardTab[]).map(t=><button type="button" role="tab" key={t} aria-selected={tab===t} className={`tab ${tab===t?'is-on':''}`} onClick={()=>p.onTab(t)}>{t==='about'?'About':'Parts'}</button>)}
 </div>;

 // Each tab scrolls on its own, so switching never shows the other tab's scroll position.
 const about=<m.div key="about" className="tab-page" {...tabPage(-1)} ref={(el:HTMLDivElement|null)=>{if(el&&tab==='about')scroller.current=el;}}>
  <p className="t-body">{facts.description}</p>
  {!facts.curated&&<p className="t-meta">A general note on the {facts.system.toLowerCase()} system. A description of this structure is still to be written.</p>}
  <div className="card-tiles">
   <div className="tile"><p className="t-meta">System</p><p className="t-body">{facts.system}</p></div>
   {facts.side&&<div className="tile"><p className="t-meta">Side</p><p className="t-body">{facts.side}</p></div>}
   <div className="tile"><p className="t-meta">{facts.pieces>1?'Pieces':'Features'}</p><p className="t-body">{facts.pieces>1?facts.pieces:facts.features??'—'}</p></div>
  </div>
 </m.div>;

 const parts=<m.div key="parts" className="tab-page" {...tabPage(1)} ref={(el:HTMLDivElement|null)=>{if(el&&tab==='parts')scroller.current=el;if(el&&!el.dataset.placed){el.dataset.placed='1';el.scrollTop=partsScroll.current;}}} onScroll={e=>{partsScroll.current=(e.target as HTMLDivElement).scrollTop;}}>
  {p.members.length>1
   ?<div className="list">{p.members.slice(0,60).map(x=><button type="button" key={x.id} className="row" onClick={()=>p.onMember(x.id)}><span className="cap">{x.name}</span><ChevronRight size={16} className="chev"/></button>)}</div>
   :p.pinsLoading?<div className="list" aria-busy="true">{[0,1,2,3].map(i=><span key={i} className="row skeleton"/>)}</div>
   :p.pins.length?<div className="list" onPointerLeave={()=>p.onHoverPin(null)}>{p.pins.map(x=><button type="button" key={x.id} className="row" onPointerEnter={()=>p.onHoverPin(x.id)} onFocus={()=>p.onHoverPin(x.id)} onClick={()=>p.onPin(x.id)}><span className="cap">{x.label}</span><ChevronRight size={16} className="chev"/></button>)}</div>
   :<p className="t-body2">{p.pinsError||'No parts pinned on this structure yet.'}</p>}
 </m.div>;

 const foot=(line:string,source:string,icon:ReactNode)=><>
  <div className="contrib"><p className="t-meta">{line}</p><a className="pill" href={p.contributeHref} onClick={()=>p.onContribute(source)}>{icon}Contribute</a></div>
  {!phone&&<p className="t-meta foot-links">{p.counterpart&&<button type="button" className="link-quiet" onClick={p.onCounterpart}>{p.counterpart.name} ›</button>}<a className="link-quiet" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></p>}
 </>;
 // The footer changes with the tab: it cross-fades (and on phones, where About has none, it opens and closes).
 const footer=tab==='about'?(phone?null:<m.div key="foot-about" className="card-foot" {...fade}>{foot('Something to add? Write it in your name.','about',<Plus size={14}/>)}</m.div>)
  :<m.div key="foot-parts" className="card-foot" {...(phone?{initial:{opacity:0,height:0},animate:{opacity:1,height:'auto',transition:tween('out',DUR.enter)},exit:{opacity:0,height:0,transition:tween('in',DUR.leave)}}:fade)}>{foot('Missed a part? Add it in your name.','parts',<Plus size={14}/>)}</m.div>;

 const focus=<m.div key={`focus-${facts.reference}`} className="card-page card-focus" custom={c} variants={pageV} initial="enter" animate="center" exit="exit">
  <m.div {...rise(0,fromPeek)}>{tabs}</m.div>
  <m.div className="card-scroll" {...rise(1,fromPeek)}><AnimatePresence mode="popLayout" initial={false}>{tab==='about'?about:parts}</AnimatePresence></m.div>
  <m.div className="card-foot-slot" {...rise(2,fromPeek)}><AnimatePresence mode="popLayout" initial={false}>{footer}</AnimatePresence></m.div>
 </m.div>;

 const pin=p.pin;
 const feature=pin&&<m.div key={`f-${pin.id}`} className="card-page card-feature" custom={c} variants={pageV} initial="enter" animate="center" exit="exit"
  drag={phone?'x':false} dragDirectionLock dragSnapToOrigin dragElastic={.35}
  onDragEnd={(_,i)=>{const w=(sheet.current?.offsetWidth??innerWidth)*.3;const fwd=i.offset.x<-w||i.velocity.x<-600,to=fwd?next:i.offset.x>w||i.velocity.x>600?prev:null;if(to){swipe.current=i.offset.x;go(to,fwd?1:-1);}}}>
  <div className="card-row"><button type="button" className="t-meta link-quiet back-link" onClick={p.onPinClose}><ChevronLeft size={14}/>{facts.title} · Parts</button>{close}</div>
  {phone&&<p className="t-meta">Feature · {index+1} of {p.pins.length}</p>}
  <h2 className="t-title card-title cap">{pin.label}</h2>
  {pin.latinName&&<p className="t-meta latin">{pin.latinName}</p>}
  <div className="card-scroll is-plain" ref={el=>{if(el&&mode==='feature')scroller.current=el;}}>
   {pin.description?<p className="t-body">{pin.description}</p>:<p className="t-body2">No description yet.</p>}
   <div className="tile vote-tile"><p className="t-body2">Looks right?</p><a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}>{pin.upvotes?`${pin.upvotes} agree · `:''}Vote</a></div>
   <p className="t-meta byline"><span className="avatar" aria-hidden="true">{(pin.by??'A').charAt(0).toUpperCase()}</span>{pin.kind==='community'?(pin.by===null?'Starter pin':pin.by?`Added by the community · ${pin.by}`:'Added by the community'):'Published'}</p>
  </div>
  {!phone&&<div className="contrib"><p className="t-meta">Pin in the wrong spot? Help fix it.</p><a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}><SquarePen size={14}/>Contribute</a></div>}
  <div className="prev-next t-meta">{prev?<button type="button" className="link-quiet" onClick={()=>go(prev,-1)}>‹ <span className="cap">{prev.label}</span></button>:<span/>}{phone?<a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}><SquarePen size={14}/>Contribute</a>:<span/>}{next?<button type="button" className="link-quiet" onClick={()=>go(next,1)}><span className="cap">{next.label}</span> ›</button>:<span/>}</div>
 </m.div>;

 // Minimised: the name (on a feature, which one and arrows to step through them) and a way back up.
 const miniBar=<m.div key="mini" className="card-mini" role="button" tabIndex={0} aria-label={`Show details: ${mode==='feature'&&p.pin?p.pin.label:facts.title}`}
  initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.2,.08)}} exit={{opacity:0,transition:tween('in',.12)}}
  onClick={()=>setMini(false)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setMini(false);}}}>
  <div className="mini-text"><p className="t-meta">{mode==='feature'&&p.pin?`Feature · ${index+1} of ${p.pins.length}`:`${facts.kind}${facts.side?` · ${facts.side}`:''}`}</p><p className="mini-title cap">{mode==='feature'&&p.pin?p.pin.label:facts.title}</p></div>
  <span className="card-x mini-open" aria-hidden="true"><ChevronUp size={18}/></span>
  {mode==='feature'&&(prev||next)&&<div className="mini-steps t-meta">
   {prev?<button type="button" className="link-quiet" onClick={e=>{e.stopPropagation();go(prev,-1);}} aria-label={`Previous feature: ${prev.label}`}>‹ <span className="cap">{prev.label}</span></button>:<span/>}
   {next?<button type="button" className="link-quiet" onClick={e=>{e.stopPropagation();go(next,1);}} aria-label={`Next feature: ${next.label}`}><span className="cap">{next.label}</span> ›</button>:<span/>}
  </div>}
 </m.div>;
 const full_=<m.div key="full" className="card-full" initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.22,.06)}} exit={{opacity:0,transition:tween('in',.1)}}>{body0()}</m.div>;
 function body0(){return <>
  <AnimatePresence mode="popLayout" initial={false} custom={c}>{header}</AnimatePresence>
  <div className="card-body"><AnimatePresence mode="popLayout" initial={false} custom={c}>{mode==='peek'?peek:mode==='feature'&&feature?feature:focus}</AnimatePresence></div>
 </>;}
 const body=<AnimatePresence mode="popLayout" initial={false}>{mini?miniBar:full_}</AnimatePresence>;

 if(phone)return <m.section ref={sheet} className={`sheet scard is-sheet ${full&&open>rest+8?'is-full':''} ${mini?'is-mini':''}`} data-inset="bottom" data-inset-size={(mini?MINI:rest)||undefined} role="dialog" aria-label={facts.title}
  style={{height:target?height:'auto'}} initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%',transition:tween('in',.22)}} transition={spring.sheet}
  onPointerDown={down}>
  <span className="grab-zone"><span className="grab" aria-hidden="true"/></span>
  {body}
 </m.section>;
 return <m.section className={`panel scard ${mini?'is-mini':''}`} data-inset={mini?undefined:'right'} data-inset-size={mode==='peek'?416:392} role="dialog" aria-label={facts.title}
  initial={{opacity:0,x:16,...size}} animate={{opacity:1,x:0,...size}} exit={{opacity:0,scale:.98,transition:tween('in',.18)}} transition={{...spring.card,opacity:tween('out',.22)}}>
  {body}
 </m.section>;
}
