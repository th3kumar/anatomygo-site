import * as T from 'three';
import type {PublishedPin} from './published-pins';
import {MAX_PRIMITIVES,SHAPE_COLOURS,SHAPE_FRAGMENT,SHAPE_VERTEX,emptyPacked,hexToRgb,packFeatureShape,type FeatureShape} from '../lib/feature-shape';
/** A small, read-only overlay on the existing viewer. Stored coordinates stay in the source mesh frame.
 * Community (unreviewed) pins are paler and see-through, so published ones stand out.
 * When the selected pin marks a line or an area, that shape is tinted on the structure by a see-through overlay of the same mesh. */
export class PublishedPinLayer {
 readonly group=new T.Group();
 private pins:{id:string;community:boolean;anchor:T.Vector3;normal:T.Vector3;head:T.Mesh;stem:T.Line}[]=[];
 private last:PublishedPin[]|null=null;
 private geometry:T.BufferGeometry|null=null;
 private sphere=new T.SphereGeometry(1,10,8);
 private regular=new T.MeshBasicMaterial({color:0x6e858d,toneMapped:false});
 private selected=new T.MeshBasicMaterial({color:0x229e8b,toneMapped:false});
 private line=new T.LineBasicMaterial({color:0x6e858d,toneMapped:false});
 private community=new T.MeshBasicMaterial({color:0x9aabb3,toneMapped:false,transparent:true,opacity:.8});
 private communityLine=new T.LineBasicMaterial({color:0x9aabb3,toneMapped:false,transparent:true,opacity:.8});
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
   const community=pin.kind==='community',anchor=a.multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v),head=new T.Mesh(this.sphere,community?this.community:this.regular),stem=new T.Line(new T.BufferGeometry().setFromPoints([anchor,anchor]),community?this.communityLine:this.line);
   head.userData.pinId=pin.id;this.group.add(stem,head);this.pins.push({id:pin.id,community,anchor,normal,head,stem});
  }
 }
 update(camera:T.PerspectiveCamera,height:number,offset:T.Vector3,selected:string|null,dark:boolean){
  this.group.position.copy(offset);this.regular.color.set(dark?0xd6d9de:0x536875);this.line.color.copy(this.regular.color);this.community.color.set(dark?0x8b939b:0x9aabb3);this.communityLine.color.copy(this.community.color);
  for(const p of this.pins){const distance=camera.position.distanceTo(p.anchor.clone().add(offset)),unit=2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,height),tip=p.anchor.clone().addScaledVector(p.normal,unit*14);
   p.head.position.copy(tip);p.head.scale.setScalar(unit*(selected===p.id?4.5:3));p.head.material=selected===p.id?this.selected:p.community?this.community:this.regular;
   const pos=p.stem.geometry.getAttribute('position') as T.BufferAttribute;pos.setXYZ(0,p.anchor.x,p.anchor.y,p.anchor.z);pos.setXYZ(1,tip.x,tip.y,tip.z);pos.needsUpdate=true;p.stem.geometry.computeBoundingSphere();
  }
  this.drawShape(selected,dark);
  this.group.updateMatrixWorld(true);
 }
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
  if(shape)(u.uColour.value as T.Vector3).fromArray(hexToRgb(SHAPE_COLOURS[dark?'dark':'light'][shape.role]));
  this.overlay.visible=!!shape&&u.uCount.value>0;
 }
 hit(ray:T.Raycaster){return this.group.visible?ray.intersectObjects(this.pins.map(p=>p.head),false)[0]:undefined;}
 clear(){for(const p of this.pins)p.stem.geometry.dispose();this.pins=[];this.shapes.clear();this.overlay=null;this.shown=null;this.group.clear();}
 dispose(){this.clear();this.sphere.dispose();this.regular.dispose();this.selected.dispose();this.line.dispose();this.community.dispose();this.communityLine.dispose();this.shapeMaterial.dispose();}
}
