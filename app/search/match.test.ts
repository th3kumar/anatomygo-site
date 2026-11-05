import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../anatomy';
import {searchIndex,conceptFor} from './atlas-index';
import {match} from './match';
import {clean,readQuery,remapLayout,distance} from './text';

const atlas=JSON.parse(readFileSync(process.env.ATLAS??'models/atlas.json','utf8')) as Atlas;
const index=searchIndex(atlas);
const names=(q:string)=>match(index,q).hits.map(h=>h.entry.name);

test('cleaning: punctuation, case and spaces',()=>{
 assert.equal(clean('  Spleen. '),'spleen');
 assert.equal(clean("Adam's apple"),'adam s apple');
 assert.equal(clean('Shin-bone'),'shin bone');
 assert.deepEqual(readQuery('Left deltoid muscle').match,['deltoid']);
 assert.equal(readQuery('Left deltoid muscle').side,'left');
 assert.equal(readQuery('deltoid muscle').hint,'muscular');
});

test('no ontology classes',()=>{
 for(const q of ['organ','anatomical entity','muscle organ','organ region','cardinal organ part'])
  assert.ok(!index.byKey.has(q),q);
 assert.ok(!names('organ').some(n=>/\borgan\b/.test(n)));
});

test('SFD02: first letters show four rows, word starts first',()=>{
 const m=match(index,'fe');
 assert.equal(m.short,true);
 assert.equal(m.hits.length,4);
 assert.equal(m.hits[0].entry.name,'femur');
 // Names that start with the letters come before names with a word that does.
 const starts=m.hits.map(h=>h.entry.name.startsWith('fe'));
 assert.deepEqual(starts,[...starts].sort((a,b)=>Number(b)-Number(a)));
});

test('SFD03: exact name, sides folded, parts under it',()=>{
 const m=match(index,'femur');
 assert.equal(m.exact?.name,'femur');
 assert.equal(names('femur').filter(n=>n==='femur').length,1);
 assert.ok(!names('femur').some(n=>/left|right/.test(n)));
 assert.ok(names('femur').includes('femoral artery'),'related: femoral');
 assert.equal(names('femur')[0],'femur');
});

test('SFD04: biceps — wholes before their heads',()=>{
 const n=names('biceps');
 assert.deepEqual(n.slice(0,2).sort(),['biceps brachii','biceps femoris']);
 assert.ok(n.indexOf('long head of biceps brachii')>1);
 assert.equal(index.byKey.get('long head of biceps brachii')?.parent,'biceps brachii');
});

test('SFD05: deltoid muscle — filler dropped, Deltoid then its parts',()=>{
 const m=match(index,'deltoid muscle');
 assert.equal(m.exact?.name,'deltoid');
 assert.ok(m.parts.length>=3,m.parts.map(p=>p.name).join(', '));
 assert.ok(m.parts.some(p=>p.name==='clavicular part of deltoid'));
 assert.ok(!m.parts.some(p=>p.name==='zone of deltoid'),'zone of deltoid is the deltoid again');
});

test('SFD06: a typo is corrected and says so',()=>{
 const m=match(index,'sphneoid');
 assert.equal(m.rescue?.kind,'typo');
 assert.equal(m.hits[0].entry.name,'sphenoid bone');
 assert.equal(match(index,'sphneoid',{literal:true}).hits.length,0);
 assert.equal(distance('sphneoid','sphenoid',2),1);
});

test('plurals and everyday words',()=>{
 const lungs=match(index,'lungs');
 assert.equal(lungs.hits[0].entry.name,'lung');
 assert.equal(lungs.rescue?.kind,'plural');
 const knee=match(index,'kneecap');
 assert.equal(knee.hits[0].entry.name,'patella');
 assert.equal(knee.rescue?.kind,'alias');
 assert.equal(match(index,'biceps').rescue,null);
 assert.equal(names('teeth').length>0||names('vertebrae').length>0,true);
});

test('ranking: ear finds Ear before Heart',()=>{
 const n=names('ear');
 const ear=n.findIndex(x=>/^(ear|external ear|right ear)$/.test(x)||x.startsWith('ear')),heart=n.indexOf('heart');
 assert.ok(heart<0||ear<heart,n.join(', '));
});

test('paired structures open one side; a typed side wins',()=>{
 const femur=index.byKey.get('femur')!;
 assert.equal(conceptFor(femur).name,'right femur');
 assert.equal(conceptFor(femur,'left').name,'left femur');
 assert.equal(conceptFor(femur,undefined,'left').name,'left femur');
 assert.equal(match(index,'left femur').query.side,'left');
 assert.ok(index.byKey.has('right atrium')||!index.byKey.has('atrium'),'chambers are not folded into one');
});

test('systems',()=>{
 assert.equal(index.byKey.get('heart')?.system,'cardiac');
 assert.equal(index.byKey.get('liver')?.system,'digestive');
 assert.equal(index.byKey.get('lung')?.system,'respiratory');
 assert.equal(index.byKey.get('femoral artery')?.system,'arterial');
 assert.equal(index.byKey.get('spleen')?.system,'lymphatic');
 assert.equal(match(index,'veins').rescue,null);
 assert.deepEqual(match(index,'veins').system,{kind:'system',id:'venous'});
 assert.deepEqual(match(index,'skeleton').system,{kind:'system',id:'skeletal'});
 assert.equal(match(index,'femoral vein').system,null);
});

test('keyboard layout remap',()=>{
 assert.deepEqual(remapLayout('руфке'),['heart']);
 assert.equal(match(index,'feةخقشم شقفثقغ').hits[0]?.entry.name,'femoral artery');
 assert.equal(match(index,'بثةعق').hits[0]?.entry.name,'femur');
 assert.equal(match(index,'deltoid musc').exact?.name,'deltoid');
 assert.equal(match(index,'women').rescue,null);
 assert.equal(match(index,'liacs').rescue?.kind,undefined);
 const m=match(index,'руфке');
 assert.equal(m.rescue?.kind,'layout');
 assert.equal(m.hits[0].entry.name,'heart');
});

test('everyday words say what they mean',()=>{
 const m=match(index,'pecs');
 assert.equal(m.hits[0].entry.name,'pectoralis major');
 assert.equal(m.rescue?.kind,'alias');
 assert.equal(index.byKey.get('skull')?.system,'skeletal');
});

test('regions read like the boards',()=>{
 assert.equal(index.byKey.get('femur')?.region,'Thigh');
 assert.equal(index.byKey.get('heart')?.region,'Chest');
 assert.equal(index.byKey.get('brain')?.region,'Head');
 assert.equal(index.byKey.get('deltoid')?.region,'Shoulder');
});

test('fast enough for every keystroke',()=>{
 const t=performance.now();for(const q of ['f','fe','fem','femu','femur','greater troch','sphneoid','xyzzy qq'])match(index,q);
 assert.ok(performance.now()-t<400,'8 queries took '+(performance.now()-t).toFixed(0)+' ms');
});
