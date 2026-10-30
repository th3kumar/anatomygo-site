/** Systems: presets as tabs, one row per system (the name shows only that system, the switch toggles it), and the
 * explode slider. The same content sits in the desktop panel and the phone sheet. */
import {useState} from 'react';
import {Switch} from '@/components/ui/switch';
import {Slider} from '@/components/ui/slider';
import {css} from './motion';
import type {SystemId} from './anatomy';

export type Preset='all'|'skeleton'|'muscles'|'organs';
export const ORGANS:SystemId[]=['cardiac','respiratory','digestive','urinary','endocrine','reproductive'];
const TABS:[Preset,string][]=[['all','All'],['skeleton','Bones'],['muscles','Muscles'],['organs','Organs']];
/** Rows shown before "N more systems". */
const FIRST=10;

type System={id:SystemId,name:string,color:string};

export function presetOf(visible:SystemId[],all:SystemId[]):Preset|null{
 const same=(a:SystemId[])=>a.length===visible.length&&a.every(id=>visible.includes(id));
 if(same(all))return 'all';
 if(same(['skeletal']))return 'skeleton';
 if(same(['muscular']))return 'muscles';
 if(same(ORGANS.filter(id=>all.includes(id))))return 'organs';
 return null;
}
export function presetSystems(p:Preset,all:SystemId[]):SystemId[]{
 return p==='all'?all:p==='skeleton'?['skeletal']:p==='muscles'?['muscular']:ORGANS.filter(id=>all.includes(id));
}

export function SystemsBody({systems,allSet,counts,visible,shown,explode,onPreset,onToggle,onOnly,onExplode}:{systems:System[],allSet:SystemId[],counts:Record<string,number>,visible:SystemId[],shown:number,explode:number,onPreset:(p:Preset)=>void,onToggle:(id:SystemId)=>void,onOnly:(id:SystemId)=>void,onExplode:(v:number)=>void}){
 const [more,setMore]=useState(false);
 const active=presetOf(visible,allSet),index=TABS.findIndex(t=>t[0]===active);
 const rows=more?systems:systems.slice(0,FIRST),hidden=systems.length-rows.length;
 return <>
  <div className="panel-head"><h2 className="t-label">Systems</h2><span className="t-meta">{shown.toLocaleString()} parts shown</span></div>
  <div className="tabs" role="group" aria-label="Show a group of systems">
   <span className="tab-ind" aria-hidden="true" style={{opacity:index<0?0:1,transform:`translateX(calc(${Math.max(0,index)} * (100% + 2px)))`,transition:`transform ${css.spring('snappy')}, opacity .18s`}}/>
   {TABS.map(([p,label])=><button type="button" key={p} className={`tab ${active===p?'is-on':''}`} aria-pressed={active===p} onClick={()=>onPreset(p)}>{label}</button>)}
  </div>
  <div className="sys-list">
   {rows.map(s=>{const on=visible.includes(s.id);return <div className={`sys ${on?'':'is-off'}`} key={s.id}>
    <button type="button" className="sys-name" onClick={()=>onOnly(s.id)} title={`Show only ${s.name.toLowerCase()}`}><span className="dot" style={{background:s.color}}/><span>{s.name}</span></button>
    <span className="t-meta sys-count">{counts[s.id]?.toLocaleString()}</span>
    <Switch checked={on} onCheckedChange={()=>onToggle(s.id)} aria-label={`Show ${s.name.toLowerCase()}`}/>
   </div>;})}
   {hidden>0&&<button type="button" className="sys sys-more" onClick={()=>setMore(true)}><span className="dot"/><span>{hidden} more {hidden===1?'system':'systems'}</span></button>}
  </div>
  <div className="explode">
   <div className="explode-head"><label className="t-label" id="explode-label">Explode</label><output className="t-meta">{Math.round(explode*100)}%</output></div>
   <Slider aria-labelledby="explode-label" min={0} max={100} step={1} value={[explode*100]} onValueChange={v=>onExplode((Array.isArray(v)?v[0]:v)/100)}/>
  </div>
 </>;
}
