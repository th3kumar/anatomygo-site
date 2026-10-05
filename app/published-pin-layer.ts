import * as T from 'three';
import type {PublishedPin} from './published-pins';
/** A small, read-only overlay on the existing viewer. Stored coordinates stay in the source mesh frame. */
export class PublishedPinLayer {
 readonly group=new T.Group();
 private pins:{id:string;anchor:T.Vector3;normal:T.Vector3;head:T.Mesh;stem:T.Line}[]=[];
 private last:PublishedPin[]|null=null;
 private geometry:T.BufferGeometry|null=null;
 private sphere=new T.SphereGeometry(1,10,8);
 private regular=new T.MeshBasicMaterial({color:0x6e858d,toneMapped:false});
 private selected=new T.MeshBasicMaterial({color:0x229e8b,toneMapped:false});
 private line=new T.LineBasicMaterial({color:0x6e858d,toneMapped:false});
 set(input:PublishedPin[],geometry:T.BufferGeometry|null){
  if(this.last===input&&this.geometry===geometry)return;this.clear();this.last=input;this.geometry=geometry;if(!geometry)return;
  const positions=geometry.getAttribute('position'),indices=geometry.index;if(!indices)return;
  for(const pin of input){const {triangle,u,v}=pin.anchor;if(triangle*3+2>=indices.count)continue;
   const a=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3)),b=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3+1)),c=new T.Vector3().fromBufferAttribute(positions,indices.getX(triangle*3+2));
   const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<=1e-28)continue;normal.normalize();
   const anchor=a.multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v),head=new T.Mesh(this.sphere,this.regular),stem=new T.Line(new T.BufferGeometry().setFromPoints([anchor,anchor]),this.line);
   head.userData.pinId=pin.id;this.group.add(stem,head);this.pins.push({id:pin.id,anchor,normal,head,stem});
  }
 }
 update(camera:T.PerspectiveCamera,height:number,offset:T.Vector3,selected:string|null,dark:boolean){
  this.group.position.copy(offset);this.regular.color.set(dark?0xd6d9de:0x536875);this.line.color.copy(this.regular.color);
  for(const p of this.pins){const distance=camera.position.distanceTo(p.anchor.clone().add(offset)),unit=2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,height),tip=p.anchor.clone().addScaledVector(p.normal,unit*14);
   p.head.position.copy(tip);p.head.scale.setScalar(unit*(selected===p.id?4.5:3));p.head.material=selected===p.id?this.selected:this.regular;
   const pos=p.stem.geometry.getAttribute('position') as T.BufferAttribute;pos.setXYZ(0,p.anchor.x,p.anchor.y,p.anchor.z);pos.setXYZ(1,tip.x,tip.y,tip.z);pos.needsUpdate=true;p.stem.geometry.computeBoundingSphere();
  }
  this.group.updateMatrixWorld(true);
 }
 hit(ray:T.Raycaster){return this.group.visible?ray.intersectObjects(this.pins.map(p=>p.head),false)[0]:undefined;}
 clear(){for(const p of this.pins)p.stem.geometry.dispose();this.pins=[];this.group.clear();}
 dispose(){this.clear();this.sphere.dispose();this.regular.dispose();this.selected.dispose();this.line.dispose();}
}
