import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './tips.css';
type Side='left'|'right'|'top'|'bottom';
const GAP=14,EDGE=12;
const opposite:Record<Side,Side>={left:'right',right:'left',top:'bottom',bottom:'top'};
const across:Record<Side,Side[]>={left:['bottom','top'],right:['bottom','top'],top:['right','left'],bottom:['right','left']};
/** Places the card beside the target, on the preferred side if it fits, and always inside the window. */
function place(r:DOMRect,size:{width:number;height:number},preferred:Side){
 const room:Record<Side,number>={right:innerWidth-r.right,left:r.left,bottom:innerHeight-r.bottom,top:r.top};
 const need=(s:Side)=>(s==='left'||s==='right'?size.width:size.height)+GAP+EDGE;
 const side=[preferred,opposite[preferred],...across[preferred]].find(s=>room[s]>=need(s))??(room.bottom>=room.top?'bottom':'top');
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),v));
 if(side==='left'||side==='right'){const anchor=r.top+r.height/2,top=clamp(anchor-size.height/2,EDGE,innerHeight-size.height-EDGE);return {side,top,left:clamp(side==='right'?r.right+GAP:r.left-GAP-size.width,EDGE,innerWidth-size.width-EDGE),arrow:Math.max(16,Math.min(size.height-16,anchor-top))};}
 const anchor=r.left+r.width/2,left=clamp(anchor-size.width/2,EDGE,innerWidth-size.width-EDGE);
 return {side,left,top:clamp(side==='bottom'?r.bottom+GAP:r.top-GAP-size.height,EDGE,innerHeight-size.height-EDGE),arrow:Math.max(16,Math.min(size.width-16,anchor-left))};
}
/** A one-time tip pointing at a control, in the Playground's coach-mark style. It never blocks the page. */
export function Tip({target,side,children,onDone}:{target:string;side:Side;children:ReactNode;onDone():void}){
 const [rect,setRect]=useState<DOMRect|null>(null),card=useRef<HTMLDivElement>(null),[size,setSize]=useState<{width:number;height:number}|null>(null);
 useEffect(()=>{let frame=0,last='';const tick=()=>{const r=document.querySelector(target)?.getBoundingClientRect();const visible=r&&r.width&&getComputedStyle(document.querySelector(target)!).visibility!=='hidden';const key=visible?`${r.left}|${r.top}|${r.width}|${r.height}`:'';if(key!==last){last=key;setRect(key?r!:null);}frame=requestAnimationFrame(tick);};tick();return()=>cancelAnimationFrame(frame);},[target]);
 useLayoutEffect(()=>{if(!card.current)return;const r=card.current.getBoundingClientRect();if(!size||size.width!==r.width||size.height!==r.height)setSize({width:r.width,height:r.height});});
 if(!rect)return null;
 const p=size?place(rect,size,side):null;
 const style=(p?{left:p.left,top:p.top,'--arrow':`${p.arrow}px`}:{left:0,top:0,visibility:'hidden'}) as CSSProperties;
 // Rendered on <body>: the studio isolates its own stacking, and sheets live in their own portal.
 return createPortal(<div ref={card} className={`tip-card from-${p?.side??side}`} style={style} role="dialog" aria-label="Tip" aria-live="polite"><p>{children}</p><button onClick={onDone}>Got it</button></div>,document.body);
}
