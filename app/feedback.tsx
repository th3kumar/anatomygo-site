import {useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {m,useDragControls} from 'motion/react';
import {ChevronDown,X} from 'lucide-react';
import {DUR,spring,tween} from './motion';
import {Textarea} from '@/components/ui/textarea';
import {Input} from '@/components/ui/input';
import {track,bucket} from './analytics';
import './feedback.css';

/** Feedback from visitors: a short message and, if they want a reply, an email. It goes to the private table in
 * supabase/migrations/202610260001_site_feedback.sql with coarse context (device class, minutes of use, structures
 * opened). Analytics only learn that feedback was sent, never its words. */
export type FeedbackSource='prompt'|'about';
export type FeedbackContext=Record<string,string|number>;
const EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FAILED="That didn't send. Please check your connection and try again.";

async function send(message:string,email:string,source:FeedbackSource,context:FeedbackContext){
 // Local dev preview (?feedback_preview): pretend to send, so the thank-you state can be reviewed without a database.
 if(import.meta.env.DEV&&new URLSearchParams(location.search).has('feedback_preview')){await new Promise(r=>setTimeout(r,700));return;}
 const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error('Feedback is not set up on this copy of the site.');
 let r:Response;
 // A network failure surfaces as the browser's own wording ("Failed to fetch"); show ours instead.
 try{r=await fetch(`${url}/rest/v1/rpc/site_feedback_submit`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_message:message,p_email:email,p_source:source,p_context:context})});}catch{throw Error(FAILED);}
 if(!r.ok)throw Error(/Too many/.test(await r.text().catch(()=>''))?'Lots of messages are arriving right now. Please try again in a minute.':FAILED);
}

/** The form itself, shared by the pop-up card and About. */
export function FeedbackForm({source,context,onSent}:{source:FeedbackSource;context:()=>FeedbackContext;onSent?:()=>void}){
 const id=useId(),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState('');
 const text=message.trim(),address=email.trim(),badEmail=!!address&&!EMAIL.test(address);
 if(state==='sent')return <m.div className="feedback-done" role="status" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={tween('out',DUR.enter)}><strong className="t-title">Thank you.</strong><p className="t-body2">We read every message.{address?' We’ll write if we have a question.':''}</p></m.div>;
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(text.length<2||badEmail||state==='sending')return;setState('sending');setError('');
  try{await send(text,address,source,context());setState('sent');track('feedback_sent',{ui_source:source,kind:address?'with_email':'no_email',count:bucket(text.length)});onSent?.();}
  catch(err){setState('idle');setError(err instanceof Error?err.message:FAILED);track('feedback_failed',{ui_source:source});}};
 return <form className="feedback-form" onSubmit={submit} noValidate>
  <label htmlFor={`${id}-message`} className="sr-only">Your feedback</label>
  <Textarea id={`${id}-message`} value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} rows={4} placeholder="What helped, what didn’t, what’s missing?"/>
  <label htmlFor={`${id}-email`} className="t-meta">Email for a reply <span>· optional</span></label>
  <Input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} placeholder="you@example.com" aria-invalid={badEmail||undefined} aria-describedby={badEmail?`${id}-hint`:undefined}/>
  {badEmail&&<p id={`${id}-hint`} className="feedback-hint">That email looks incomplete.</p>}
  {error&&<p className="feedback-hint" role="alert">{error}</p>}
  <button type="submit" className="btn-accent feedback-send" disabled={text.length<2||badEmail||state==='sending'}>{state==='sending'?'Sending…':'Send'}</button>
 </form>;
}

/** The pop-up, in the structure card's shell: a small card at the bottom right on a desktop, a bottom sheet on a phone
 * that rises above the keyboard and closes when pulled down. It never covers the model's middle or moves the camera. */
export function FeedbackPrompt({phone,context,onClose}:{phone:boolean;context:()=>FeedbackContext;onClose:(sent:boolean)=>void}){
 const id=useId(),[sent,setSent]=useState(false),drag=useDragControls();
 useEffect(()=>{const vv=window.visualViewport;if(!vv)return;const fit=()=>document.documentElement.style.setProperty('--keyboard',`${Math.max(0,innerHeight-vv.height-vv.offsetTop)}px`);vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit);fit();return()=>{vv.removeEventListener('resize',fit);vv.removeEventListener('scroll',fit);document.documentElement.style.removeProperty('--keyboard');};},[]);
 const close=()=>onClose(sent);
 const body=<div className="card-body">
  <div className="card-head" onPointerDown={phone?e=>drag.start(e):undefined}>
   <div className="card-row"><p className="t-meta">Feedback</p>{phone&&<button type="button" className="card-x" onClick={close} aria-label="Close feedback"><ChevronDown size={18}/></button>}</div>
   {sent?<h2 id={`${id}-title`} className="sr-only">Feedback sent</h2>:<h2 id={`${id}-title`} className="t-title card-title">How’s AnatomyGo working for you?</h2>}
  </div>
  <div className="card-page feedback-page"><FeedbackForm source="prompt" context={context} onSent={()=>{setSent(true);try{localStorage.setItem('anatomygo.feedback',JSON.stringify({state:'sent',at:new Date().toISOString().slice(0,10)}));}catch{}}}/></div>
 </div>;
 return createPortal(phone
  ?<m.section className="sheet scard is-sheet feedback-card" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
    drag="y" dragControls={drag} dragListener={false} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.7}}
    onDragEnd={(_,i)=>{if(i.offset.y>90||i.velocity.y>600)close();}}
    initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%',transition:tween('in',.22)}} transition={spring.sheet}>
    <span className="grab-zone" onPointerDown={e=>drag.start(e)}><span className="grab" aria-hidden="true"/></span>{body}
   </m.section>
  :<m.section className="panel scard feedback-card" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
    initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.98,transition:tween('in',.18)}} transition={{...spring.card,opacity:tween('out',.22)}}>
    <button type="button" className="card-corner" onClick={close} aria-label="Close feedback" title="Close"><span className="card-corner-icon" aria-hidden="true"><X size={17}/></span></button>{body}
   </m.section>,document.body);
}
