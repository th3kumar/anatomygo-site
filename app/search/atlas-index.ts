import type {Atlas,Concept,Part,SystemId} from '../anatomy';
import {nameWords,sideOf,unsided,words,type Side} from './text';

/** What search matches against, built once from the atlas (a few milliseconds, the first time search opens):
 * - one entry per structure, its left and right copies folded into one row keyed on the unsided name;
 * - no ontology classes ("organ", "anatomical entity", "zone of muscle organ"…), which open half the body;
 * - a whole for muscles the atlas only has in parts (Deltoid from its three parts, Biceps brachii from its heads);
 * - each entry's parent ("Part of deltoid"), system and body region, for the grey line under its name. */

export interface Entry {
 key:string;name:string;
 /** Folded name words, for matching; `raw` before folding, to tell a plural rescue from a plain match. */
 words:string[];raw:string[];phrase:string;
 system:SystemId;region:string|null;parent:string|null;
 /** The concepts behind the row: one per side for a mirrored pair, `both` for one that crosses the midline. */
 sides:Partial<Record<Side|'both',Concept>>;
 /** Every part in the row (both sides). */
 elements:string[];
}
export interface SearchIndex {entries:Entry[];byKey:Map<string,Entry>;byPart:Map<string,Entry>;vocabulary:string[];words:Set<string>;parts:Map<string,Part>}

// Generic classes from the ontology: they match common words and select hundreds of parts at once.
const ONTOLOGY=/\borgans?\b|anatomical|\bentity\b|^set of|subdivision|^segment of|^(long|short|flat|irregular) bone$|^body (proper|compartment|cavity content)$|^content of|^compartment of|^region of|^musculature of|vasculature of body|^(systemic )?(artery|vein|nerve)$|^(solid|hollow|cavitated) |^organ/;
export const isOntology=(name:string)=>ONTOLOGY.test(name.toLowerCase());

// A part named "{piece} of {whole}" whose whole the atlas doesn't have: these pieces make one.
const PIECE=/^(?:.* )?(part|head|belly|portion)$/;
// Prefixes that name a group, not a piece of the thing after "of".
const GROUP=/^(muscle|muscles|musculature|content|vasculature|set|tributary|branch|branches)\b/;

const REGIONS={head:'Head',neck:'Neck',chest:'Chest',abdomen:'Abdomen',pelvis:'Pelvis',back:'Back',shoulder:'Shoulder',arm:'Arm',
 forearm:'Forearm',hand:'Hand',thigh:'Thigh',knee:'Knee',leg:'Leg',foot:'Foot'};

/** The body region a box sits in (metres, y up, the right side at negative x). Long structures that run through a whole
 * limb read as that limb; ones that run through several parts of the trunk have no region. */
export function regionOf(min:number[],max:number[],system:SystemId):string|null{
 const cx=Math.abs((min[0]+max[0])/2),cy=(min[1]+max[1])/2,cz=(min[2]+max[2])/2,h=max[1]-min[1];
 const limbArm=cx>.15&&cy>.75&&cy<1.45,limbLeg=cy<.86&&cx>.02;
 if(limbArm){if(h>.45)return REGIONS.arm;if(cy>1.32)return REGIONS.shoulder;if(cy>1.11)return REGIONS.arm;if(cy>.9)return REGIONS.forearm;return REGIONS.hand;}
 if(limbLeg){if(h>.6)return REGIONS.leg;if(cy>.5)return REGIONS.thigh;if(cy>.42)return REGIONS.knee;if(cy>.08)return REGIONS.leg;return REGIONS.foot;}
 if(h>.4)return null;
 if(cy>1.5)return REGIONS.head;if(cy>1.43)return REGIONS.neck;
 if((system==='muscular'||system==='skeletal')&&cz<-.07&&cy>.95)return REGIONS.back;
 if(cy>1.2)return cx>.1&&cy>1.32?REGIONS.shoulder:REGIONS.chest;if(cy>1.0)return REGIONS.abdomen;return REGIONS.pelvis;
}

function box(ids:string[],parts:Map<string,Part>){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const id of ids){const b=parts.get(id)?.bounds;if(!b)continue;for(let i=0;i<3;i++){min[i]=Math.min(min[i],b[0][i]);max[i]=Math.max(max[i],b[1][i]);}}
 return {min,max,cx:(min[0]+max[0])/2,cy:(min[1]+max[1])/2};
}
// The system the structure is made of, by size. Vessels, nerves of the senses, connective and lymphatic tissue run
// through organs and regions without being what they are (the liver's veins, the heart's coronary arteries, the eyes in
// the skull), so they count only when nothing else is there.
const RUNS_THROUGH=new Set<SystemId>(['arterial','venous','sensory','connective','lymphatic']);
function mainSystem(ids:string[],parts:Map<string,Part>):SystemId{
 const size=new Map<SystemId,number>();
 for(const id of ids){const p=parts.get(id);if(p)size.set(p.system,(size.get(p.system)??0)+Math.max(1,p.vertexCount));}
 const ranked=[...size].sort((a,b)=>b[1]-a[1]),own=ranked.find(([s])=>!RUNS_THROUGH.has(s));
 return (own??ranked[0])?.[0]??'skeletal';
}
// Left and right copies are one structure seen twice only when they mirror each other across the midline; "right
// atrium" and "left atrium" are two different chambers and stay two rows.
function mirrored(r:Concept,l:Concept,parts:Map<string,Part>){
 const a=box(r.elements,parts),b=box(l.elements,parts);
 return a.cx<-.015&&b.cx>.015&&Math.abs(a.cx+b.cx)<.04&&Math.abs(a.cy-b.cy)<.06;
}

