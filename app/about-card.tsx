import {useEffect,useState,type ReactNode} from 'react';
import {ProfileRow} from './community/account';
import {AnimatePresence,m,useDragControls} from 'motion/react';
import {ChevronDown,ChevronLeft,X} from 'lucide-react';
import {DUR,css,spring,tween} from './motion';
import {PagerIndicator,PagerTrack,usePager} from './swipe-pages';

export type AboutTab='about'|'feedback';
const LABEL:Record<AboutTab,string>={about:'About',feedback:'Feedback'};
const page=(side:number)=>({initial:{opacity:0,x:8*side},animate:{opacity:1,x:0,transition:tween('out',DUR.enter,DUR.enterDelay)},exit:{opacity:0,x:-8*side,transition:tween('in',DUR.leave)}});

/** About AnatomyGo, in the structure card's own shell: the right-hand panel on a desktop and a bottom sheet on a phone,
 * with the same tabs, springs and page changes. The page fills each tab; a tab without content is left out. */
/** Signed in, a row at the foot of the About tab opens your profile in the same card (a back link returns). */
export function AboutCard({phone,pages,start='about',profile,onClose}:{phone:boolean;pages:Partial<Record<AboutTab,ReactNode>>;start?:AboutTab;profile?:{name:string;page:ReactNode}|null;onClose:()=>void}){
 const tabs=(Object.keys(LABEL) as AboutTab[]).filter(t=>pages[t]);
 const [tab,setTab]=useState<AboutTab>(tabs.includes(start)?start:'about'),[side,setSide]=useState(1);
 const go=(t:AboutTab)=>{setSide(tabs.indexOf(t)>=tabs.indexOf(tab)?1:-1);setTab(t);};
 const [account,setAccount]=useState(false);useEffect(()=>{if(!profile)setAccount(false);},[profile]);
 const drag=useDragControls(),at=tabs.indexOf(tab),n=tabs.length;
 // Phones swipe between the tabs (a pager); a desktop switches on a click.
 const pager=usePager(n,at,i=>go(tabs[i]));
 const content=(t:AboutTab)=><>{pages[t]}{t==='about'&&profile&&<ProfileRow name={profile.name} onOpen={()=>setAccount(true)}/>}</>;
 const x=phone&&<button type="button" className="card-x" onClick={onClose} aria-label="Close"><ChevronDown size={18}/></button>;
 const main=<m.div key="main" className="about-screen" {...page(-1)}>
  <div className="card-head" onPointerDown={phone?e=>drag.start(e):undefined}>
   <div className="card-row"><p className="t-meta">About</p>{x}</div>
   <h2 className="t-title card-title">AnatomyGo</h2>
  </div>
  <div className="card-page about-page">
   <div className="tabs card-tabs" role="tablist" aria-label="About AnatomyGo" onPointerDown={phone?e=>drag.start(e):undefined}>
    {phone?<PagerIndicator pos={pager.pos} count={n}/>:<span className="tab-ind" aria-hidden="true" style={{width:`calc((100% - 6px - ${(n-1)*2}px) / ${n})`,transform:`translateX(calc(${at} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}`}}/>}
    {tabs.map(t=><button type="button" role="tab" key={t} aria-selected={tab===t} className={`tab ${tab===t?'is-on':''}`} onClick={()=>go(t)}>{LABEL[t]}</button>)}
   </div>
   {phone?<div className="pager-clip" onPointerDown={pager.down}><PagerTrack pos={pager.pos}>{tabs.map(t=><div key={t} className="tab-page about-tab" role="tabpanel" aria-label={LABEL[t]} inert={t!==tab}>{content(t)}</div>)}</PagerTrack></div>
   :<AnimatePresence mode="wait" initial={false}><m.div key={tab} className="tab-page about-tab" role="tabpanel" aria-label={LABEL[tab]} {...page(side)}>{content(tab)}</m.div></AnimatePresence>}
  </div>
 </m.div>;
 const accountScreen=profile&&<m.div key="account" className="about-screen" {...page(1)}>
  <div className="card-head" onPointerDown={phone?e=>drag.start(e):undefined}>
   <div className="card-row"><button type="button" className="t-meta link-quiet back-link" onClick={()=>setAccount(false)}><ChevronLeft size={14}/>About</button>{x}</div>
  </div>
  <div className="card-page about-page">{profile.page}</div>
 </m.div>;
 const body=<div className="card-body"><AnimatePresence mode="wait" initial={false}>{account&&accountScreen?accountScreen:main}</AnimatePresence></div>;
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
