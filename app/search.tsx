/** Search a structure, part or system. Desktop: the field opens over the pill (which stays beneath it) and results open
 * under it. Phone: the pill flies up into the field (one shared layoutId) as a sheet fills in behind it, with Cancel
 * beside it; closing flies it back. Both are one combobox: arrows move through results, Enter opens one, Esc closes.
 * What the rows say comes from search/assemble.ts (the search handoff boards); this file only lays them out. */
import {Fragment,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {m} from 'motion/react';
import {Check,Clock,Layers3,MapPin,Search as SearchIcon} from 'lucide-react';
import {spring,tween,DUR} from './motion';
import type {Panel,Row} from './search/assemble';

const PLACEHOLDER='Search a structure, part or system',PHONE_PLACEHOLDER='Search anatomy';
const touch=()=>typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;

/** The query's words in bold where a word of the text starts with them; neighbouring bold words join ("Greater troch"). */
export function bold(text:string,words:string[]):ReactNode{
 const lower=text.toLowerCase(),marks:[number,number][]=[];
 for(const w of words){
  const clean=w.replace(/[^\p{L}\p{N}]/gu,'');if(!clean)continue;
  const hit=new RegExp(`(^|[^\\p{L}\\p{N}])(${clean})`,'iu').exec(lower);
  if(hit){const at=hit.index+hit[1].length;marks.push([at,at+hit[2].length]);}
 }
 if(!marks.length)return text;
 marks.sort((a,b)=>a[0]-b[0]);
 const merged:[number,number][]=[];
 for(const r of marks){const last=merged[merged.length-1];if(last&&r[0]<=last[1]+1&&/^\s?$/.test(text.slice(last[1],r[0])))last[1]=Math.max(last[1],r[1]);else merged.push([r[0],r[1]]);}
 const out:ReactNode[]=[];let at=0;
 merged.forEach(([a,b],k)=>{if(a>at)out.push(text.slice(at,a));out.push(<b key={k}>{text.slice(a,b)}</b>);at=b;});
 if(at<text.length)out.push(text.slice(at));
 return out;
}

// The phone pill and the phone field are one element to the layout animation; radii as numbers so it can correct them.
const FIELD='search-field';
/** `covered`: the open field lies over it (desktop), so it hides rather than show through the glass. */
export function SearchPill({onOpen,phone,covered}:{onOpen:()=>void,phone?:boolean,covered?:boolean}){
 return <m.button type="button" className={`search-pill ${phone?'is-phone':''} ${covered?'is-covered':''}`} tabIndex={covered?-1:undefined} aria-hidden={covered||undefined} onClick={onOpen} aria-label="Search a structure" layoutId={phone?FIELD:undefined} transition={spring.sheet} style={phone?{borderRadius:16}:undefined}>
  <SearchIcon size={18}/><span className="ph">{phone?PHONE_PLACEHOLDER:PLACEHOLDER}</span>{!phone&&<kbd className="kbd">/</kbd>}
 </m.button>;
}

function Lead({row}:{row:Row}){
 if(row.icon==='clock')return <Clock className="sic" size={16} aria-hidden="true"/>;
 if(row.icon==='pin')return <MapPin className="sic" size={16} aria-hidden="true"/>;
 if(row.icon==='layers')return <Layers3 className="sic" size={16} aria-hidden="true"/>;
 return <span className={`sdot ${row.kind==='system'?'is-system':''}`} style={{background:row.dot}} aria-hidden="true"/>;
}

const Skeleton=()=><div className="skel" aria-hidden="true"><span className="sk sk-dot"/><span className="sk-lines"><span className="sk" style={{width:'46%',height:12}}/><span className="sk" style={{width:'30%',height:10}}/></span></div>;

export function SearchPanel({phone,query,setQuery,panel,words,asked,onPick,onLiteral,onAsk,onClose}:{phone:boolean,query:string,setQuery:(q:string)=>void,panel:Panel|null,words:string[],asked:boolean,onPick:(row:Row,index:number)=>void,onLiteral:()=>void,onAsk:()=>void,onClose:()=>void}){
 const all=panel?.rows??[];
 const [active,setActive]=useState(0),input=useRef<HTMLInputElement>(null),list=useId(),byKey=useRef(false);
 useEffect(()=>{setActive(0);},[query]);
 // Opening selects the old text, so typing replaces it (no more "skullskull").
 useEffect(()=>{const el=input.current;if(!el)return;el.focus({preventScroll:true});el.select();},[]);
 // On a touch screen with its on-screen keyboard up, a search that finds nothing drops the keyboard once typing pauses,
 // so the whole answer shows. The field keeps a caret; tapping it brings the keyboard back with the caret at the end, and
 // a hardware key (a Bluetooth keyboard) goes straight into the field. A mouse-and-keyboard screen never drops focus.
 const [resting,setResting]=useState(false);
 useEffect(()=>{
  const keyboardUp=()=>{const vv=window.visualViewport;return !!vv&&vv.height<document.documentElement.clientHeight*.85;};
  if(!phone||!panel?.nothing||!touch()){setResting(false);return;}
  const t=setTimeout(()=>{if(!keyboardUp())return;input.current?.blur();setResting(true);},1200);return()=>clearTimeout(t);
 },[phone,panel?.nothing,query]);
 const wake=()=>{const el=input.current;if(!el)return;el.focus({preventScroll:true});const end=el.value.length;el.setSelectionRange(end,end);setResting(false);};
 useEffect(()=>{if(!resting)return;
  const key=(e:KeyboardEvent)=>{if(e.metaKey||e.ctrlKey||e.altKey)return;
   if(e.key==='Backspace'){e.preventDefault();setQuery(query.slice(0,-1));wake();}
   else if(e.key.length===1){e.preventDefault();setQuery(query+e.key);wake();}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key);
 },[resting,query]);
 // iOS (and Android Chrome) lay the keyboard over the page instead of shrinking it, and focusing the field while it still
 // flies up from the pill scrolls the whole page up, hiding the field. Keep the page at the top, and give the sheet the
 // visible area only (--vv-top, --kb), so the field and the results stay above the keyboard.
 useEffect(()=>{const vv=window.visualViewport,root=document.documentElement;if(!phone||!vv)return;
  const fit=()=>{if(scrollY||root.scrollTop||document.body.scrollTop){scrollTo(0,0);root.scrollTop=document.body.scrollTop=0;}
   root.style.setProperty('--vv-top',`${Math.max(0,vv.offsetTop)}px`);root.style.setProperty('--kb',`${Math.max(0,root.clientHeight-vv.height-vv.offsetTop)}px`);};
  fit();vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit);
  return()=>{vv.removeEventListener('resize',fit);vv.removeEventListener('scroll',fit);root.style.removeProperty('--vv-top');root.style.removeProperty('--kb');};},[phone]);
 const key=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();byKey.current=true;setActive(a=>Math.min(all.length-1,a+1));}
  else if(e.key==='ArrowUp'){e.preventDefault();byKey.current=true;setActive(a=>Math.max(0,a-1));}
  else if(e.key==='Enter'&&all[active]){e.preventDefault();onPick(all[active],active);}
  else if(e.key==='Escape'){e.preventDefault();onClose();}
 };
 // Only the arrow keys scroll the list: a row under the pointer (or a finger starting a swipe) must not move it.
 useEffect(()=>{if(!byKey.current)return;byKey.current=false;document.getElementById(`${list}-${active}`)?.scrollIntoView({block:'nearest'});},[active,list]);
 const field=<m.div className={`search-field ${phone?'is-phone':''}`} layoutId={phone?FIELD:undefined} transition={spring.sheet} style={phone?{borderRadius:14}:undefined} exit={phone?undefined:{opacity:0,transition:tween('in',.12)}}>
  <SearchIcon size={18}/>
  <span className="search-input">
   <input ref={input} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={key} placeholder={phone?PHONE_PLACEHOLDER:PLACEHOLDER} role="combobox" aria-expanded={all.length>0} aria-controls={list} aria-activedescendant={all.length?`${list}-${active}`:undefined} aria-autocomplete="list" aria-label="Search a structure" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search"
    onFocus={()=>setResting(false)}/>
   {resting&&<span className="search-caret" aria-hidden="true"><span className="search-caret-text">{query}</span><i/></span>}
  </span>
  {!phone&&<kbd className="kbd">Esc</kbd>}
 </m.div>;
 let n=0;
 // Pins arriving from the features call fade in and rise, 30 ms apart (--i: the row's place in its group).
 const row=(r:Row,k:number)=>{const at=n++;return <li key={r.id} id={`${list}-${at}`} role="option" aria-selected={at===active} data-kind={r.kind} style={r.kind==='feature'?{'--i':k} as React.CSSProperties:undefined} className={`result ${at===active?'is-active':''}`} onPointerEnter={e=>{if(e.pointerType!=='touch')setActive(at);}} onClick={()=>onPick(r,at)}>
  <Lead row={r}/>
  <span className="result-main"><span className="result-name">{r.boldName?bold(r.name,words):r.name}</span><span className="t-meta">{r.boldMeta?bold(r.meta,words):r.meta}</span></span>
  {r.action&&<span className="result-act">{r.action}</span>}
 </li>;};
 const rescue=panel?.rescue;
 const body=<>
  {rescue&&<div className="search-rescue" role="status">{rescue.lines.map((l,k)=>l.link
   ?<p key={k}><button type="button" className="search-rescue-link" onClick={()=>{onLiteral();input.current?.focus({preventScroll:true});}}>{l.text}</button></p>
   :<p key={k}>{l.text}{l.bold&&<b>{l.bold}</b>}</p>)}</div>}
  <div id={list} role="listbox" aria-label="Search results" aria-busy={panel?.sections.some(s=>s.loading)||undefined}>
   {panel?.sections.map((s,k)=><Fragment key={`${s.label??''}-${k}`}>
    {s.label&&<p className="t-label search-group">{s.label}</p>}
    {s.loading?<><Skeleton/><Skeleton/></>:<ul className="search-results" role="group" aria-label={s.label??'Results'}>{s.rows.map((r,k)=>row(r,k))}</ul>}
   </Fragment>)}
  </div>
  {panel?.short&&all.length>0&&<p className="t-meta search-note">Keep typing to see more</p>}
  {panel?.nothing&&<div className="search-ask"><span className="t-meta">Want it added?</span>
   {asked?<span className="search-asked" role="status"><Check size={14} aria-hidden="true"/>Thanks, noted</span>:<button type="button" className="result-act" onClick={onAsk}>Ask for it</button>}</div>}
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
  {/* The field lies exactly over the pill, so it needs no motion; the results panel drops 6 px and fades in (spring.snappy),
      and leaves first (ease.in 120). */}
  <section className="search-pop" role="dialog" aria-label="Search">
   {field}
   <m.div className="search-panel" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6,transition:tween('in',.12)}} transition={spring.snappy}>
    <div className="search-scroll">{body}</div>
   </m.div>
  </section>
 </>;
}
