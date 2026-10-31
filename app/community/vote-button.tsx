import {useRef} from 'react';
import {AnimatePresence,m} from 'motion/react';
import {ThumbsUp} from 'lucide-react';
import {tween} from '../motion';

/** The thumb (film C1): it pops ×1.18, the button tints mint in 0.12 s, and the count rolls, the old number leaving
 * the way the count moves and the new one arriving from the other side. */
export function VoteButton({on,count,onClick}:{on:boolean;count:number;onClick:()=>void}){
 const last=useRef(count),dir=count>=last.current?1:-1;last.current=count;
 return <button type="button" className={`vote ${on?'is-on':''}`} aria-pressed={on} aria-label={`Looks right${count?`: ${count} agree`:''}`} onClick={onClick}>
  <m.span className="vote-thumb" animate={on?{scale:[1,1.18,1]}:{scale:1}} transition={{duration:.26,ease:'easeOut'}}><ThumbsUp size={15}/></m.span>
  <span className="vote-count"><AnimatePresence initial={false} mode="popLayout" custom={dir}>
   <m.span key={count} custom={dir} variants={{enter:(d:number)=>({y:8*d,opacity:0}),center:{y:0,opacity:1},exit:(d:number)=>({y:-8*d,opacity:0})}} initial="enter" animate="center" exit="exit" transition={tween('out',.18)}>{count}</m.span>
  </AnimatePresence></span>
 </button>;
}
