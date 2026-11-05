import {SYSTEMS,type SystemId} from '../anatomy';
import type {Entry,SearchIndex} from './atlas-index';
import type {FeatureHit,Features} from './features';
import type {Matched,Rescue,SystemTarget,Tier} from './match';
import {tierOf} from './match';
import {nameWords,sideOf,unsided,type Side} from './text';

/** What the panel shows for a query, the same on the website and phones (the search handoff boards SFD/SFP 01–12).
 * Pure: the matched structures, the features call and the visitor's recent picks in, rows and lines out. */

export type RowKind='structure'|'part'|'feature'|'system'|'recent'|'starter';
export interface Row {
 id:string;kind:RowKind;name:string;meta:string;
 /** The words to show in bold: the query's words where they occur in the name (or, for a Latin hit, in the meta). */
 boldName:boolean;boldMeta:boolean;
 dot?:string;icon?:'pin'|'clock'|'layers';action?:string;
 entry?:Entry;feature?:FeatureHit;system?:SystemTarget;
 /** A feature on both copies of a pair: the pin on each side, so the side used last opens. */
 sides?:Partial<Record<Side,FeatureHit>>;
}
export interface Section {label:string|null;rows:Row[];loading?:boolean}
export interface Panel {
 rescue:{kind:Rescue['kind']|'none-found';lines:{text:string,bold?:string,link?:boolean}[]}|null;
 sections:Section[];
 /** Under 3 letters: "Keep typing to see more". */
 short:boolean;
 /** Nothing matched, features included: the Start with rows and Ask for it. */
 nothing:boolean;
 /** Rows in order, for the arrow keys and Enter. */
 rows:Row[];
 /** Which rescue reached the screen, for analytics (none, typo, plural, alias, latin, layout). */
 rescueKind:string;
}

/** Board colours for the system dot; the rest use the system's own colour. */
const DOTS:Partial<Record<SystemId,string>>={skeletal:'#e9dfc4',muscular:'#d9705f',cardiac:'#d9705f',arterial:'#d65a5a',venous:'#5b8fd6',nervous:'#e3c26a',respiratory:'#c98ab0'};
export const dotFor=(s:SystemId)=>DOTS[s]??SYSTEMS.find(x=>x.id===s)?.color??'#8f949a';
/** The grey line's first word: what kind of thing it is. */
const KIND:Record<SystemId,string>={skeletal:'Bone',muscular:'Muscle',cardiac:'Heart',arterial:'Artery',venous:'Vein',nervous:'Nerve',
 respiratory:'Respiratory',digestive:'Digestive',urinary:'Urinary',reproductive:'Reproductive',lymphatic:'Lymphatic',endocrine:'Endocrine',
 integumentary:'Body surface',connective:'Connective tissue',sensory:'Sense organ'};
export const capitalise=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);

export function structureRow(e:Entry,kind:RowKind='structure'):Row{
 const meta=e.parent&&kind!=='recent'&&kind!=='starter'?`Part of ${e.parent}`:[KIND[e.system],e.region].filter(Boolean).join(' · ');
 return {id:`s:${e.key}`,kind:e.parent&&kind==='structure'?'part':kind,name:capitalise(e.name),meta,boldName:kind==='structure'||kind==='part',boldMeta:false,
  dot:kind==='recent'?undefined:dotFor(e.system),icon:kind==='recent'?'clock':undefined,entry:e};
}

/** Pins for the same feature on the left and right copy are one row; a generic label ("Muscle belly") stays one row
 * per structure, because its meta says which. */
export interface FoldedFeature {hit:FeatureHit;sides:Partial<Record<Side,FeatureHit>>;on:Entry|null;latinOnly:boolean;tier:Tier}
export function foldFeatures(index:SearchIndex,hits:FeatureHit[],words:string[]):FoldedFeature[]{
 const byKey=new Map<string,FoldedFeature>();
 for(const h of hits){
  const part=index.parts.get(h.mesh);if(!part)continue;
  const on=index.byPart.get(h.mesh)??null,key=`${h.label.toLowerCase()}|${on?.key??h.mesh}`;
  const side=sideOf(part.name),t=tierOf(nameWords(h.label).join(' '),nameWords(h.label),words);
  const latinOnly=t<0;
  const f=byKey.get(key)??{hit:h,sides:{},on,latinOnly,tier:(t<0?3:t) as Tier};
  if(side)f.sides[side]??=h;
  if(!latinOnly&&f.latinOnly){f.latinOnly=false;f.tier=t as Tier;}
  byKey.set(key,f);
 }
 return [...byKey.values()].sort((a,b)=>a.tier-b.tier||Number(a.latinOnly)-Number(b.latinOnly)||a.hit.label.length-b.hit.label.length||(a.hit.label<b.hit.label?-1:1));
}
export function featureRow(f:FoldedFeature):Row{
 const on=f.on?`On the ${unsided(f.on.name)}`:'';
 return {id:`f:${f.hit.id}`,kind:'feature',name:capitalise(f.hit.label),meta:[on,f.hit.latin].filter(Boolean).join(' · '),
  boldName:!f.latinOnly,boldMeta:f.latinOnly,icon:'pin',feature:f.hit,sides:f.sides,entry:f.on??undefined};
}
export function systemRow(target:SystemTarget):Row{
 const id=target.kind==='system'?target.id:null,name=id?SYSTEMS.find(s=>s.id===id)?.name??id:'Organs';
 return {id:`y:${id??'organs'}`,kind:'system',name:`Show only ${name}`,meta:'Hides the other systems',boldName:true,boldMeta:false,
  dot:id?dotFor(id):undefined,icon:id?undefined:'layers',action:'Show only',system:target};
}

