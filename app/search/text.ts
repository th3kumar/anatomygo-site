/** Query text, the same rules for the website and phones: clean it, split it into words, fold word forms, and read a
 * side or a ranking hint out of it. Pure functions, no atlas needed, so they are cheap on every keystroke. */

/** Lowercase; letters, digits and spaces only; spaces collapsed. "Spleen." from a phone keyboard becomes "spleen", and
 * "Adam's apple" becomes "adam s apple" (the alias list knows that form). */
export function clean(text:string){
 return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export const words=(text:string)=>clean(text).split(' ').filter(Boolean);

/** Dropped before matching; "muscle" and "bone" stay behind as a hint for which system to favour. */
const FILLER=new Set(['muscle','muscles','bone','bones','the','of','a']);
const HINT:Record<string,'muscular'|'skeletal'>={muscle:'muscular',muscles:'muscular',bone:'skeletal',bones:'skeletal'};
export const isFiller=(w:string)=>FILLER.has(w);

/** Plural → singular, Latin plurals too. Applied the same way to names and queries, so a fold only has to be
 * consistent, not good English ("biceps" and "bicep" both become "bicep"). */
const IRREGULAR:Record<string,string>={teeth:'tooth',feet:'foot',vertebrae:'vertebra',phalanges:'phalanx',bronchi:'bronchus',
 alveoli:'alveolus',gyri:'gyrus',sulci:'sulcus',nuclei:'nucleus',fasciae:'fascia',meninges:'meninx',apices:'apex',cortices:'cortex',
 vertices:'vertex',indices:'index',ossa:'os',ilia:'ilium',ischia:'ischium',ganglia:'ganglion',foramina:'foramen',condyles:'condyle',
 femora:'femur',corpora:'corpus',labia:'labium',ova:'ovum',testes:'testis',calves:'calf',halves:'half',lobes:'lobe',axes:'axis',
 processes:'process',sinuses:'sinus',arteries:'artery',ovaries:'ovary',bodies:'body',biceps:'bicep',triceps:'tricep',quadriceps:'quadricep'};
export function singular(w:string){
 const known=IRREGULAR[w];if(known)return known;
 if(w.length<4)return w;
 if(w.endsWith('ies'))return w.slice(0,-3)+'y';
 if(/(ss|x|ch|sh)es$/.test(w))return w.slice(0,-2);
 if(w.endsWith('ae'))return w.slice(0,-1);
 if(w.endsWith('s')&&!/(ss|us|is|ys)$/.test(w))return w.slice(0,-1);
 return w;
}

export type Side='left'|'right';
/** A query read for matching: the words to match (side words and filler taken out, forms folded), the side typed if
 * any, and the system the filler words favour. `raw` keeps the words before folding, to tell a plural rescue from a
 * plain match. */
export interface Query {text:string;raw:string[];match:string[];side?:Side;hint?:'muscular'|'skeletal';filler:boolean}
export function readQuery(text:string):Query{
 const all=words(text);let side:Side|undefined,hint:Query['hint'],filler=false;
 const kept:string[]=[];
 for(const w of all){
  if(w==='left'||w==='right'){side=w;continue;}
  if(FILLER.has(w)){filler=true;hint=HINT[w]??hint;continue;}
  kept.push(w);
 }
 // Only filler typed ("muscles", "the"): keep it, so it can still match a name or a system.
 const raw=kept.length?kept:all.filter(w=>w!=='left'&&w!=='right');
 return {text:clean(text),raw,match:raw.map(singular),side,hint,filler:filler&&kept.length>0};
}

/** Name words, folded the same way as query words, for matching. */
export const nameWords=(name:string)=>words(name).filter(w=>!FILLER.has(w)).map(singular);

/** A name without its side: "clavicular part of right deltoid" → "clavicular part of deltoid". */
export const unsided=(name:string)=>name.replace(/\b(left|right) /gi,'').replace(/\s+/g,' ').trim();
export const sideOf=(name:string):Side|undefined=>/\bright\b/i.test(name)?'right':/\bleft\b/i.test(name)?'left':undefined;

/** Typed with the keyboard in another layout: the same keys on a QWERTY keyboard. Russian ЙЦУКЕН, Arabic and Persian
 * standard layouts. Returns null when nothing changed. */
const QWERTY=[...'qwertyuiop[]asdfghjkl;\'zxcvbnm,./'];
// One string per layout, one character per key in QWERTY order. Arabic's "لا" key (on B) types the same two
// characters as ل then ا (G then H), so it is read both ways below.
const LAYOUTS=['йцукенгшщзхъфывапролджэячсмитьбю.','ضصثقفغعهخحجدشسيبلاتنمكطئءؤرىةوزظ','ضصثقفغعهخحجچشسیبلاتنمکگظطزرذدپو./'];
const REMAP=new Map<string,string>();
for(const layout of LAYOUTS){
 const keys=[...layout];
 // Arabic's bottom row skips B (the two-letter key): ئ ء ؤ ر | ى ة و ز ظ.
 if(layout===LAYOUTS[1])keys.splice(26,0,'');
 keys.forEach((k,i)=>{const q=QWERTY[i];if(k&&q&&/[a-z]/.test(q)&&!REMAP.has(k))REMAP.set(k,q);});
}
/** What the same keys spell on a QWERTY keyboard, most likely reading first; empty when the text has no Cyrillic or
 * Arabic-script letters. */
export function remapLayout(text:string):string[]{
 if(!/[\u0400-\u04ff\u0600-\u06ff]/u.test(text))return [];
 const spell=(s:string)=>{let out='';for(const c of s.toLowerCase())out+=REMAP.get(c)??c;const next=clean(out);return /^[a-z0-9 ]+$/.test(next)?next:'';};
 return [...new Set([spell(text.replace(/لا/g,'b')),spell(text)])].filter(Boolean);
}

/** Edit distance with an upper bound: stops early once every path is past `max`. */
export function distance(a:string,b:string,max:number){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let before:number[]=[],prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const cur=[i];let low=i;
  for(let j=1;j<=b.length;j++){
   let v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
   // A swap of two neighbouring letters ("sphneoid") counts as one edit.
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,before[j-2]+1);
   cur[j]=v;if(v<low)low=v;
  }
  if(low>max)return max+1;
  before=prev;prev=cur;
 }
 return prev[b.length];
}
