import {useState} from 'react';
import {AnimatePresence,m} from 'motion/react';
import {ChevronDown} from 'lucide-react';
import {spring,tween} from '../motion';
import {track,bucket} from '../analytics';
import type {Remark,Spot} from './feature-detail';

/** Under a feature's byline: the other spots people placed for it, and the comments on the spot being viewed. Each is
 * one quiet row that folds open; with nothing to show, it isn't there. */
const day=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{day:'numeric',month:'short'});
function Fold({label,count,onOpen,children}:{label:string;count:number;onOpen?:()=>void;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <div className="fold">
  <button type="button" className="fold-row" aria-expanded={open} onClick={()=>{if(!open)onOpen?.();setOpen(!open);}}>
   <span>{label}{count>0&&<span className="t-meta"> · {count}</span>}</span><ChevronDown size={16} className="fold-chev"/></button>
  <AnimatePresence initial={false}>{open&&<m.div key="body" className="fold-body" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1,transition:{height:spring.card,opacity:tween('out',.2,.06)}}} exit={{height:0,opacity:0,transition:tween('in',.14)}}>
   <div className="fold-inner">{children}</div></m.div>}</AnimatePresence>
 </div>;
}

export function FeatureExtras({spots,current,onPick,remarks,more,onOlder,me,admin,onPost,onRemove}:{spots:Spot[];current:string|null;onPick:(s:Spot)=>void;
 remarks:Remark[];more:boolean;onOlder:()=>void;me:string|null;admin:boolean;onPost:(text:string)=>Promise<boolean>;onRemove:(id:string)=>void}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false);
 const post=async()=>{const t=text.trim();if(!t||busy)return;setBusy(true);if(await onPost(t)){track('comment_posted',{length:bucket(t.length)});setText('');}setBusy(false);};
 return <div className="feature-extras">
  {spots.length>1&&<Fold label="Other spots" count={spots.length-1}>
   <div className="list">{spots.map(s=><button type="button" key={s.proposal} className={`row spot-row ${s.proposal===current?'is-on':''}`} aria-pressed={s.proposal===current} onClick={()=>onPick(s)}>
    <span className="spot-who"><span className="avatar" aria-hidden="true">{(s.by||'·').charAt(0).toUpperCase()}</span><span>{s.by===null?'Starter pin':s.by||'Community'}<span className="t-meta"> · {day(s.at)}</span></span></span>
    <span className="t-meta">{s.proposal===current?'Shown':`${s.upvotes} agree`}</span></button>)}</div>
  </Fold>}
  {current&&<Fold label="Comments" count={remarks.length} onOpen={()=>track('comments_opened',{count:bucket(remarks.length)})}>
   {remarks.map(c=><div key={c.id} className="remark">
    <p className="t-meta"><strong>{c.by}</strong> · {day(c.at)}{(c.author===me||admin)&&<> · <button type="button" className="link-quiet" onClick={()=>onRemove(c.id)}>Delete</button></>}</p>
    <p className="t-body2">{c.body}</p></div>)}
   {more&&<button type="button" className="t-meta link-quiet" onClick={onOlder}>Older comments</button>}
   <textarea className="field remark-field" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} rows={2} placeholder="Add a comment" aria-label="Your comment"/>
   {text.trim()&&<div className="remark-send"><button type="button" className="btn-accent" disabled={busy} onClick={()=>void post()}>{busy?'Posting…':'Post'}</button></div>}
  </Fold>}
 </div>;
}
