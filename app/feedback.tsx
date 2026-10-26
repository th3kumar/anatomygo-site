import {useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
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
 const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error('Feedback is not set up on this copy of the site.');
 let r:Response;
 // A network failure surfaces as the browser's own wording ("Failed to fetch"); show ours instead.
 try{r=await fetch(`${url}/rest/v1/rpc/site_feedback_submit`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_message:message,p_email:email,p_source:source,p_context:context})});}catch{throw Error(FAILED);}
 if(!r.ok)throw Error(/Too many/.test(await r.text().catch(()=>''))?'Lots of messages are arriving right now. Please try again in a minute.':FAILED);
}

/** The form itself, shared by the pop-up card and the About sheet. */
export function FeedbackForm({source,context,onSent,secondary}:{source:FeedbackSource;context:()=>FeedbackContext;onSent?:()=>void;secondary?:{label:string;onClick:()=>void}}){
 const id=useId(),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState('');
 const text=message.trim(),address=email.trim(),badEmail=!!address&&!EMAIL.test(address);
 if(state==='sent')return <div className="feedback-done" role="status"><strong>Thank you.</strong><p>We read every message.{address?' If we have a question, we’ll write to you.':''}</p>{secondary&&<button className="feedback-later" onClick={secondary.onClick}>Close</button>}</div>;
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(text.length<2||badEmail||state==='sending')return;setState('sending');setError('');
  try{await send(text,address,source,context());setState('sent');track('feedback_sent',{ui_source:source,kind:address?'with_email':'no_email',count:bucket(text.length)});onSent?.();}
  catch(err){setState('idle');setError(err instanceof Error?err.message:FAILED);track('feedback_failed',{ui_source:source});}};
 return <form className="feedback-form" onSubmit={submit} noValidate>
  <label htmlFor={`${id}-message`} className="feedback-sr">Your feedback</label>
  <Textarea id={`${id}-message`} value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} rows={4} placeholder="What worked, what didn’t, what you’d love to see next…"/>
  <label htmlFor={`${id}-email`}>Email, if you’d like a reply <span>(optional)</span></label>
  <Input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} placeholder="you@example.com" aria-invalid={badEmail||undefined} aria-describedby={`${id}-hint`}/>
  <p id={`${id}-hint`} className={`feedback-hint ${badEmail?'is-error':''}`}>{badEmail?'That email doesn’t look complete.':'Only used to reply to you.'}</p>
  {error&&<p className="feedback-error" role="alert">{error}</p>}
  <div className="feedback-actions">{secondary&&<button type="button" className="feedback-later" onClick={secondary.onClick}>{secondary.label}</button>}<button type="submit" className="feedback-send" disabled={text.length<2||badEmail||state==='sending'}>{state==='sending'?'Sending…':'Send feedback'}</button></div>
 </form>;
}

/** The pop-up: a small card that never blocks the model (a bottom sheet on phones that rises above the keyboard). */
export function FeedbackPrompt({context,onClose}:{context:()=>FeedbackContext;onClose:(sent:boolean)=>void}){
 const id=useId(),[sent,setSent]=useState(false);
 useEffect(()=>{const vv=window.visualViewport;if(!vv)return;const fit=()=>document.documentElement.style.setProperty('--keyboard',`${Math.max(0,innerHeight-vv.height-vv.offsetTop)}px`);vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit);fit();return()=>{vv.removeEventListener('resize',fit);vv.removeEventListener('scroll',fit);document.documentElement.style.removeProperty('--keyboard');};},[]);
 const close=()=>onClose(sent);
 return createPortal(<section className="feedback-card glass" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
  <button className="feedback-close" onClick={close} aria-label="Close feedback"><X size={16}/></button>
  {!sent&&<><div className="eyebrow">FEEDBACK</div><h2 id={`${id}-title`} className="feedback-title">How is AnatomyGo working for you?</h2>
  <p className="feedback-copy">We’re building this for learners like you. A few words on what helped, what got in the way, or what you’d like to see would mean a lot.</p></>}
  {sent&&<h2 id={`${id}-title`} className="feedback-sr">Feedback sent</h2>}
  <FeedbackForm source="prompt" context={context} onSent={()=>{setSent(true);try{localStorage.setItem('anatomygo.feedback',JSON.stringify({state:'sent',at:new Date().toISOString().slice(0,10)}));}catch{}}} secondary={sent?{label:'Close',onClick:close}:{label:'Not now',onClick:close}}/>
 </section>,document.body);
}
