/** Search a structure. Desktop: the field opens over the pill (which stays beneath it) and results open under it. Phone:
 * the pill flies up into the field (one shared layoutId) as a sheet fills in behind it, with Cancel beside it; closing flies
 * it back. Both are one combobox: arrows move through results, Enter opens one, Esc closes. */
import {useEffect,useId,useRef,useState} from 'react';
import {m} from 'motion/react';
import {Search as SearchIcon} from 'lucide-react';
import {spring,tween,DUR} from './motion';

export type Result={id:string,name:string,meta:string};
const PLACEHOLDER='Search femur, deltoid, heart…';

function bold(name:string,query:string){
 const q=query.trim(),i=q?name.toLowerCase().indexOf(q.toLowerCase()):-1;
 return i<0?name:<>{name.slice(0,i)}<b>{name.slice(i,i+q.length)}</b>{name.slice(i+q.length)}</>;
}

// The phone pill and the phone field are one element to the layout animation; radii as numbers so it can correct them.
const FIELD='search-field';
export function SearchPill({onOpen,phone}:{onOpen:()=>void,phone?:boolean}){
 return <m.button type="button" className={`search-pill ${phone?'is-phone':''}`} onClick={onOpen} aria-label="Search a structure" layoutId={phone?FIELD:undefined} transition={spring.sheet} style={phone?{borderRadius:16}:undefined}>
  <SearchIcon size={18}/><span className="ph">{phone?'Search':PLACEHOLDER}</span>{!phone&&<kbd className="kbd">/</kbd>}
 </m.button>;
}

/** Structures first, then parts & features on them; the arrow keys move through both groups as one list. */
export function SearchPanel({phone,query,setQuery,results,features=[],note,onChoose,onClose}:{phone:boolean,query:string,setQuery:(q:string)=>void,results:Result[],features?:Result[],note:string,onChoose:(id:string)=>void,onClose:()=>void}){
 const all=[...results,...features];
 const [active,setActive]=useState(0),input=useRef<HTMLInputElement>(null),list=useId(),byKey=useRef(false);
 useEffect(()=>{setActive(0);},[query]);
 useEffect(()=>{input.current?.focus();},[]);
 const key=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();byKey.current=true;setActive(a=>Math.min(all.length-1,a+1));}
  else if(e.key==='ArrowUp'){e.preventDefault();byKey.current=true;setActive(a=>Math.max(0,a-1));}
  else if(e.key==='Enter'&&all[active]){e.preventDefault();onChoose(all[active].id);}
  else if(e.key==='Escape'){e.preventDefault();onClose();}
 };
 // Only the arrow keys scroll the list: a row under the pointer (or a finger starting a swipe) must not move it.
 useEffect(()=>{if(!byKey.current)return;byKey.current=false;document.getElementById(`${list}-${active}`)?.scrollIntoView({block:'nearest'});},[active,list]);
 const field=<m.div className={`search-field ${phone?'is-phone':''}`} layoutId={phone?FIELD:undefined} transition={spring.sheet} style={phone?{borderRadius:14}:undefined}>
  <SearchIcon size={18}/>
  <input ref={input} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={key} placeholder={phone?'Search':PLACEHOLDER} role="combobox" aria-expanded={all.length>0} aria-controls={list} aria-activedescendant={all.length?`${list}-${active}`:undefined} aria-autocomplete="list" aria-label="Search a structure" autoComplete="off" spellCheck={false} enterKeyHint="search"/>
  {!phone&&<kbd className="kbd">Esc</kbd>}
 </m.div>;
 const row=(r:Result,i:number)=><li key={r.id} id={`${list}-${i}`} role="option" aria-selected={i===active} className={`result ${i===active?'is-active':''}`} onPointerEnter={e=>{if(e.pointerType!=='touch')setActive(i);}} onClick={()=>onChoose(r.id)}>
  <span className="result-name">{bold(r.name,query)}</span><span className="t-meta">{r.meta}</span>
 </li>;
 const body=<>
  <p className="t-label search-group">{query.trim()?'Structures':'Start with'}</p>
  <div id={list} role="listbox" aria-label="Search results">
   <ul className="search-results" role="group" aria-label="Structures">{results.map((r,i)=>row(r,i))}</ul>
   {features.length>0&&<><p className="t-label search-group">Parts &amp; features</p><ul className="search-results" role="group" aria-label="Parts and features">{features.map((r,i)=>row(r,results.length+i))}</ul></>}
  </div>
  {query.trim()&&!all.length&&<p className="t-body2 search-empty">Nothing matches “{query.trim()}”.</p>}
  <p className="t-meta search-note">{note}</p>
 </>;
 if(phone)return <>
  <m.div className="search-scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={tween('out',DUR.enter)} onClick={onClose}/>
  <m.section className="sheet search-sheet" role="dialog" aria-label="Search" initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0,transition:tween('in',.2)}} transition={{...spring.sheet,delay:.06}}>
   <span className="grab" aria-hidden="true"/>
   <div className="search-scroll">{body}</div>
  </m.section>
  {/* Outside the sliding sheet, so the flying field isn't moved twice; fixed where the sheet leaves room for it. */}
  <div className="search-top" role="group" aria-label="Search">{field}<m.button type="button" className="search-cancel" onClick={onClose} initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.2,.06)}} exit={{opacity:0,transition:tween('in',.14)}}>Cancel</m.button></div>
 </>;
 return <>
  <div className="search-catch" onPointerDown={onClose}/>
  <m.section className="search-pop" role="dialog" aria-label="Search" initial={{opacity:0,y:-6,scale:.99}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6,transition:tween('in',DUR.leave)}} transition={spring.card}>
   {field}
   <div className="search-scroll">{body}</div>
  </m.section>
 </>;
}
