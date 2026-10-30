/** The structure card (handoff T2–T8, M2–M8): one glass card that is a peek after a tap, grows into the focus card on
 * Learn more (About and Parts), and pages to a feature when a part is chosen. On phones it is a bottom sheet that
 * springs between detents; drag it down to close it, swipe a feature sideways for the next one. */
import {useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,m,useDragControls} from 'motion/react';
import {ArrowUpRight,ChevronLeft,ChevronRight,Plus,SquarePen,X} from 'lucide-react';
import {DUR,css,spring,tween} from './motion';
import type {PublishedPin} from './published-pins';

export type CardMode='peek'|'focus'|'feature';
export type CardTab='about'|'parts';
export interface CardFacts {kind:string;title:string;description:string;curated:boolean;system:string;side:string|null;pieces:number;features:number|null;reference:string}

/** Pages slide 24 px the way you travel; tabs push 8 px. Leaving is quick, arriving follows a beat later. */
const page=(dir:number,px=24)=>({
 initial:{opacity:0,x:px*dir},
 animate:{opacity:1,x:0,transition:tween('out',DUR.enter,DUR.enterDelay)},
 exit:{opacity:0,x:-px*dir,transition:tween('in',DUR.leave)},
});

interface Props {
 mode:CardMode;phone:boolean;facts:CardFacts;tab:CardTab;
 members:{id:string;name:string}[];pins:PublishedPin[];pinsLoading:boolean;pinsError:string;
 pin:PublishedPin|null;counterpart:{id:string;name:string}|null;
 contributeHref:string;pinHref:(p:PublishedPin)=>string;
 onTab:(t:CardTab)=>void;onLearnMore:()=>void;onClose:()=>void;onBack:()=>void;
 onPin:(id:string)=>void;onPinClose:()=>void;onHoverPin:(id:string|null)=>void;onMember:(id:string)=>void;onCounterpart:()=>void;onContribute:(source:string)=>void;
}

