import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../anatomy';
import {searchIndex} from './atlas-index';
import {match} from './match';
import {assemble} from './assemble';
import type {FeatureHit,Features} from './features';

const atlas=JSON.parse(readFileSync(process.env.ATLAS??'models/atlas.json','utf8')) as Atlas;
const index=searchIndex(atlas);
// Real pins from the live pins table (5 Nov 2026).
const PINS:FeatureHit[]=[{id:'left-femur-adductor-tubercle',label:'Adductor tubercle',latin:'Tuberculum adductorium',mesh:'FJ3259'},{id:'left-femur-greater-trochanter',label:'Greater trochanter',latin:'Trochanter major',mesh:'FJ3259'},{id:'left-femur-head-of-femur',label:'Head of femur',latin:'Caput femoris',mesh:'FJ3259'},{id:'left-femur-neck-of-femur',label:'Neck of femur',latin:'Collum femoris',mesh:'FJ3259'},{id:'left-hip-acetabulum',label:'Acetabulum',latin:'Acetabulum',mesh:'FJ3288'},{id:'lm-1f7eac07e438af33bf95',label:'Head of femur',latin:'Caput femoris',mesh:'FJ3365'},{id:'lm-396ff9b14fd840d35e48',label:'Adductor tubercle',latin:'Tuberculum adductorium',mesh:'FJ3365'},{id:'lm-7f796aca1079187d4f12',label:'Greater tubercle',latin:'Tuberculum majus',mesh:'FJ3368'},{id:'right-femur-greater-trochanter',label:'Greater trochanter',latin:'Trochanter major',mesh:'FJ3365'},{id:'right-femur-neck',label:'Neck of femur',latin:'Collum femoris',mesh:'FJ3365'},{id:'right-hip-pubic-tubercle',label:'Pubic tubercle',latin:'Tuberculum pubicum ossis pubis',mesh:'FJ3152'},{id:'z-fj3262-greater-tubercle',label:'Greater tubercle',latin:'Tuberculum majus',mesh:'FJ3262'},{id:'z-fj3262-lesser-tubercle',label:'Lesser tubercle',latin:'Tuberculum minus',mesh:'FJ3262'},{id:'z-fj3288-pubic-tubercle',label:'Pubic tubercle',latin:'Tuberculum pubicum',mesh:'FJ3288'}];
// What the pins API returns: a word in the label or Latin name starts with the words, in order.
const api=(text:string)=>{const re=new RegExp(`(^|\\s)${text.split(' ').join('.*')}`,'i');return PINS.filter(p=>re.test(p.label)||re.test(p.latin));};
const done=(typed:string,fixed?:string):Features=>({status:'done',typed:api(typed),fixed:fixed?api(fixed):[]});
const starters=['heart','brain','lung','femur'].map(k=>index.byKey.get(k)!);
const panel=(q:string,f?:Features,loadingShown=false)=>{const m=match(index,q);const fixed=m.rescue?.kind==='typo'?m.rescue.shown:undefined;return assemble(index,m,f??done(m.query.match.join(' '),fixed),{recent:[],starters,loadingShown});};
const labels=(p:ReturnType<typeof panel>)=>p.sections.map(s=>`${s.label??'-'}: ${s.rows.map(r=>r.name).join(', ')}`);

test('SFD01: empty field shows Recent, then Start with',()=>{
 const p=assemble(index,null,{status:'idle',typed:[],fixed:[]},{recent:[index.byKey.get('femur')!,index.byKey.get('deltoid')!],starters,loadingShown:false});
 assert.deepEqual(p.sections.map(s=>s.label),['Recent','Start with']);
 assert.equal(p.sections[0].rows[0].meta,'Bone · Thigh');
 assert.equal(p.sections[0].rows[0].icon,'clock');
});

test('SFD03: femur, then its pins under Parts of the femur, sides folded',()=>{
 const p=panel('femur');
 assert.equal(p.rows[0].name,'Femur');
 const parts=p.sections.find(s=>s.label==='Parts of the femur');
 assert.ok(parts,labels(p).join(' / '));
 assert.deepEqual(parts.rows.map(r=>r.name).filter(n=>/of femur/.test(n)).sort(),['Head of femur','Neck of femur']);
 assert.equal(parts.rows.find(r=>r.name==='Head of femur')?.meta,'On the femur · Caput femoris');
});

test('SFD07: features that match better come first, then the structure they sit on',()=>{
 const p=panel('greater troch');
 assert.equal(p.sections[0].label,'Parts and features');
 assert.equal(p.sections[0].rows[0].name,'Greater trochanter');
 assert.equal(p.sections[0].rows.length,1,'left and right greater trochanter are one row');
 assert.deepEqual(p.sections[1],{label:'Structures',rows:p.sections[1].rows});
 assert.equal(p.sections[1].rows[0].name,'Femur');
});

test('SFD08: found only by the Latin name says so',()=>{
 const p=panel('tuberculum');
 assert.equal(p.rescue?.kind,'latin');
 assert.ok(p.rows.every(r=>r.kind!=='feature'||r.boldMeta));
 assert.ok(p.rows.some(r=>r.name==='Greater tubercle'));
});

test('SFD09: a system word offers Show only first, no Add row',()=>{
 const p=panel('veins');
 assert.equal(p.rows[0].kind,'system');
 assert.equal(p.rows[0].name,'Show only Veins');
 assert.ok(!p.rows.some(r=>/^Add /.test(r.name)));
 assert.equal(p.sections[1]?.label,'Structures');
});

test('SFD10: nothing matches only after the features call answers',()=>{
 const loading=panel('latissimus dorsi',{status:'loading',typed:[],fixed:[]});
 assert.equal(loading.nothing,false);
 const p=panel('latissimus dorsi');
 assert.equal(p.nothing,true);
 assert.equal(p.rescue?.lines[0].text,'Nothing matches "latissimus dorsi"');
 assert.deepEqual(p.rows.map(r=>r.name),['Heart','Brain','Lung','Femur']);
});

test('SFD12: features still loading show placeholder rows after 300 ms',()=>{
 const p=panel('tuber',{status:'loading',typed:[],fixed:[]},true);
 assert.equal(p.rows[0].name,'Tuber cinereum');
 assert.ok(p.sections.some(s=>s.loading&&s.label==='Parts and features'));
 assert.ok(!panel('tuber',{status:'loading',typed:[],fixed:[]},false).sections.some(s=>s.loading));
});

test('a correction gives way when the typed word is a feature name',()=>{
 // "acetabulum" is a pin, not an atlas name: never "corrected" into a structure.
 const p=panel('acetabulum');
 assert.notEqual(p.rescue?.kind,'typo');
 assert.equal(p.rows[0].name,'Acetabulum');
 assert.equal(panel('sphneoid').rescue?.kind,'typo');
});

test('short queries: four rows, no features',()=>{
 const p=panel('fe');
 assert.equal(p.short,true);
 assert.ok(p.rows.length<=4);
 assert.ok(p.rows.every(r=>r.kind!=='feature'));
});
