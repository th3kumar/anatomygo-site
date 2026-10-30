/** The explorer's fixed chrome, in the handoff's language: wordmark, glass buttons, the view pill and the one-line hint.
 * Pieces arrive with the T1 entrance: each rises 8 px from its own edge, 40 ms after the one before. */
import type {ReactNode} from 'react';
import {m} from 'motion/react';
import {ChevronLeft,Eye,Layers,Lightbulb,Moon,Pause,RotateCcw,RotateCw,Sun,Tag} from 'lucide-react';
import {DUR,tween,spring} from './motion';
import type {View} from './anatomy';

/** T1: chrome enters once the body is in view. `edge` is the side it comes from; `order` sets its place in the stagger. */
export function Arrive({ready,edge,order,className,children,...rest}:{ready:boolean,edge:'top'|'bottom'|'left'|'right',order:number,className?:string,children:ReactNode}&Record<`data-${string}`,string>&{'aria-label'?:string,role?:string}){
 const d=edge==='top'?{y:-8}:edge==='bottom'?{y:8}:edge==='left'?{x:-8}:{x:8};
 return <m.div className={className} initial={{opacity:0,...d}} animate={ready?{opacity:1,x:0,y:0}:{opacity:0,...d}} transition={tween('out',.24,ready?order*DUR.chromeStagger:0)} {...rest}>{children}</m.div>;
}

export function Wordmark({compact,progress}:{compact?:boolean,progress:number|null}){
 return <div className={`wordmark ${compact?'is-compact':''}`}>
  <h1 className="wordmark-name">AnatomyGo</h1>
  {!compact&&<span className="wordmark-meta">{progress===null?'Free 3D human anatomy':`Loading the body · ${progress}%`}</span>}
  {progress!==null&&<span className="wordmark-progress" aria-hidden="true"><i style={{transform:`scaleX(${progress/100})`}}/></span>}
 </div>;
}

/** A 44 px glass button. With `label` it widens to show the text. */
export function GlassButton({icon,label,onClick,title,pressed,className,children,...rest}:{icon?:ReactNode,label?:string,onClick?:()=>void,title?:string,pressed?:boolean,className?:string,children?:ReactNode}&Record<`aria-${string}`,string|boolean|undefined>){
 return <button type="button" className={`gbtn ${label?'':'gbtn-icon'} ${className??''}`} onClick={onClick} title={title} aria-pressed={pressed} {...rest}>{icon}{label&&<span>{label}</span>}{children}</button>;
}

/** The theme button: the sun turns a quarter as the page eases to the other theme. */
export function ThemeButton({dark,onToggle}:{dark:boolean,onToggle:()=>void}){
 return <button type="button" className="gbtn gbtn-icon theme-button" onClick={onToggle} aria-label={dark?'Switch to light mode':'Switch to dark mode'} title={dark?'Light mode':'Dark mode'}>
  <m.span key={dark?'d':'l'} initial={{rotate:-90,opacity:0}} animate={{rotate:0,opacity:1}} transition={spring.snappy} style={{display:'grid'}}>{dark?<Sun size={18}/>:<Moon size={18}/>}</m.span>
 </button>;
}

const VIEWS:[View,string,string][]=[['three-quarter','¾','Three-quarter view'],['front','F','Front view'],['side','S','Side view'],['back','B','Back view']];

/** Camera views, then rotate, light and reset. Vertical on phones (views only, plus rotate). */
export function ViewPill({view,explode,rotate,lighting,vertical,onView,onRotate,onLight,onReset}:{view:View,explode:number,rotate:boolean,lighting:boolean,vertical?:boolean,onView:(v:View)=>void,onRotate:()=>void,onLight?:()=>void,onReset?:()=>void}){
 return <nav className={`vpill ${vertical?'vpill-col':''}`} aria-label="Camera">
  {VIEWS.map(([v,short,name])=><button type="button" key={v} className={`vbtn ${view===v?'is-on':''}`} aria-pressed={view===v} disabled={explode>.8&&v!=='front'} onClick={()=>onView(v)} title={name} aria-label={name}>{short}</button>)}
  <span className="vsep" aria-hidden="true"/>
  <button type="button" className={`vbtn ${rotate?'is-on':''}`} disabled={explode>=.4} onClick={onRotate} aria-pressed={rotate} aria-label={rotate?'Pause rotation':'Rotate the body'} title="Auto-rotate">{rotate?<Pause size={17}/>:<RotateCw size={17}/>}</button>
  {onLight&&<button type="button" className={`vbtn ${lighting?'is-on':''}`} onClick={onLight} aria-pressed={lighting} aria-label={lighting?'Finish moving the light':'Move the light'} title="Light"><Lightbulb size={17}/></button>}
  {onReset&&<button type="button" className="vbtn" onClick={onReset} aria-label="Reset the view and systems" title="Reset"><RotateCcw size={17}/></button>}
 </nav>;
}

/** One quiet line of help. Changing text cross-fades; there is only ever one hint. */
export function Hint({id,children,className}:{id:string,children:ReactNode,className?:string}){
 return <m.p className={`hint-line ${className??''}`} key={id} initial={{opacity:0}} animate={{opacity:1}} transition={tween('out',DUR.enter,DUR.enterDelay)}>{children}</m.p>;
}

export type FocusToggle='neighbours'|'labels'|'behind';
/** Focus mode's pill: the four views, then neighbours (ghosts), labels and pins behind, in mint when on. Phones show the
 * three toggles only. */
export function FocusPill({view,options,onView,onToggle,compact}:{view:View,options:Record<FocusToggle,boolean>,onView?:(v:View)=>void,onToggle:(k:FocusToggle)=>void,compact?:boolean}){
 const toggles:[FocusToggle,ReactNode,string][]=[['neighbours',<Layers size={17} key="n"/>,'Neighbouring structures'],['labels',<Tag size={17} key="l"/>,'Labels'],['behind',<Eye size={17} key="b"/>,'Pins on the far side']];
 return <nav className="vpill" aria-label="Focus">
  {!compact&&onView&&<>{VIEWS.map(([v,short,name])=><button type="button" key={v} className={`vbtn ${view===v?'is-on':''}`} aria-pressed={view===v} onClick={()=>onView(v)} title={name} aria-label={name}>{short}</button>)}<span className="vsep" aria-hidden="true"/></>}
  {toggles.filter(([k])=>!compact||k!=='behind').map(([k,icon,name])=><button type="button" key={k} className={`vbtn ${options[k]?'is-mint':''}`} aria-pressed={options[k]} onClick={()=>onToggle(k)} title={name} aria-label={`${options[k]?'Hide':'Show'} ${name.toLowerCase()}`}>{icon}</button>)}
 </nav>;
}

/** Back out of focus. Desktop shows the Esc key beside it; on phones its label follows where Back goes. */
export function BackButton({label,onBack,esc}:{label:string,onBack:()=>void,esc?:boolean}){
 return <div className="back-row"><button type="button" className="gbtn back-button" onClick={onBack}><ChevronLeft size={18}/><m.span key={label} initial={{opacity:0}} animate={{opacity:1}} transition={tween('io',.24,.1)}>{label}</m.span></button>{esc&&<kbd className="kbd">Esc</kbd>}</div>;
}
