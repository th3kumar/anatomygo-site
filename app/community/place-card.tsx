import {AnimatePresence,m} from 'motion/react';
import {Check} from 'lucide-react';
import {spring,tween} from '../motion';
import type {Draft} from './placing';

/** The step card while a pin is placed (films K7–K9, P4–P5). One instruction per step, and Cancel is the one way out.
 * A part that isn't listed is named first; every suggestion is saved as a point. */
const META={first_pin:'Pin a part',correction:'Suggest a spot',new:'Add a missing part'} as const;
export type Refusal='miss'|'back_face'|'degenerate';
export function PlaceSteps({phone,draft,structure,refused,state,error,onName,onNote,onSave,onCancel}:{phone:boolean;draft:Draft;structure:string;refused:Refusal|null;
 state:'idle'|'saving'|'saved';error:string;onName:(s:string)=>void;onNote:(s:string)=>void;onSave:()=>void;onCancel:()=>void}){
 const placed=!!draft.anchor,naming=draft.kind==='new',ready=placed&&(!naming||draft.label.trim().length>0);
 const why=refused==='miss'?`That’s off the ${structure.toLowerCase()}.`:refused==='back_face'?'Turn the model to face that side.':refused==='degenerate'?'Try a spot just beside it.':'';
 let n=0;const step=(done:boolean,active:boolean)=>{n++;return <span className={`step-dot ${active?'is-active':''} ${done?'is-done':''}`} aria-hidden="true">
  <AnimatePresence initial={false} mode="popLayout">{done?<m.span key="ok" className="step-check" initial={{scale:.6,opacity:0}} animate={{scale:1,opacity:1,transition:spring.drop}} exit={{opacity:0}}><Check size={13} strokeWidth={3}/></m.span>:<m.span key="n" exit={{opacity:0,transition:tween('in',.1)}}>{n}</m.span>}</AnimatePresence></span>;};
 return <div className="place-steps">
  <p className="t-meta">{META[draft.kind]}</p>
  <h2 className="t-title card-title cap">{naming?draft.label.trim()||'New part':draft.label}</h2>
  {draft.latin&&<p className="t-meta latin">{draft.latin}</p>}
  <ol className="steps">
   {naming&&<li className="step">{step(draft.label.trim().length>0,true)}<input className="field" value={draft.label} onChange={e=>onName(e.target.value)} maxLength={160} placeholder="Part name" aria-label="Part name" autoFocus={!phone}/></li>}
   <li className="step">{step(placed,!placed)}<div><p className={placed?'t-body2':'t-body'}>{placed?'Placed':phone?'Tap where it sits':'Place the pin'}</p>{why&&!placed&&<p className="t-meta step-why" role="status">{why}</p>}</div></li>
   <li className="step">{step(false,false)}<div className="step-grow"><p className="t-body2">Add a note <span className="t-meta">· optional</span></p>
    <AnimatePresence initial={false}>{placed&&<m.div key="note" className="note-wrap" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1,transition:{height:spring.card,opacity:tween('out',.2,.08)}}} exit={{height:0,opacity:0,transition:tween('in',.14)}}>
     <textarea className="field note" value={draft.note} onChange={e=>onNote(e.target.value)} maxLength={4000} rows={3} aria-label="Note"/></m.div>}</AnimatePresence></div></li>
  </ol>
  {error&&<p className="t-meta step-why" role="alert">{error}</p>}
  {/* One row: the way out on the left, the main action on the right. */}
  <div className="action-row">
   {state!=='saved'&&<button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>}
   <m.button type="button" className={`btn-accent save-pin ${state==='saved'?'is-wide':''}`} disabled={!ready||state!=='idle'} onClick={onSave} whileTap={ready?{scale:.98}:undefined}>{state==='saved'?'✓ Saved':state==='saving'?'Saving…':'Save pin'}</m.button>
  </div>
 </div>;
}
