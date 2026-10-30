import * as T from 'three';
import {reducedMotion} from './motion';

export type LabelMode='off'|'soft'|'full';
export interface LabelPoint {id:string;point:T.Vector3;normal:T.Vector3}

/** Names beside the pins on the model, as in the handoff. Labels pop in nearest first, 30 ms apart; the active one sits
 * to the left of its pin in mint with a halo, the rest to the right. Pins on the far side say "· behind" and are
 * dimmer (or hidden when pins behind are off). On About they rest at 70%, on Parts at full strength; once a feature is
 * open the others step back to 55%. A label can be clicked to open its feature. */
export class PinLabels {
 readonly root=document.createElement('div');
 private halo=document.createElement('span');
 private items=new Map<string,{outer:HTMLSpanElement;inner:HTMLSpanElement;text:string;order:number;left:boolean|null}>();
 private key='';private fresh=false;private haloFor:string|null=null;
 private v=new T.Vector3();private toCamera=new T.Vector3();
 constructor(host:HTMLElement,private onPick:(id:string)=>void){
  this.root.className='pin-labels';this.halo.className='pin-halo';this.halo.hidden=true;this.root.appendChild(this.halo);host.appendChild(this.root);
 }
 /** The pins to label, in list order. A new set pops in again; the same set keeps its labels. */
 set(pins:{id:string;label:string}[]){
  const key=pins.map(p=>p.id+':'+p.label).join('|');if(key===this.key)return;this.key=key;
  this.items.forEach(i=>i.outer.remove());this.items.clear();this.root.querySelectorAll('.is-leaving').forEach(e=>e.remove());this.fresh=true;if(!pins.length){this.halo.hidden=true;this.haloFor=null;}
  for(const p of pins){
   const outer=document.createElement('span'),inner=document.createElement('button');
   outer.className='pin-label';inner.type='button';inner.className='pin-label-in';inner.tabIndex=-1;
   const text=p.label.charAt(0).toUpperCase()+p.label.slice(1);inner.textContent=text;
   inner.addEventListener('click',()=>this.onPick(p.id));
   outer.appendChild(inner);this.root.appendChild(outer);this.items.set(p.id,{outer,inner:inner as unknown as HTMLSpanElement,text,order:0,left:null});
  }
 }
 /** Places every label for this frame. `delay` holds the pop until the camera has landed (seconds). */
 update(points:LabelPoint[],camera:T.PerspectiveCamera,w:number,h:number,o:{selected:string|null;mode:LabelMode;behind:boolean;hover:string|null;delay:number}){
  if(this.fresh&&points.length){
   // Nearest first: the order in which labels pop.
   [...points].sort((a,b)=>a.point.distanceToSquared(camera.position)-b.point.distanceToSquared(camera.position)).forEach((p,i)=>{const it=this.items.get(p.id);if(it){it.order=i;it.inner.style.animationDelay=`${Math.round((o.delay+i*.03)*1000)}ms`;it.inner.classList.remove('is-popping');void it.inner.offsetWidth;it.inner.classList.add('is-popping');}});
   this.fresh=false;
  }
  let haloAt:string|null=null;const still=reducedMotion();
  const placed:{l:number;t:number;r:number;b:number}[]=[];
  const rank=(p:LabelPoint)=>(o.selected===p.id?0:o.hover===p.id?1:2)*1e6+(this.items.get(p.id)?.order??0)+(this.toCamera.copy(camera.position).sub(p.point).dot(p.normal)<0?1e3:0);
  for(const p of [...points].sort((a,b)=>rank(a)-rank(b))){
   const it=this.items.get(p.id);if(!it)continue;
   this.v.copy(p.point).project(camera);
   const visible=this.v.z<1&&this.v.z>-1&&o.mode!=='off';
   const facing=this.toCamera.copy(camera.position).sub(p.point).normalize().dot(p.normal)>-.05;
   const on=o.selected===p.id,hover=o.hover===p.id;
   if(!visible||(!facing&&!o.behind&&!on)){it.outer.style.opacity='0';it.outer.style.pointerEvents='none';it.left=null;continue;}
   const x=(this.v.x+1)*w/2,y=(1-this.v.y)*h/2;
   // Labels never pile up: one that would overlap a label already placed waits until there is room.
   // The open label sits left of its pin, unless that would run off the screen; others sit right.
   const text0=facing||on?it.text:`${it.text} · behind`,lw=text0.length*6.4+20,left=on&&x-18-lw>=8,box=left?{l:x-18-lw,t:y-12,r:x-18,b:y+12}:{l:x+14,t:y-12,r:x+14+lw,b:y+12};
   if(!on&&placed.some(q=>box.l<q.r&&box.r>q.l&&box.t<q.b&&box.b>q.t)){it.outer.style.opacity='0';it.outer.style.pointerEvents='none';it.left=null;continue;}
   placed.push(box);
   // Changing sides (pin to pin) cross-fades, as in the handoff: the old form fades out where it was while the new one fades in.
   if(it.left!==null&&it.left!==left&&!still&&it.outer.style.opacity!=='0'){
    const ghost=it.outer.cloneNode(true) as HTMLSpanElement;ghost.classList.add('is-leaving');ghost.firstElementChild?.classList.remove('is-popping');this.root.appendChild(ghost);void ghost.offsetWidth;ghost.style.opacity='0';setTimeout(()=>ghost.remove(),220);
    it.outer.style.transition='none';it.outer.style.opacity='0';void it.outer.offsetWidth;it.outer.style.transition='';
   }
   it.left=left;
   const strength=on||hover?1:o.selected?.55:o.mode==='soft'?.7:1;
   it.outer.style.opacity=String(strength*(facing||on?1:.6));
   it.outer.style.pointerEvents='auto';
   it.outer.style.transform=left?`translate(${(x-18).toFixed(1)}px,${y.toFixed(1)}px) translate(-100%,-50%)`:`translate(${(x+14).toFixed(1)}px,${y.toFixed(1)}px) translateY(-50%)${hover?' scale(1.06)':''}`;
   it.outer.classList.toggle('is-on',on);it.outer.classList.toggle('is-behind',!facing&&!on);
   if(it.inner.textContent!==text0)it.inner.textContent=text0;
   if(on){haloAt=p.id;this.halo.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;}
  }
  // The halo is shown or hidden only when that changes, and replays its entrance when it moves to another pin.
  if(this.halo.hidden===!!haloAt)this.halo.hidden=!haloAt;
  if(haloAt&&this.haloFor&&haloAt!==this.haloFor&&!still)this.halo.getAnimations?.().forEach(a=>{a.cancel();a.play();});
  this.haloFor=haloAt;
  for(const [id,it] of this.items)if(!points.some(p=>p.id===id))it.outer.style.opacity='0';
 }
 clear(){this.set([]);this.halo.hidden=true;this.haloFor=null;}
 dispose(){this.root.remove();}
}
