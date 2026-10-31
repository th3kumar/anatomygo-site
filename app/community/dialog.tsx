import {useEffect,useId,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {m} from 'motion/react';
import {spring,tween} from '../motion';

/** A centred card over a scrim (the sign-in dialog's shell): a title, an optional line, then its content. Esc or the
 * scrim closes it. `wide` is for the review queue. */
export function Dialog({title,line,wide,onClose,children}:{title:string;line?:string;wide?:boolean;onClose:()=>void;children:ReactNode}){
 const id=useId();
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};addEventListener('keydown',esc,true);return()=>removeEventListener('keydown',esc,true);},[onClose]);
 return createPortal(<>
  <m.div className="dialog-scrim" aria-hidden="true" onClick={onClose} initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.2)}} exit={{opacity:0,transition:tween('in',.2)}}/>
  <div className="dialog-place"><m.section className={`panel dialog is-left ${wide?'is-wide':''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}
   initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1,transition:{...spring.card,opacity:tween('out',.18)}}} exit={{opacity:0,transition:tween('in',.14)}}>
   <h2 id={`${id}-t`} className="t-title">{title}</h2>
   {line&&<p className="t-body2">{line}</p>}
   {children}
  </m.section></div>
 </>,document.body);
}
