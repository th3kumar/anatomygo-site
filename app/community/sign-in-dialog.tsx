import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {m} from 'motion/react';
import {Flag,MessageCircle,Pin,ThumbsUp} from 'lucide-react';
import {googleAvailable,showGoogleButton} from './google';
import {spring,tween} from '../motion';
import {track} from '../analytics';

/** "Thanks for your vote / Sign in so it counts." (film C1) and "Thanks, pin saved / Sign in to publish it with your
 * name." (K9): asked only after the action has landed, never before it. Google's own button signs in; Later keeps the
 * action on this device. The dialog closes itself when the page sees the new session. */
const TEXT={vote:['Thanks for your vote','Sign in so it counts.'],pin:['Thanks, pin saved','Sign in to publish it with your name.'],report:['Report a problem','Sign in so we can review it.'],comment:['Join the conversation','Sign in to post your comment.']} as const;
export type SignInReason=keyof typeof TEXT;
const ICON={vote:ThumbsUp,pin:Pin,report:Flag,comment:MessageCircle};
export function SignInDialog({kind,dark,onLater}:{kind:SignInReason;dark:boolean;onLater:()=>void}){
 const Icon=ICON[kind],kept=kind==='vote'||kind==='pin';
 const id=useId(),slot=useRef<HTMLDivElement>(null),[problem,setProblem]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{const el=slot.current;if(!el)return;let live=true;
  if(!googleAvailable){setProblem('Sign-in isn’t set up on this copy of the site.');return;}
  showGoogleButton(el,{dark,width:Math.min(312,el.clientWidth||312)},error=>{if(error){track('sign_in_failed',{method:'google_button'});if(live)setProblem('Google sign-in didn’t finish. Please try again.');}},()=>track('sign_in_started',{method:'google_button'}))
   .then(()=>{if(live)setReady(true);}).catch(()=>{track('google_button_unavailable');if(live)setProblem('Google sign-in couldn’t load. Check your connection.');});
  return()=>{live=false;};},[dark]);
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onLater();}};addEventListener('keydown',esc,true);return()=>removeEventListener('keydown',esc,true);},[onLater]);
 return createPortal(<>
  <m.div className="dialog-scrim" aria-hidden="true" onClick={onLater} initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.2)}} exit={{opacity:0,transition:tween('in',.2)}}/>
  <div className="dialog-place"><m.section className="panel dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
   initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1,transition:{...spring.card,opacity:tween('out',.18)}}} exit={{opacity:0,transition:tween('in',.14)}}>
   <m.span className="dialog-badge" aria-hidden="true" initial={{scale:1}} animate={{scale:[1,1.12,1]}} transition={{duration:.4,delay:.12,ease:'easeInOut'}}><Icon size={18}/></m.span>
   <h2 id={`${id}-t`} className="t-title">{TEXT[kind][0]}</h2>
   <p id={`${id}-d`} className="t-body2">{TEXT[kind][1]}</p>
   <div ref={slot} className={`google-slot ${ready?'is-ready':''}`}/>
   {problem&&<p className="t-meta dialog-problem" role="alert">{problem}</p>}
   <button type="button" className="t-meta link-quiet dialog-later" onClick={onLater}>{kept?'Later? It stays on this device only.':'Not now'}</button>
  </m.section></div>
 </>,document.body);
}
