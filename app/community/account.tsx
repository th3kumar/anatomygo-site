import {useState} from 'react';
import {AnimatePresence,m} from 'motion/react';
import {ChevronRight} from 'lucide-react';
import {tween} from '../motion';

/** Signed in: who you are, as a profile rather than a form. The name is the one on your pins (the Google first name
 * until changed); it becomes a field only when you choose Edit. Sign out is a quiet link at the end. */
export function Avatar({name,size='sm'}:{name:string;size?:'sm'|'lg'}){
 return <span className={`profile-avatar is-${size}`} aria-hidden="true">{(name||'?').charAt(0).toUpperCase()}</span>;
}

/** The row at the foot of the About tab that opens the profile. */
export function ProfileRow({name,onOpen}:{name:string;onOpen:()=>void}){
 return <button type="button" className="profile-row" onClick={onOpen}>
  <Avatar name={name}/><span className="profile-row-text"><span className="t-body">{name||'Your account'}</span><span className="t-meta">Signed in with Google</span></span><ChevronRight size={16} className="chev"/>
 </button>;
}

export function Profile({name,email,onSave,onSignOut,onReview}:{name:string;email:string;onSave:(name:string)=>Promise<void>;onSignOut:()=>void;onReview?:()=>void}){
 const [edit,setEdit]=useState<string|null>(null),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const value=edit?.trim()??'',ok=value.length>=2&&value!==name;
 const save=async()=>{if(!ok)return;setBusy(true);setNote('');try{await onSave(value);setEdit(null);}catch{setNote('That didn’t save. Please try again.');}finally{setBusy(false);}};
 return <div className="profile">
  <Avatar name={edit??name} size="lg"/>
  <AnimatePresence mode="wait" initial={false}>
   {edit===null
    ?<m.div key="show" className="profile-id" initial={{opacity:0,y:4}} animate={{opacity:1,y:0,transition:tween('out',.2)}} exit={{opacity:0,transition:tween('in',.1)}}>
      <h3 className="t-title">{name||'No name yet'}</h3>
      <p className="t-meta">{email}</p>
      <p className="t-meta profile-note">Shown on your pins · <button type="button" className="link-accent" onClick={()=>{setEdit(name);setNote('');}}>Edit</button></p>
     </m.div>
    :<m.form key="edit" className="profile-id" onSubmit={e=>{e.preventDefault();void save();}} initial={{opacity:0,y:4}} animate={{opacity:1,y:0,transition:tween('out',.2)}} exit={{opacity:0,transition:tween('in',.1)}}>
      <input className="profile-input t-title" value={edit} onChange={e=>setEdit(e.target.value)} maxLength={60} aria-label="Name on your pins" autoComplete="given-name" autoFocus/>
      <p className="t-meta">Shown on your pins</p>
      <div className="action-row"><button type="button" className="btn-quiet" onClick={()=>setEdit(null)}>Cancel</button><button type="submit" className="btn-accent" disabled={!ok||busy}>{busy?'Saving…':'Save'}</button></div>
     </m.form>}
  </AnimatePresence>
  {note&&<p className="t-meta profile-error" role="alert">{note}</p>}
  {onReview&&<button type="button" className="t-meta link-accent profile-admin" onClick={onReview}>Review queue</button>}
  <button type="button" className="t-meta link-quiet profile-out" onClick={onSignOut}>Sign out</button>
 </div>;
}
