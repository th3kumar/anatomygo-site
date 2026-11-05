import type {SystemId} from '../anatomy';
import {aliasesFor} from '../search-terms';
import {conceptFor,type Entry,type SearchIndex} from './atlas-index';
import {clean,distance,readQuery,remapLayout,singular,type Query} from './text';

/** Structures for a query, in the browser on every keystroke. Order of steps (the search handoff, SH1):
 * clean → filler words → word forms → everyday words → atlas names; only when those find nothing, typos and then a
 * keyboard-layout remap. Features (pins) come from the pins API separately; see features.ts. */

/** Lower is better: the whole name, the name's start, a word's start, inside a word. */
export type Tier=0|1|2|3;
export interface Hit {entry:Entry;tier:Tier}
export type Rescue=
 |{kind:'typo'|'layout';shown:string;typed:string}
 |{kind:'plural';shown:string}
 |{kind:'alias';typed:string;shown:string}
 |{kind:'latin'};
export type SystemTarget={kind:'system',id:SystemId}|{kind:'organs'};
export interface Matched {
 query:Query;
 /** The text features are searched with: the typed words, or the corrected ones when a rescue changed them. */
 featureText:string;
 hits:Hit[];
 /** The best hit is the exact name: its parts show right under it ("Parts of the femur"). */
 exact:Entry|null;parts:Entry[];
 rescue:Rescue|null;system:SystemTarget|null;
 /** One or two letters: four rows and "Keep typing to see more". */
 short:boolean;
}

/** How a name matches the query words, or -1. Every query word must match a name word. */
export function tierOf(phrase:string,nameWords:string[],q:string[]):Tier|-1{
 if(!q.length)return -1;
 const qp=q.join(' ');
 if(phrase===qp)return 0;
 if(phrase.startsWith(qp))return 1;
 let tier:Tier=2;
 for(const w of q){
  if(nameWords.some(n=>n.startsWith(w)))continue;
  if(w.length>=3&&nameWords.some(n=>n.includes(w))){tier=3;continue;}
  return -1;
 }
 return tier;
}

const SYSTEM_WORDS:Record<string,SystemTarget>={vein:{kind:'system',id:'venous'},nerve:{kind:'system',id:'nervous'},
 muscle:{kind:'system',id:'muscular'},bone:{kind:'system',id:'skeletal'},skeleton:{kind:'system',id:'skeletal'},
 artery:{kind:'system',id:'arterial'},organ:{kind:'organs'}};
/** "veins", "nerves", "skeleton", "organs": a whole system, offered as Show only before the structures. */
export function systemFor(text:string):SystemTarget|null{
 const w=clean(text).split(' ').filter(Boolean);
 return w.length===1?SYSTEM_WORDS[singular(w[0])]??null:null;
}

function rank(index:SearchIndex,q:Query,phrases:string[][],raw=false):Hit[]{
 const best=new Map<Entry,Tier>();
 for(const words of phrases){
  for(const e of index.entries){
   const t=raw?tierOf(e.raw.join(' '),e.raw,words):tierOf(e.phrase,e.words,words);
   if(t<0)continue;const was=best.get(e);if(was===undefined||t<was)best.set(e,t as Tier);
  }
 }
 const hits=[...best].map(([entry,tier])=>({entry,tier}));
 // A typed word that is also a whole row ("deltoid") wins over longer names containing it ("zone of deltoid").
 const plain=new Set(phrases.map(p=>p.join(' ')));
 hits.sort((a,b)=>a.tier-b.tier
  ||(a.entry.parent?1:0)-(b.entry.parent?1:0)
  ||(plain.has(a.entry.phrase)?0:1)-(plain.has(b.entry.phrase)?0:1)
  ||(q.hint?(a.entry.system===q.hint?0:1)-(b.entry.system===q.hint?0:1):0)
  ||a.entry.name.length-b.entry.name.length
  ||(a.entry.name<b.entry.name?-1:1));
 return hits;
}

// Words of parts & features (pins), which the atlas names don't use: a typed "greater" is not a typo for "great".
const FEATURE_WORDS=`greater lesser trochanter tubercle tuberosity condyle epicondyle fossa foramen crest notch facet groove sulcus
 fissure spine process line ridge tubercule malleolus acetabulum capitulum trochlea olecranon coronoid styloid mastoid glenoid
 acromion coracoid lamina pedicle facies margo angle border surface apex neck shaft canal meatus incisure hiatus prominence
 eminence protuberance impression insertion origin attachment belly tendon aponeurosis`.split(/\s+/);

/** Each unknown word (no name word starts with it) to the one vocabulary word clearly closest to it, if any. Rules from
 * the search handoff, tightened by real queries: 4+ letters; one edit under 6 letters, two from 6; the first letter
 * kept; and a correction shorter than the typed word only by one dropped letter ("orbicu" is orbicularis being typed,
 * not "orbit"). */
