import {useEffect,useState} from 'react';
import {Dialog} from './dialog';
import {rpc} from './cloud';
import {track} from '../analytics';
import {css} from '../motion';

/** The review queue (admins only): publish, unpublish, hide or move community pins, and map imported names to a
 * structure. Each row's actions are quiet links; the one chosen asks in place (Cancel | Publish), not in a second
 * dialog. Votes are a hint, not a decision: Open shows the pin on the model first. */
interface Item {id:string;landmark_id:string;mesh_id:string;label:string;description:string;structure:string;published:boolean;upvotes:number;downvotes:number;reports:number}
interface Unmapped {bucket_label:string;remaining:number}
type Action='publish'|'unpublish'|'hide'|'move';
const SORTS=[['new','Newest'],['supported','Most liked'],['reported','Reported']] as const;
const ASK:Record<Action,[string,string]>={publish:['Publish this pin?','Publish'],unpublish:['Unpublish this pin?','Unpublish'],hide:['Hide this pin?','Hide'],move:['Move this feature?','Move']};
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);

export function ReviewQueue({structures,onOpen,onClose}:{structures:{id:string;name:string}[];onOpen:(mesh:string,landmark:string,proposal:string)=>void;onClose:()=>void}){
 const [sort,setSort]=useState<string>('new'),[offset,setOffset]=useState(0),[rows,setRows]=useState<Item[]|null>(null),[unmapped,setUnmapped]=useState<Unmapped[]>([]);
 const [asking,setAsking]=useState<{id:string;action:Action}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[target,setTarget]=useState('');
 useEffect(()=>{let live=true;setError('');
  Promise.all([rpc<Item[]>('pg_admin_queue',{p_sort:sort,p_offset:offset}),rpc<Unmapped[]>('pg_unmapped',{})]).then(([q,u])=>{if(live){setRows(q);setUnmapped(u);}}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};},[sort,offset,revision]);
 const goal=structures.find(s=>s.id===target||s.name.toLowerCase()===target.trim().toLowerCase());
 const run=async(task:()=>Promise<unknown>,action:string)=>{setBusy(true);setError('');track('admin_action',{action});
  try{await task();setAsking(null);setRevision(n=>n+1);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const confirm=(p:Item,a:Action)=>run(()=>a==='move'?rpc('pg_move_landmark',{p_landmark:p.landmark_id,p_mesh:goal!.id}):rpc('pg_moderate',{p_proposal:p.id,p_action:a==='publish'?'approve':a}),a);
 const at=SORTS.findIndex(s=>s[0]===sort);
 return <Dialog title="Review queue" line="Open each pin on the model before publishing it." wide onClose={onClose}>
  <div className="tabs queue-tabs" role="tablist" aria-label="Sort">
   <span className="tab-ind" aria-hidden="true" style={{width:'calc((100% - 6px - 4px) / 3)',transform:`translateX(calc(${at} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}`}}/>
   {SORTS.map(([id,label])=><button type="button" role="tab" key={id} aria-selected={sort===id} className={`tab ${sort===id?'is-on':''}`} onClick={()=>{setSort(id);setOffset(0);}}>{label}</button>)}
  </div>
  {error&&<p className="t-meta dialog-problem" role="alert">{error}</p>}
  <div className="queue">
   {rows===null?<p className="t-meta">Loading…</p>:rows.length===0?<p className="t-body2">Nothing waiting.</p>:rows.map(p=><div key={p.id} className="queue-row">
    <p className="t-body">{p.label}{p.published&&<span className="t-meta queue-tag"> · Published</span>}</p>
    <p className="t-meta">{cap(p.structure)} · {p.upvotes} agree · {p.downvotes} don’t{p.reports>0&&<span className="queue-reports"> · {p.reports} report{p.reports===1?'':'s'}</span>}</p>
    {asking?.id===p.id
     ?<div className="queue-ask"><p className="t-body2">{ASK[asking.action][0]}{asking.action==='move'&&goal?` To ${goal.name}.`:''}</p>
       <div className="action-row"><button type="button" className="btn-quiet" onClick={()=>setAsking(null)}>Cancel</button><button type="button" className={asking.action==='hide'||asking.action==='move'?'btn-quiet btn-danger':'btn-accent'} disabled={busy} onClick={()=>void confirm(p,asking.action)}>{busy?'Working…':ASK[asking.action][1]}</button></div></div>
     :<p className="t-meta queue-links">
       <button type="button" className="link-accent" onClick={()=>onOpen(p.mesh_id,p.landmark_id,p.id)}>Open</button>
       <button type="button" className="link-quiet" disabled={!p.published&&!p.description.trim()} title={!p.published&&!p.description.trim()?'Needs a description first':undefined} onClick={()=>setAsking({id:p.id,action:p.published?'unpublish':'publish'})}>{p.published?'Unpublish':'Publish'}</button>
       <button type="button" className="link-quiet" onClick={()=>setAsking({id:p.id,action:'hide'})}>Hide</button>
       <button type="button" className="link-quiet" disabled={!goal||goal.id===p.mesh_id} title={goal?undefined:'Choose a structure below first'} onClick={()=>setAsking({id:p.id,action:'move'})}>Move</button>
      </p>}
   </div>)}
  </div>
  {(offset>0||(rows?.length??0)>=50)&&<p className="t-meta queue-pages"><button type="button" className="link-quiet" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>‹ Previous</button><button type="button" className="link-quiet" disabled={(rows?.length??0)<50} onClick={()=>setOffset(offset+50)}>Next ›</button></p>}
  <div className="queue-tools">
   <label className="t-meta" htmlFor="queue-target">Structure for Move and mapping</label>
   <input id="queue-target" className="field" list="queue-structures" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Type a name or ID"/>
   <datalist id="queue-structures">{structures.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</datalist>
   {goal&&<p className="t-meta">{goal.name}</p>}
   {unmapped.map(u=><p key={u.bucket_label} className="t-body2 queue-map"><span>{u.bucket_label} <span className="t-meta">· {u.remaining}</span></span>
    <button type="button" className="link-accent" disabled={!goal||busy} onClick={()=>void run(()=>rpc('pg_map_import',{p_bucket:u.bucket_label,p_mesh:goal!.id}),'map_names')}>Map here</button></p>)}
  </div>
 </Dialog>;
}