let cached:{atlas:Atlas,index:SearchIndex}|null=null;
export function searchIndex(atlas:Atlas):SearchIndex{
 if(cached?.atlas===atlas)return cached.index;
 const parts=new Map(atlas.parts.map(p=>[p.id,p]));
 // Group concepts by their unsided name.
 const groups=new Map<string,Partial<Record<Side|'both',Concept>>>();
 for(const c of atlas.concepts){
  const name=c.name.toLowerCase();if(isOntology(name)||!c.elements.length)continue;
  const key=unsided(name),side=sideOf(name)??'both',g=groups.get(key)??{};
  if(!g[side]||g[side]!.elements.length<c.elements.length)g[side]=c;groups.set(key,g);
 }
 // Wholes the atlas lacks, from their pieces: "clavicular part of right deltoid" adds to "right deltoid".
 for(const [key,g] of [...groups]){
  const at=key.lastIndexOf(' of ');if(at<0)continue;
  const piece=key.slice(0,at),whole=key.slice(at+4);
  if(!PIECE.test(piece)||groups.has(whole)||isOntology(whole))continue;
  let w=groups.get('\u0000'+whole);if(!w){w={};groups.set('\u0000'+whole,w);}
  for(const side of ['left','right','both'] as const){const c=g[side];if(!c)continue;
   const name=side==='both'?whole:`${side} ${whole}`,prev=w[side];
   w[side]={id:prev?.id??c.elements[0],name,elements:[...new Set([...(prev?.elements??[]),...c.elements])]};}
 }
 const entries:Entry[]=[];
 for(const [k,g] of groups){
  const key=k.replace('\u0000','');if(k!==key&&groups.has(key))continue;
  // A whole built from pieces on both sides: its "both" is the two sides together.
  if(k!==key&&!g.both&&g.left&&g.right)g.both={id:g.right.id,name:key,elements:[...g.right.elements,...g.left.elements]};
  // Sided copies that aren't a mirrored pair stay as their own rows.
  if(g.left&&g.right&&!mirrored(g.right,g.left,parts)){
   for(const side of ['left','right'] as const){const c=g[side]!;entries.push(make(c.name.toLowerCase(),{[side]:c},parts));}
   if(g.both)entries.push(make(key,{both:g.both},parts));
   continue;
  }
  entries.push(make(key,g,parts));
 }
 const byKey=new Map(entries.map(e=>[e.key,e]));
 // "Part of …": the longest whole named after an "of" that is itself a row.
 for(const e of entries){
  let at=e.key.indexOf(' of ');
  while(at>=0){const piece=e.key.slice(0,at),whole=e.key.slice(at+4);if(!GROUP.test(piece)&&byKey.has(whole)&&whole!==e.key){e.parent=whole;break;}at=e.key.indexOf(' of ',at+1);}
 }
 // Each mesh to the structure a feature on it sits on: the mesh's own concept's row ("right femur" → Femur), else the
 // smallest row holding it.
 const byPart=new Map<string,Entry>(),conceptName=new Map(atlas.concepts.map(c=>[c.id,c.name.toLowerCase()]));
 for(const e of [...entries].sort((a,b)=>b.elements.length-a.elements.length))for(const id of e.elements)byPart.set(id,e);
 for(const p of atlas.parts){const n=conceptName.get(p.conceptId),own=n&&(byKey.get(unsided(n))??byKey.get(n));if(own)byPart.set(p.id,own);}
 const all=new Set(entries.flatMap(e=>e.words)),vocabulary=[...all].filter(w=>w.length>2);
 const index={entries,byKey,byPart,vocabulary,words:all,parts};
 cached={atlas,index};return index;
}

function make(key:string,sides:Entry['sides'],parts:Map<string,Part>):Entry{
 const elements=[...new Set(Object.values(sides).flatMap(c=>c!.elements))];
 const one=sides.right??sides.left??sides.both!;
 const system=mainSystem(elements,parts),b=box(one.elements,parts);
 return {key,name:key,words:nameWords(key),raw:words(key),phrase:nameWords(key).join(' '),system,region:regionOf(b.min,b.max,system),parent:null,sides,elements};
}

/** The concept a row opens: the side typed wins, then the side used last, then the right. */
export function conceptFor(e:Entry,typed?:Side,last:Side='right'):Concept{
 return (typed&&e.sides[typed])||e.sides[last]||e.sides.right||e.sides.left||e.sides.both!;
}