function corrected(index:SearchIndex,words:string[]):string[]|null{
 let changed=false;
 const known=(w:string)=>index.vocabulary.some(v=>v.startsWith(w))||FEATURE_WORDS.some(v=>v.startsWith(w));
 const out=words.map(w=>{
  if(w.length<4||known(w))return w;
  const max=w.length<6?1:2;let best='',bestD=max+1,tie=false;
  for(const v of index.vocabulary){
   if(v[0]!==w[0])continue;
   const d=distance(w,v,max);
   if(v.length<w.length&&d>1)continue;
   if(d<bestD){best=v;bestD=d;tie=false;}else if(d===bestD&&v!==best)tie=true;
  }
  if(!best||tie)return w;changed=true;return best;
 });
 return changed?out:null;
}

// The adjective atlas names use for a structure ("femur" → femoral artery, "kidney" → renal vein). Ranked after
// every direct match, as the board for "femur" shows.
const RELATED:Record<string,string>={femur:'femoral',tibia:'tibial',fibula:'fibular',ulna:'ulnar',radius:'radial',humerus:'humeral',
 scapula:'scapular',clavicle:'clavicular',sternum:'sternal',pelvis:'pelvic',vertebra:'vertebral',cranium:'cranial',skull:'cranial',
 thorax:'thoracic',chest:'thoracic',abdomen:'abdominal',sacrum:'sacral',coccyx:'coccygeal',patella:'patellar',mandible:'mandibular',
 maxilla:'maxillary',nose:'nasal',kidney:'renal',liver:'hepatic',lung:'pulmonary',heart:'cardiac',stomach:'gastric',brain:'cerebral',
 spleen:'splenic',bladder:'vesical',neck:'cervical',hand:'manual',foot:'pedal',thigh:'femoral',arm:'brachial',forearm:'antebrachial'};
const related=(words:string[])=>words.some(w=>RELATED[w])?[words.map(w=>RELATED[w]??w)]:[];

const FILLER_START=/^(mus|musc|muscl|bon)$/;
export function match(index:SearchIndex,text:string,{literal=false}:{literal?:boolean}={}):Matched{
 // "deltoid musc": a filler word still being typed is dropped like the whole word would be.
 const typed=clean(text).split(' ');
 if(typed.length>1&&FILLER_START.test(typed[typed.length-1])){const without=match(index,typed.slice(0,-1).join(' ')+' muscle',{literal});if(without.hits.length)return without;}
 const query=readQuery(text);
 const empty:Matched={query,featureText:query.match.join(' '),hits:[],exact:null,parts:[],rescue:null,system:systemFor(text),short:false};
 if(!query.match.length)return empty;
 const short=query.match.join('').length<=2;
 const aliases=aliasesFor(query.raw.join(' ')).map(a=>a.split(' ').map(singular));
 let hits=rank(index,query,[query.match,...aliases]);
 const near=related(query.match);
 if(near.length&&hits.length){const seen=new Set(hits.map(h=>h.entry));hits=[...hits,...rank(index,query,near).filter(h=>!seen.has(h.entry)).map(h=>({...h,tier:3 as Tier}))];}
 let rescue:Rescue|null=null,featureText=query.match.join(' ');
 if(hits.length){
  // Found only by folding a word form or by an everyday word: say so, once.
  const plainly=rank(index,query,[query.raw],true).length>0;
  // A system word ("veins") is answered by Show only, so it needs no rescue line.
  if(!plainly&&!empty.system){
   if(aliases.length&&hits[0].tier===0&&aliases.some(a=>a.join(' ')===hits[0].entry.phrase))rescue={kind:'alias',typed:query.raw.join(' '),shown:aliasesFor(query.raw.join(' '))[0]};
   else if(query.raw.join(' ')!==query.match.join(' ')&&query.match.every(w=>index.words.has(w)))rescue={kind:'plural',shown:query.match.join(' ')};
  }
 }else if(!literal){
  const fixed=corrected(index,query.match);
  if(fixed){const h=rank(index,query,[fixed]);if(h.length){hits=h;featureText=fixed.join(' ');rescue={kind:'typo',shown:fixed.join(' '),typed:query.text};}}
  if(!hits.length){
   for(const remapped of remapLayout(text)){const again=match(index,remapped,{literal:true});if(again.hits.length)return {...again,rescue:{kind:'layout',shown:remapped,typed:query.text}};}
  }
 }
 const top=hits[0];
 const exact=top&&top.tier===0&&!top.entry.parent?top.entry:null;
 // Its parts; a "part" made of exactly the same pieces ("zone of deltoid") is the whole again, so it is left out.
 const same=(e:Entry)=>exact!==null&&e.elements.length===exact.elements.length&&e.elements.every(id=>exact.elements.includes(id));
 const parts=exact?index.entries.filter(e=>e.parent===exact.key&&!same(e)).sort((a,b)=>a.name.length-b.name.length):[];
 const inParts=new Set(parts);
 const rest=hits.filter(h=>!inParts.has(h.entry)&&!(h.entry!==exact&&same(h.entry)));
 return {query,featureText,hits:rest.slice(0,short?4:8),exact,parts:parts.slice(0,6),rescue,system:empty.system,short};
}

/** The concept a picked row opens (see conceptFor). */
export {conceptFor};