export function assemble(index:SearchIndex,m:Matched|null,features:Features,{recent,starters,loadingShown}:{recent:Entry[],starters:Entry[],loadingShown:boolean}):Panel{
 const none:Panel={rescue:null,sections:[],short:false,nothing:false,rows:[],rescueKind:'none'};
 if(!m||!m.query.match.length){
  const sections:Section[]=[];
  if(recent.length)sections.push({label:'Recent',rows:recent.slice(0,2).map(e=>({...structureRow(e,'recent'),id:`r:${e.key}`}))});
  sections.push({label:'Start with',rows:starters.map(e=>({...structureRow(e,'starter'),id:`t:${e.key}`}))});
  return {...none,sections,rows:sections.flatMap(s=>s.rows)};
 }
 // A correction is only offered when the typed words aren't themselves a feature's name.
 let rescue=m.rescue,hits=m.hits,exact=m.exact,parts=m.parts,feats=features.typed,words=m.query.match;
 if(rescue?.kind==='typo'&&features.typed.length){rescue=null;hits=[];exact=null;parts=[];}
 else if(rescue?.kind==='typo'){feats=features.fixed;words=rescue.shown.split(' ');}
 const folded=m.short?[]:foldFeatures(index,feats,words).slice(0,20);
 const onExact=exact?folded.filter(f=>f.on===exact):[],other=folded.filter(f=>!onExact.includes(f));
 const sections:Section[]=[];
 if(m.system)sections.push({label:null,rows:[systemRow(m.system)]});
 const structures=hits.map(h=>structureRow(h.entry));
 const featureRows=other.map(featureRow);
 const waiting=features.status==='loading'&&loadingShown&&!m.short;
 const PF='Parts and features',structuresLabel=sections.length?'Structures':null;
 if(exact){
  sections.push({label:null,rows:[structures[0]]});
  const partRows=[...parts.map(p=>structureRow(p)),...onExact.map(featureRow)];
  if(partRows.length)sections.push({label:`Parts of the ${unsided(exact.name)}`,rows:partRows});
  if(structures.length>1)sections.push({label:null,rows:structures.slice(1)});
  if(featureRows.length)sections.push({label:PF,rows:featureRows});
 }else if(structures.length&&featureRows.length&&other[0].tier<hits[0].tier){
  // Features that match better than any structure come first (SFD07).
  sections.push({label:PF,rows:featureRows},{label:'Structures',rows:structures});
 }else if(structures.length){
  sections.push({label:structuresLabel,rows:structures});
  if(featureRows.length)sections.push({label:PF,rows:featureRows});
 }else if(featureRows.length){
  sections.push({label:PF,rows:featureRows});
  // The structures those features sit on, so the bone or muscle itself is one tap away.
  const on=[...new Set(other.map(f=>f.on).filter((e):e is Entry=>!!e))].slice(0,3);
  if(on.length)sections.push({label:'Structures',rows:on.map(e=>structureRow(e))});
 }
 if(waiting&&!featureRows.length)sections.push({label:PF,rows:[],loading:true});
 const shown=sections.flatMap(s=>s.rows);
 const nothing=!shown.length&&features.status!=='loading'&&!m.system;
 if(nothing){
  return {...none,nothing:true,rescueKind:'none',
   rescue:{kind:'none-found',lines:[{text:`Nothing matches "${m.query.text}"`}]},
   sections:[{label:null,rows:starters.slice(0,4).map(e=>({...structureRow(e,'starter'),id:`t:${e.key}`}))}],
   rows:starters.slice(0,4).map(e=>({...structureRow(e,'starter'),id:`t:${e.key}`}))};
 }
 // Latin: nothing but features found by their Latin name.
 if(!rescue&&!hits.length&&!exact&&folded.length&&folded.every(f=>f.latinOnly))rescue={kind:'latin'};
 return {rescue:rescue?rescueLines(rescue):null,sections,short:m.short,nothing:false,rows:shown,rescueKind:rescue?.kind??'none'};
}

function rescueLines(r:Rescue):Panel['rescue']{
 switch(r.kind){
  case 'typo':case 'layout':return {kind:r.kind,lines:[{text:'Showing results for ',bold:r.shown},{text:`Search instead for ${r.typed}`,link:true}]};
  case 'plural':return {kind:r.kind,lines:[{text:'Showing ',bold:r.shown}]};
  case 'alias':return {kind:r.kind,lines:[{text:`${capitalise(r.typed)} is the ${r.shown}`}]};
  case 'latin':return {kind:r.kind,lines:[{text:'Matched the Latin name'}]};
 }
}
