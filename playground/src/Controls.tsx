import { useState, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Eye, FlipHorizontal2, Layers, Maximize2, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ViewName } from './scene'
export const views:{view:ViewName;short:string;label:string}[]=[{view:'oblique',short:'¾',label:'Three-quarter'},{view:'anterior',short:'A',label:'Anterior'},{view:'posterior',short:'P',label:'Posterior'},{view:'left',short:'L',label:'Left lateral'},{view:'right',short:'R',label:'Right lateral'},{view:'superior',short:'S',label:'Superior'},{view:'inferior',short:'I',label:'Inferior'}]
function TipButton({label,children,onClick,pressed}:{label:string;children:ReactNode;onClick():void;pressed?:boolean}) {
 const ref=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false),[position,setPosition]=useState({top:0,right:0})
 useLayoutEffect(()=>{if(open&&ref.current){const r=ref.current.getBoundingClientRect();setPosition({top:r.top+r.height/2,right:innerWidth-r.left+12})}},[open])
 return <><button ref={ref} aria-label={label} aria-pressed={pressed} onClick={onClick} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)}>{children}</button>{open&&createPortal(<div className="public-tooltip" role="tooltip" style={position}>{label}</div>,document.body)}</>
}
export type Toggles={neighbours:boolean;labels:boolean;hidden:boolean;reverse:boolean}
export function Controls({onFit,toggles,onToggle}:{onFit(v:ViewName):void;toggles:Toggles;onToggle(k:keyof Toggles):void}) {
 return <nav className="view-rail glass" data-coach="rail" aria-label="Camera and display">{views.map(v=><TipButton key={v.view} label={v.label} onClick={()=>onFit(v.view)}>{v.short}</TipButton>)}<i/>
 <TipButton label="Fit structure" onClick={()=>onFit('oblique')}><Maximize2 size={16}/></TipButton>
 {([['neighbours','Show neighbouring structures',<Layers size={16}/>],['labels','Label every pin',<Tags size={16}/>],['hidden','Show pins behind the surface',<Eye size={16}/>],['reverse','Allow reverse side',<FlipHorizontal2 size={16}/>]] as [keyof Toggles,string,ReactNode][]).map(([k,label,icon])=><TipButton key={k} label={label} pressed={toggles[k]} onClick={()=>onToggle(k)}>{icon}</TipButton>)}</nav>
}
