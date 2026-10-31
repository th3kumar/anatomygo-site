import * as T from 'three';
import {reducedMotion,springAt} from './motion';

/** Where a pin sits: a triangle of the structure's mesh and the weights of its second and third corners, in the mesh's
 * own frame (the same anchor the Playground and the database store). */
export interface Anchor {triangle:number;u:number;v:number}

/** The anchor under a hit on `mesh` (its geometry in the source frame, placed by translation only, as the scene does),
 * or why it can't hold a pin: the back of the surface, or a triangle the structure marks unusable. */
export function anchorAt(hit:T.Intersection,mesh:T.Mesh,ray:T.Ray,invalid:ReadonlySet<number>):{ok:true;anchor:Anchor}|{ok:false;reason:'back_face'|'degenerate'}{
 const g=mesh.geometry,pos=g.getAttribute('position'),index=g.index,t=hit.faceIndex??-1;
 if(!index||t<0||invalid.has(t))return {ok:false,reason:'degenerate'};
 const a=new T.Vector3().fromBufferAttribute(pos,index.getX(t*3)),b=new T.Vector3().fromBufferAttribute(pos,index.getX(t*3+1)),c=new T.Vector3().fromBufferAttribute(pos,index.getX(t*3+2));
 const n=b.clone().sub(a).cross(c.clone().sub(a));if(n.lengthSq()<=1e-28)return {ok:false,reason:'degenerate'};
 if(n.dot(ray.direction)>0)return {ok:false,reason:'back_face'};
 const w=T.Triangle.getBarycoord(hit.point.clone().sub(mesh.position),a,b,c,new T.Vector3());
 if(!w)return {ok:false,reason:'degenerate'};
 // Clamped into the triangle, so rounding at an edge can't give the database a point just outside it.
 const u=Math.min(1,Math.max(0,w.y)),v=Math.min(1-u,Math.max(0,w.z));
 return {ok:true,anchor:{triangle:t,u,v}};
}

/** The pin being placed (films K7–K8): a mint head on a stem. A new spot drops it 18 px along the surface with one small
 * bounce while a mint ring grows to 58 px and fades (0.3 s); a nudge moves it without playing the drop again. */
export class DraftPinLayer {
 readonly group=new T.Group();
 private headMat=new T.MeshBasicMaterial({toneMapped:false,transparent:true});
 private head=new T.Mesh(new T.SphereGeometry(1,14,12),this.headMat);
 private stemMat=new T.LineBasicMaterial({toneMapped:false,transparent:true});
 private stem=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),this.stemMat);
 private ringMat=new T.MeshBasicMaterial({toneMapped:false,transparent:true,depthTest:false,side:T.DoubleSide});
 private ring=new T.Mesh(new T.RingGeometry(.84,1,48),this.ringMat);
 private anchor=new T.Vector3();private normal=new T.Vector3(0,1,0);private droppedAt=-1e9;
 constructor(){this.head.renderOrder=this.stem.renderOrder=12;this.ring.renderOrder=13;this.group.add(this.stem,this.head,this.ring);this.group.visible=false;}
 /** Shows the pin at `a` on `geometry`, or hides it (null). `drop` plays the landing; a nudge passes false. */
 set(geometry:T.BufferGeometry|null,a:Anchor|null,drop:boolean){
  const index=geometry?.index,pos=geometry?.getAttribute('position');
  if(!a||!index||!pos||a.triangle*3+2>=index.count){this.group.visible=false;return;}
  const p=(k:number)=>new T.Vector3().fromBufferAttribute(pos,index.getX(a.triangle*3+k)),A=p(0),B=p(1),C=p(2);
  this.normal.copy(B.clone().sub(A).cross(C.clone().sub(A))).normalize();
  this.anchor.copy(A.multiplyScalar(1-a.u-a.v).addScaledVector(B,a.u).addScaledVector(C,a.v));
  if(drop)this.droppedAt=performance.now();this.group.visible=true;
 }
 /** Draws the pin for this frame; true while it is still moving. */
 update(camera:T.PerspectiveCamera,height:number,offset:T.Vector3,dark:boolean){
  if(!this.group.visible)return false;
  this.group.position.copy(offset);
  const world=this.anchor.clone().add(offset),unit=2*camera.position.distanceTo(world)*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,height);
  const t=reducedMotion()?9:(performance.now()-this.droppedAt)/1000,fall=(1-Math.min(1,springAt('drop',t)))*18;
  const mint=dark?0x7fd8b0:0x3fa078,tip=this.anchor.clone().addScaledVector(this.normal,unit*(14+fall));
  this.headMat.color.set(mint);this.stemMat.color.set(mint);
  this.head.position.copy(tip);this.head.scale.setScalar(unit*4.6);
  const s=this.stem.geometry.getAttribute('position') as T.BufferAttribute;s.setXYZ(0,this.anchor.x,this.anchor.y,this.anchor.z);s.setXYZ(1,tip.x,tip.y,tip.z);s.needsUpdate=true;this.stem.geometry.computeBoundingSphere();
  // The ring lands with the pin: it grows to 58 px across and fades out over 0.3 s, facing the viewer.
  const r=t/.3;this.ring.visible=r<1;
  if(r<1){this.ring.position.copy(this.anchor);this.ring.quaternion.copy(camera.quaternion);this.ring.scale.setScalar(unit*29*(1-(1-r)**3));this.ringMat.color.set(mint);this.ringMat.opacity=.9*(1-r);}
  return t<.8;
 }
 hit(ray:T.Raycaster){return this.group.visible?ray.intersectObject(this.head,false)[0]:undefined;}
 /** Whether a point on screen (pixels from the canvas's top left) is within `r` px of the pin's head. */
 near(camera:T.Camera,w:number,h:number,x:number,y:number,r:number){if(!this.group.visible)return false;const v=this.head.position.clone().add(this.group.position).project(camera);return Math.hypot((v.x+1)*w/2-x,(1-v.y)*h/2-y)<=r;}
 /** The anchor on screen, in pixels from the canvas's top left. */
 screen(camera:T.Camera,w:number,h:number){const v=this.anchor.clone().add(this.group.position).project(camera);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2};}
 dispose(){this.head.geometry.dispose();this.headMat.dispose();this.stem.geometry.dispose();this.stemMat.dispose();this.ring.geometry.dispose();this.ringMat.dispose();}
}
