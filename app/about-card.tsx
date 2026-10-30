import {useState,type ReactNode} from 'react';
import {AnimatePresence,m,useDragControls} from 'motion/react';
import {ChevronDown,X} from 'lucide-react';
import {DUR,css,spring,tween} from './motion';

export type AboutTab='about'|'feedback'|'account';
const LABEL:Record<AboutTab,string>={about:'About',feedback:'Feedback',account:'Account'};
const page=(side:number)=>({initial:{opacity:0,x:8*side},animate:{opacity:1,x:0,transition:tween('out',DUR.enter,DUR.enterDelay)},exit:{opacity:0,x:-8*side,transition:tween('in',DUR.leave)}});

/** About AnatomyGo, in the structure card's own shell: the right-hand panel on a desktop and a bottom sheet on a phone,
 * with the same tabs, springs and page changes. The page fills each tab; a tab without content is left out. */
export function AboutCard({phone,pages,start='about',onClose}:{phone:boolean;pages:Partial<Record<AboutTab,ReactNode>>;start?:AboutTab;onClose:()=>void}){
 const tabs=(Object.keys(LABEL) as AboutTab[]).filter(t=>pages[t]);
 const [tab,setTab]=useState<AboutTab>(tabs.includes(start)?start:'about'),[side,setSide]=useState(1);
 const go=(t:AboutTab)=>{setSide(tabs.indexOf(t)>=tabs.indexOf(tab)?1:-1);setTab(t);};
 const drag=useDragControls(),at=tabs.indexOf(tab),n=tabs.length;
 const body=<div className="card-body">
  <div className="card-head" onPointerDown={phone?e=>drag.start(e):undefined}>
   <div className="card-row"><p className="t-meta">About</p>{phone&&<button type="button" className="card-x" onClick={onClose} aria-label="Close"><ChevronDown size={18}/></button>}</div>
   <h2 className="t-title card-title">AnatomyGo</h2>
  </div>
  <div className="card-page about-page">
   <div className="tabs card-tabs" role="tablist" aria-label="About AnatomyGo" onPointerDown={phone?e=>drag.start(e):undefined}>
    <span className="tab-ind" aria-hidden="true" style={{width:`calc((100% - 6px - ${(n-1)*2}px) / ${n})`,transform:`translateX(calc(${at} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}`}}/>
    {tabs.map(t=><button type="button" role="tab" key={t} aria-selected={tab===t} className={`tab ${tab===t?'is-on':''}`} onClick={()=>go(t)}>{LABEL[t]}</button>)}
   </div>
   <AnimatePresence mode="wait" initial={false}><m.div key={tab} className="tab-page about-tab" role="tabpanel" aria-label={LABEL[tab]} {...page(side)}>{pages[tab]}</m.div></AnimatePresence>
  </div>
 </div>;
 // A phone sheet is dragged by its header and tabs (the content scrolls); pulled down far or fast enough, it closes.
 if(phone)return <m.section className="sheet scard is-sheet is-full about-card" role="dialog" aria-label="About AnatomyGo" data-inset="bottom"
  drag="y" dragControls={drag} dragListener={false} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.7}}
  onDragEnd={(_,i)=>{if(i.offset.y>110||i.velocity.y>600)onClose();}}
  initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%',transition:tween('in',.22)}} transition={spring.sheet}>
  <span className="grab-zone" onPointerDown={e=>drag.start(e)}><span className="grab" aria-hidden="true"/></span>
  {body}
 </m.section>;
 return <m.section className="panel scard about-card" role="dialog" aria-label="About AnatomyGo" data-inset="right" data-inset-size={392}
  initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,scale:.98,transition:tween('in',.18)}} transition={{...spring.card,opacity:tween('out',.22)}}>
  <button type="button" className="card-corner" onClick={onClose} aria-label="Close" title="Close"><span className="card-corner-icon" aria-hidden="true"><X size={17}/></span></button>
  {body}
 </m.section>;
}
