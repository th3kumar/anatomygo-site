/** Search a structure. Desktop: the pill becomes the field and results open under it. Phone: a sheet rises with the field
 * at its top and Cancel beside it. Both are one combobox: arrows move through results, Enter opens one, Esc closes. */
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

export function SearchPill({onOpen,phone}:{onOpen:()=>void,phone?:boolean}){
 return <button type="button" className={`search-pill ${phone?'is-phone':''}`} onClick={onOpen} aria-label="Search a structure">
  <SearchIcon size={18}/><span className="ph">{phone?'Search':PLACEHOLDER}</span>{!phone&&<kbd className="kbd">/</kbd>}
 </button>;
}

export function SearchPanel({phone,query,setQuery,results,note,onChoose,onClose}:{phone:boolean,query:string,setQuery:(q:string)=>void,results:Result[],note:string,onChoose:(id:string)=>void,onClose:()=>void}){
 const [active,setActive]=useState(0),input=useRef<HTMLInputElement>(null),list=useId();
 useEffect(()=>{setActive(0);},[query]);
 useEffect(()=>{input.current?.focus();},[]);
 const key=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(results.length-1,a+1));}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(0,a-1));}
  else if(e.key==='Enter'&&results[active]){e.preventDefault();onChoose(results[active].id);}
  else if(e.key==='Escape'){e.preventDefault();onClose();}
 };
 useEffect(()=>{document.getElementById(`${list}-${active}`)?.scrollIntoView({block:'nearest'});},[active,list]);
 const field=<div className={`search-field ${phone?'is-phone':''}`}>
  <SearchIcon size={18}/>
  <input ref={input} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={key} placeholder={phone?'Search':PLACEHOLDER} role="combobox" aria-expanded={results.length>0} aria-controls={list} aria-activedescendant={results.length?`${list}-${active}`:undefined} aria-autocomplete="list" aria-label="Search a structure" autoComplete="off" spellCheck={false} enterKeyHint="search"/>
  {!phone&&<kbd className="kbd">Esc</kbd>}
 </div>;
 const body=<>
  <p className="t-label search-group">{query.trim()?'Structures':'Start with'}</p>
  <ul className="search-results" id={list} role="listbox" aria-label="Structures">
   {results.map((r,i)=><li key={r.id} id={`${list}-${i}`} role="option" aria-selected={i===active} className={`result ${i===active?'is-active':''}`} onPointerMove={()=>setActive(i)} onClick={()=>onChoose(r.id)}>
    <span className="result-name">{bold(r.name,query)}</span><span className="t-meta">{r.meta}</span>
   </li>)}
  </ul>
  {query.trim()&&!results.length&&<p className="t-body2 search-empty">No structures match “{query.trim()}”.</p>}
  <p className="t-meta search-note">{note}</p>
 </>;
 if(phone)return <>
  <m.div className="search-scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={tween('out',DUR.enter)} onClick={onClose}/>
  <m.section className="sheet search-sheet" role="dialog" aria-label="Search" initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0,transition:tween('in',.2)}} transition={spring.sheet}>
   <span className="grab" aria-hidden="true"/>
   <div className="search-top">{field}<button type="button" className="search-cancel" onClick={onClose}>Cancel</button></div>
   <div className="search-scroll">{body}</div>
  </m.section>
 </>;
 return <>
  <div className="search-catch" onPointerDown={onClose}/>
  <m.section className="search-pop" role="dialog" aria-label="Search" initial={{opacity:0,y:-6,scale:.99}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6,transition:tween('in',DUR.leave)}} transition={spring.card}>
   {field}
   <div className="search-scroll">{body}</div>
  </m.section>
 </>;
}
