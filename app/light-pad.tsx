import {useRef} from 'react';
import {m} from 'motion/react';
import {Sun} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {movedLight,type Light} from './lighting';
import {tween} from './motion';

const HANDLE=48,STEP=.05;

/** Covers the stage while the light is being moved, so dragging moves the light instead of the camera. The overlay fades
 * in and out (render it inside AnimatePresence) and its bar rises a little as it arrives. */
export default function LightPad({light,onMove,onReset,onDone}:{light:Light,onMove:(l:Light)=>void,onReset:()=>void,onDone:()=>void}){
 const pad=useRef<HTMLDivElement>(null),handle=useRef<HTMLButtonElement>(null),dragging=useRef(false);
 const place=(e:React.PointerEvent)=>{
  const r=pad.current!.getBoundingClientRect(),radius=HANDLE/2;
  onMove(movedLight((e.clientX-r.left-radius)/Math.max(1,r.width-HANDLE),(e.clientY-r.top-radius)/Math.max(1,r.height-HANDLE)));
 };
 const key=(e:React.KeyboardEvent)=>{
  const moves:Record<string,[number,number]>={ArrowLeft:[-STEP,0],ArrowRight:[STEP,0],ArrowUp:[0,-STEP],ArrowDown:[0,STEP]};
  if(moves[e.key]){e.preventDefault();onMove(movedLight(light.x+moves[e.key][0],light.y+moves[e.key][1]));}
  else if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();onDone();}
 };
 const end=()=>{dragging.current=false;};
 return <m.div className="light-overlay" initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.2)}} exit={{opacity:0,transition:tween('in',.14)}} onPointerDown={e=>{dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);place(e);}} onPointerMove={e=>{if(dragging.current)place(e);}} onPointerUp={end} onPointerCancel={end}>
  <div className="light-pad" ref={pad}>
   <button ref={handle} className="light-handle" style={{left:`calc(${light.x} * (100% - ${HANDLE}px))`,top:`calc(${light.y} * (100% - ${HANDLE}px))`}} onKeyDown={key} aria-label="Light position. Use the arrow keys to move the light." aria-valuetext={`${Math.round(light.x*100)} percent across, ${Math.round(light.y*100)} percent down`}><Sun size={24}/></button>
  </div>
  <m.div className="light-bar glass" initial={{opacity:0,y:8}} animate={{opacity:1,y:0,transition:tween('out',.24,.05)}} onPointerDown={e=>e.stopPropagation()}>
   <span>Tap or drag to move the light</span>
   <Button variant="ghost" className="light-reset" onClick={onReset}>Reset</Button>
   <Button className="primary-action light-done" onClick={onDone}>Done</Button>
  </m.div>
 </m.div>;
}