export function StructureCard(p:Props){
 const {mode,phone,facts,tab}=p;
 const sheet=useRef<HTMLElement>(null),drag=useDragControls(),[dir,setDir]=useState(1);
 const index=p.pin?p.pins.findIndex(x=>x.id===p.pin!.id):-1,prev=index>0?p.pins[index-1]:null,next=index>=0&&index<p.pins.length-1?p.pins[index+1]:null;
 const go=(to:PublishedPin|null,d:number)=>{if(!to)return;setDir(d);p.onPin(to.id);};

 // Desktop: peek 400 wide, focus 372 × up to 600, anchored at the right edge. Phone: sheet detents (handoff boards).
 const vh=typeof innerHeight==='number'?innerHeight:800;
 const deskH:number|'auto'=mode==='peek'?'auto':Math.min(600,vh-96-32);
 const phoneH:number|'auto'=mode==='peek'?'auto':mode==='focus'&&tab==='parts'?Math.min(vh*.65,560):Math.min(vh*.47,420);
 const size=phone?{height:phoneH}:{width:mode==='peek'?416:392,height:deskH};

 const meta=<p className="t-meta">{facts.kind}{facts.side?` · ${facts.side}`:''}</p>;
 const close=<button type="button" className="card-x" onClick={p.onClose} aria-label="Close"><X size={16}/></button>;

 const peek=<m.div key="peek" className="card-page card-peek" {...page(1,0)}>
  <div className="card-row">{meta}{close}</div>
  <h2 className="t-title card-title">{facts.title}</h2>
  <p className="t-body2 clamp-2">{facts.description}</p>
  <button type="button" className="learn-more" onClick={p.onLearnMore}><span className="learn-more-in">Learn more<ChevronRight size={18}/></span></button>
 </m.div>;

 const tabs=<div className="tabs card-tabs" role="tablist" aria-label="About this structure">
  <span className="tab-ind" aria-hidden="true" style={{width:'calc((100% - 6px - 2px) / 2)',transform:`translateX(calc(${tab==='parts'?1:0} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}`}}/>
  {(['about','parts'] as CardTab[]).map(t=><button type="button" role="tab" key={t} aria-selected={tab===t} className={`tab ${tab===t?'is-on':''}`} onClick={()=>p.onTab(t)}>{t==='about'?'About':'Parts'}</button>)}
 </div>;

 const about=<m.div key="about" className="tab-page" {...page(-1,8)}>
  <p className="t-body">{facts.description}</p>
  {!facts.curated&&<p className="t-meta">A general note on the {facts.system.toLowerCase()} system. A description of this structure is still to be written.</p>}
  <div className="card-tiles">
   <div className="tile"><p className="t-meta">System</p><p className="t-body">{facts.system}</p></div>
   {facts.side&&<div className="tile"><p className="t-meta">Side</p><p className="t-body">{facts.side}</p></div>}
   <div className="tile"><p className="t-meta">{facts.pieces>1?'Pieces':'Features'}</p><p className="t-body">{facts.pieces>1?facts.pieces:facts.features??'—'}</p></div>
  </div>
 </m.div>;

 const parts=<m.div key="parts" className="tab-page" {...page(1,8)}>
  {p.members.length>1
   ?<div className="list">{p.members.slice(0,60).map(x=><button type="button" key={x.id} className="row" onClick={()=>p.onMember(x.id)}><span className="cap">{x.name}</span><ChevronRight size={16} className="chev"/></button>)}</div>
   :p.pinsLoading?<div className="list" aria-busy="true">{[0,1,2,3].map(i=><span key={i} className="row skeleton"/>)}</div>
   :p.pins.length?<div className="list" onPointerLeave={()=>p.onHoverPin(null)}>{p.pins.map(x=><button type="button" key={x.id} className="row" onPointerEnter={()=>p.onHoverPin(x.id)} onFocus={()=>p.onHoverPin(x.id)} onClick={()=>{setDir(1);p.onPin(x.id);}}><span className="cap">{x.label}</span><ChevronRight size={16} className="chev"/></button>)}</div>
   :<p className="t-body2">{p.pinsError||'No parts pinned on this structure yet.'}</p>}
 </m.div>;

 const foot=(line:string,label:string,source:string,icon:ReactNode)=><div className="card-foot">
  <div className="contrib"><p className="t-meta">{line}</p><a className="pill" href={p.contributeHref} onClick={()=>p.onContribute(source)}>{icon}{label}</a></div>
  {!phone&&<p className="t-meta foot-links">{p.counterpart&&<button type="button" className="link-quiet" onClick={p.onCounterpart}>{p.counterpart.name} ›</button>}<a className="link-quiet" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a></p>}
 </div>;

 const focus=<m.div key="focus" className="card-page card-focus" {...page(-dir)}>
  <div className="card-row">{meta}{close}</div>
  <h2 className="t-title card-title">{facts.title}</h2>
  {tabs}
  <div className="card-scroll"><AnimatePresence mode="popLayout" initial={false}>{tab==='about'?about:parts}</AnimatePresence></div>
  {tab==='about'?!phone&&foot('Something to add? Write it in your name.','Contribute','about',<Plus size={14}/>):foot('Missed a part? Add it in your name.','Contribute','parts',<Plus size={14}/>)}
 </m.div>;

 const pin=p.pin;
 const feature=pin&&<m.div key={`f-${pin.id}`} className="card-page card-feature" {...page(dir)}
  drag={phone?'x':false} dragSnapToOrigin dragElastic={.35} onDragEnd={(_,i)=>{const w=innerWidth*.3;if(i.offset.x<-w||i.velocity.x<-600)go(next,1);else if(i.offset.x>w||i.velocity.x>600)go(prev,-1);}}>
  <div className="card-row"><button type="button" className="t-meta link-quiet back-link" onClick={p.onPinClose}><ChevronLeft size={14}/>{facts.title} · Parts</button>{close}</div>
  {phone&&<p className="t-meta">Feature · {index+1} of {p.pins.length}</p>}
  <h2 className="t-title card-title cap">{pin.label}</h2>
  {pin.latinName&&<p className="t-meta latin">{pin.latinName}</p>}
  <div className="card-scroll">
   {pin.description?<p className="t-body">{pin.description}</p>:<p className="t-body2">No description yet.</p>}
   <div className="tile vote-tile"><p className="t-body2">Looks right?</p><a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}>{pin.upvotes?`${pin.upvotes} agree · `:''}Vote</a></div>
   <p className="t-meta byline"><span className="avatar" aria-hidden="true">{(pin.by??'A').charAt(0).toUpperCase()}</span>{pin.kind==='community'?(pin.by===null?'Starter pin':pin.by?`Added by the community · ${pin.by}`:'Added by the community'):'Published'}</p>
  </div>
  {!phone&&<div className="contrib"><p className="t-meta">Pin in the wrong spot? Help fix it.</p><a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}><SquarePen size={14}/>Contribute</a></div>}
  <div className="prev-next t-meta">{prev?<button type="button" className="link-quiet" onClick={()=>go(prev,-1)}>‹ <span className="cap">{prev.label}</span></button>:<span/>}{phone?<a className="pill" href={p.pinHref(pin)} onClick={()=>p.onContribute('home_pin')}><SquarePen size={14}/>Contribute</a>:<span/>}{next?<button type="button" className="link-quiet" onClick={()=>go(next,1)}><span className="cap">{next.label}</span> ›</button>:<span/>}</div>
 </m.div>;

 const body=<AnimatePresence mode="popLayout" initial={false}>{mode==='peek'?peek:mode==='feature'&&feature?feature:focus}</AnimatePresence>;

 if(phone)return <m.section ref={sheet} className="sheet scard is-sheet" data-inset="bottom" data-inset-size={typeof phoneH==='number'?phoneH:undefined} role="dialog" aria-label={facts.title}
  initial={{y:'100%'}} animate={{y:0,...size}} exit={{y:'100%',transition:tween('in',.22)}} transition={spring.sheet}
  drag="y" dragControls={drag} dragListener={false} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.7}}
  onDragEnd={(_,i)=>{if(i.offset.y>(sheet.current?.offsetHeight??400)*.2||i.velocity.y>700)p.onBack();}}>
  <span className="grab-zone" onPointerDown={e=>drag.start(e)}><span className="grab" aria-hidden="true"/></span>
  {body}
 </m.section>;
 return <m.section className="panel scard" data-inset="right" data-inset-size={mode==='peek'?416:392} role="dialog" aria-label={facts.title}
  initial={{opacity:0,x:16,...size}} animate={{opacity:1,x:0,...size}} exit={{opacity:0,scale:.98,transition:tween('in',.18)}} transition={{...spring.card,opacity:tween('out',.22)}}>
  {body}
 </m.section>;
}
