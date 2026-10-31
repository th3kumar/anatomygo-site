/** Phone tabs as a pager: the pages sit side by side and follow a sideways finger, and the tab indicator rides along.
 * Let go past a quarter of the width (or flick) and the next page settles in; otherwise it springs back. A tap on a tab
 * slides the same way. Past the first or last page the drag gives a little, then springs back. */
import {useEffect,useRef,type ReactNode} from 'react';
import {animate,m,useMotionValue,useTransform,type MotionValue} from 'motion/react';
import {reducedMotion,spring} from './motion';

const GAP=24;

export function usePager(count:number,at:number,go:(i:number)=>void){
 // The page shown, as a number: 0.5 is halfway between the first and second page.
 const pos=useMotionValue(at),aim=useRef(at);
 useEffect(()=>{if(aim.current===at)return;aim.current=at;if(reducedMotion())pos.set(at);else animate(pos,at,spring.snappy);},[at]);
 const down=(e:React.PointerEvent<HTMLElement>)=>{
  if(e.button>0||(e.target as Element).closest('input,textarea,select,[contenteditable]'))return;
  const id=e.pointerId,x0=e.clientX,y0=e.clientY,w=e.currentTarget.offsetWidth+GAP,base=aim.current;
  let on=false,from=0,last=x0,t=performance.now(),v=0;
  const move=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;const dx=ev.clientX-x0,dy=ev.clientY-y0;
   if(!on){if(Math.abs(dx)<6&&Math.abs(dy)<6)return;if(Math.abs(dy)>=Math.abs(dx)){end();return;}on=true;pos.stop();from=pos.get();}
   const now=performance.now();v=(ev.clientX-last)/Math.max(1,now-t)*1000;last=ev.clientX;t=now;
   const raw=from-dx/w,edge=raw<0?raw:raw>count-1?raw-(count-1):0;
   pos.set(raw-edge+edge*.3);};
  const up=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;end();if(!on)return;
   // The tap that ends a swipe must not open a row.
   const stop=(c:Event)=>{c.stopPropagation();c.preventDefault();};addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>removeEventListener('click',stop,{capture:true}),0);
   const moved=pos.get()-base,dir=v<-500||(v<=500&&moved>.25)?1:v>500||moved<-.25?-1:0;
   const to=Math.max(0,Math.min(count-1,base+dir));aim.current=to;
   if(reducedMotion())pos.set(to);else animate(pos,to,{...spring.settle,velocity:-v/w});
   if(to!==at)go(to);};
  const end=()=>{removeEventListener('pointermove',move,true);removeEventListener('pointerup',up,true);removeEventListener('pointercancel',up,true);};
  addEventListener('pointermove',move,true);addEventListener('pointerup',up,true);addEventListener('pointercancel',up,true);
 };
 return {pos,down};
}

/** The pages in a row, moved by `pos`. Each page keeps its own scroll. */
export function PagerTrack({pos,children}:{pos:MotionValue<number>;children:ReactNode}){
 const transform=useTransform(pos,v=>`translateX(calc(${-v*100}% - ${v*GAP}px))`);
 return <m.div className="pager" style={{transform,gap:GAP}}>{children}</m.div>;
}

/** The tab indicator, at `pos` along tabs of equal width. */
export function PagerIndicator({pos,count}:{pos:MotionValue<number>;count:number}){
 const transform=useTransform(pos,v=>`translateX(calc(${v} * (100% + 2px)))`);
 return <m.span className="tab-ind" aria-hidden="true" style={{width:`calc((100% - 6px - ${(count-1)*2}px) / ${count})`,transform}}/>;
}
