import * as T from 'three';
import type {PublishedPin} from './published-pins';
import {DUR,ease,reducedMotion,springAt} from './motion';
import {MAX_PRIMITIVES,SHAPE_COLOURS,SHAPE_FRAGMENT,SHAPE_VERTEX,emptyPacked,hexToRgb,packFeatureShape,type FeatureShape} from '../lib/feature-shape';
/** A small, read-only overlay on the existing viewer. Stored coordinates stay in the source mesh frame.
 * Community (unreviewed) pins are paler and see-through, so published ones stand out.
 * When the selected pin marks a line or an area, that shape is tinted on the structure by a see-through overlay of the same mesh. */
export class PublishedPinLayer {
 readonly group=new T.Group();
 // Each pin has its own materials, so the open pin can blend to mint and a pin turning away can fade on its own.
 private pins:{id:string;community:boolean;anchor:T.Vector3;normal:T.Vector3;head:T.Mesh;stem:T.Line;order:number;mat:T.MeshBasicMaterial;lineMat:T.LineBasicMaterial;vis:number;visFrom:number;visTo:number;visAt:number}[]=[];
 /** When this set of pins appeared (ms), so heads can pop in nearest first; -1 until first drawn. */
 private born=-1;
 private last:PublishedPin[]|null=null;
 private geometry:T.BufferGeometry|null=null;
 private sphere=new T.SphereGeometry(1,10,8);
 private regular=new T.Color();private community=new T.Color();private mint=new T.Color();
 /** The open pin and the one before it, and when the swap happened (ms): the new one springs up as the old one settles. */
 private cur:string|null=null;private prev:string|null=null;private swapAt=-1e9;
 private shapes=new Map<string,FeatureShape>();
 private packed=emptyPacked();
 private vec=()=>Array.from({length:MAX_PRIMITIVES},()=>new T.Vector4());
 private shapeMaterial=new T.ShaderMaterial({vertexShader:SHAPE_VERTEX,fragmentShader:SHAPE_FRAGMENT,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  uniforms:{uCount:{value:0},uP0:{value:this.vec()},uP1:{value:this.vec()},uP2:{value:this.vec()},uColour:{value:new T.Vector3()},uStrength:{value:.55}}});
 private overlay:T.Mesh|null=null;
 private shown:string|null=null;
 set(input:PublishedPin[],geometry:T.BufferGeometry|null){
  if(this.last===input&&this.geometry===geometry)return;this.clear();this.last=input;this.geometry=geometry;if(!geometry)return;
  for(const pin of input)if(pin.shape)this.shapes.set(pin.id,pin.shape);
  if(this.shapes.size){this.overlay=new T.Mesh(geometry,this.shapeMaterial);this.overlay.visible=false;this.overlay.renderOrder=1;this.overlay.frustumCulled=false;this.group.add(this.overlay);}
  const positions=geometry.getAttribute('position'),indices=geometry.index;if(!indices)return;
  for(const pin of input){const {triangle,u,v}=pin.anchor;if(triangle*3+2>=indices.count)continue;
   const a=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3)),b=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3+1)),c=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3+2));
   const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<=1e-28)continue;normal.normalize();
   const community=pin.kind==='community',anchor=a.multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v),mat=new T.MeshBasicMaterial({toneMapped:false,transparent:true}),lineMat=new T.LineBasicMaterial({toneMapped:false,transparent:true}),head=new T.Mesh(this.sphere,mat),stem=new T.Line(new T.BufferGeometry().setFromPoints([anchor,anchor]),lineMat);
   head.userData.pinId=pin.id;this.group.add(stem,head);this.pins.push({id:pin.id,community,anchor,normal,head,stem,order:0,mat,lineMat,vis:1,visFrom:1,visTo:-1,visAt:0});
  }
 }
 update(camera:T.PerspectiveCamera,height:number,offset:T.Vector3,selected:string|null,dark:boolean,behind=true){
  this.group.position.copy(offset);
  // White heads on the dark stage, near-black on the light one; the open feature's pin is mint and the rest step back.
  this.regular.set(dark?0xf4f5f6:0x2a2d31);this.community.set(dark?0xc8ccd0:0x6f747a);this.mint.set(dark?0x7fd8b0:0x3fa078);
  const now=performance.now(),still=reducedMotion();if(selected!==this.cur){this.prev=this.cur;this.cur=selected;this.swapAt=now;}
  // The swap springs (snappy) as in the handoff; the others step back to 45% only as the first feature opens (and return as it closes).
  const swapT=(now-this.swapAt)/1000,sw=still?1:springAt('snappy',swapT),k=Math.min(1,sw),dim=T.MathUtils.lerp(this.prev?.45:1,this.cur?.45:1,k);
if(this.born<0&&this.pins.length){this.born=now;[...this.pins].sort((a,b)=>a.anchor.clone().add(offset).distanceToSquared(camera.position)-b.anchor.clone().add(offset).distanceToSquared(camera.position)).forEach((p,i)=>{p.order=i;});}
  let popping=!still&&swapT<.6;
  for(const p of this.pins){const distance=camera.position.distanceTo(p.anchor.clone().add(offset)),unit=2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,height),tip=p.anchor.clone().addScaledVector(p.normal,unit*14);
   const t=(now-this.born)/1000-this.delay-p.order*.03,grow=t<=0?0:.4+.6*springAt('snappy',t);if(t<.6)popping=true;
   // With pins behind off, a pin facing away (and its stem) is hidden unless it is the open one.
   // It fades rather than blinks when the toggle or an orbit turns it away.
   const away=!behind&&selected!==p.id&&camera.position.clone().sub(tip).dot(p.normal)<0,visTo=away?0:1;
   if(p.visTo<0){p.vis=p.visFrom=p.visTo=visTo;}else if(visTo!==p.visTo){p.visFrom=p.vis;p.visTo=visTo;p.visAt=now;}
   const kv=still?1:Math.min(1,(now-p.visAt)/1000/(visTo?DUR.enter:DUR.leave));p.vis=p.visFrom+(p.visTo-p.visFrom)*ease[visTo?'out':'in'](kv);if(kv<1)popping=true;
   const on=p.id===this.cur?sw:p.id===this.prev?1-sw:0,c=T.MathUtils.clamp(on,0,1),base=p.community?this.community:this.regular,op=(p.community?.8:1)*dim;
   p.mat.color.lerpColors(base,this.mint,c);p.mat.opacity=T.MathUtils.lerp(op,1,c)*p.vis*this.opacity;p.lineMat.color.copy(base);p.lineMat.opacity=op*p.vis*this.opacity;
   p.head.position.copy(tip);p.head.scale.setScalar(Math.max(1e-4,unit*T.MathUtils.lerp(3,4.2,on)*grow));p.head.visible=grow>0&&p.vis>0;p.stem.visible=p.vis>0;
   const pos=p.stem.geometry.getAttribute('position') as T.BufferAttribute;pos.setXYZ(0,p.anchor.x,p.anchor.y,p.anchor.z);pos.setXYZ(1,tip.x,tip.y,tip.z);pos.needsUpdate=true;p.stem.geometry.computeBoundingSphere();
  }
  this.drawShape(selected,dark);
  this.group.updateMatrixWorld(true);
  return popping;
 }
 /** Seconds to hold the pop after a new set arrives (the camera lands first). */
 delay=0;
 /** The whole layer's strength, for fading it out on the way back to the body. */
 opacity=1;
 /** World position and surface normal of every pin, for the labels. */
 points(){return this.pins.map(p=>({id:p.id,point:p.anchor.clone().add(this.group.position),normal:p.normal.clone()}));}
 /** Tints the selected pin's line or area, if it has one. */
 private drawShape(selected:string|null,dark:boolean){
  if(!this.overlay||!this.geometry?.index)return;
  const shape=selected?this.shapes.get(selected)??null:null,u=this.shapeMaterial.uniforms;
  if(shape&&this.shown!==selected){
   packFeatureShape(this.geometry.getAttribute('position').array,this.geometry.index.array,shape,this.packed);
   for(let i=0;i<this.packed.count;i++){(u.uP0.value[i] as T.Vector4).fromArray(this.packed.p0,i*4);(u.uP1.value[i] as T.Vector4).fromArray(this.packed.p1,i*4);(u.uP2.value[i] as T.Vector4).fromArray(this.packed.p2,i*4);}
   u.uCount.value=this.packed.count;
  }
  this.shown=shape?selected:null;
  if(shape)(u.uColour.value as T.Vector3).fromArray(hexToRgb(SHAPE_COLOURS[dark?'dark':'light'][shape.role]));u.uStrength.value=.55*this.opacity;
  this.overlay.visible=!!shape&&u.uCount.value>0;
 }
 /** Stand-ins drawn once with the same kinds of material as pins, stems and shapes, so their shaders are compiled before
 * the first pins pop in. The caller adds them for one compile and removes them; their materials stay alive, since the
 * GPU may still be compiling when the call returns. */
 warmup(geometry:T.BufferGeometry){const mat=new T.MeshBasicMaterial({toneMapped:false,transparent:true}),line=new T.LineBasicMaterial({toneMapped:false,transparent:true});
  const objects=[new T.Mesh(this.sphere,mat),new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(0,.01,0)]),line),new T.Mesh(geometry,this.shapeMaterial)];
  objects.forEach(o=>{o.frustumCulled=false;});return {objects};}
 /** World position and surface normal of a pin (for turning the camera towards it), or null. */
 facing(id:string){const p=this.pins.find(x=>x.id===id);return p?{point:p.anchor.clone().add(this.group.position),normal:p.normal.clone()}:null;}
 hit(ray:T.Raycaster){return this.group.visible?ray.intersectObjects(this.pins.filter(p=>p.head.visible).map(p=>p.head),false)[0]:undefined;}
 clear(){for(const p of this.pins){p.stem.geometry.dispose();p.mat.dispose();p.lineMat.dispose();}this.pins=[];this.cur=this.prev=null;this.swapAt=-1e9;this.born=-1;this.shapes.clear();this.overlay=null;this.shown=null;this.group.clear();}
 dispose(){this.clear();this.sphere.dispose();this.shapeMaterial.dispose();}
}
