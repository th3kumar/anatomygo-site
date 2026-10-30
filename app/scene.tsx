import {PublishedPinLayer} from './published-pin-layer';
import {freeArea} from './insets';
import {PinLabels} from './pin-labels';
import {ease,reducedMotion} from './motion';
import type {PublishedPin} from './published-pins';
import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createExplosionLayout} from './explosion-layout';
import {decodeModelResponse} from './model-download';
import {loadStreamChunk,matchesAtlas,preloadStream,pruneStore,type PartData,type Tier} from './model-stream';
import {PointerTap} from './pointer-tap';
import {SYSTEMS,type Atlas,type SceneState} from './anatomy';
import {FILL_DIRECTION,RIG,RIM_DIRECTION,lightDirection,type Light} from './lighting';
// The stage follows the page's appearance; the anatomy keeps its colours in both.
// Dark ("Graphite Soft") draws on a transparent canvas over the page's stage gradient, with a platform ring and a
// contact shadow instead of the floor.
const GHOSTLESS=new Set(['arterial','venous','nervous','lymphatic','integumentary']);
const STAGE={light:{clear:'#f1f0ec',alpha:0,ring:0x8c969f,ringOpacity:.4,inner:0xa4aeb8,innerOpacity:.16,marker:0x64748b},dark:{clear:'#151618',alpha:0,ring:0xffffff,ringOpacity:.1,inner:0xffffff,innerOpacity:.04,marker:0xa4a9b0}};
/** What became of a tap made before the whole model had loaded (see the loading_tap event in page.tsx). */
export interface LoadingTap {result:'answered'|'missed'|'held'|'resolved'|'dropped';waitMs?:number;reason?:'moved'|'replaced'|'timeout'}
interface Props {pins:PublishedPin[];selectedPin:string|null;onPinSelect:(id:string)=>void;atlas:Atlas;state:SceneState;light:Light;dark:boolean;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(s:string)=>void;onPerf?:(p:{frameMs:number;renderMs:number})=>void;onMilestone?:(m:'outer'|'view'|'priority')=>void;priority?:string[];onLoadingTap?:(t:LoadingTap)=>void}
export default function AnatomyScene({atlas,state,light,dark,onSelect,onProgress,onError,onPerf,onMilestone,priority,onLoadingTap,pins,selectedPin,onPinSelect}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(state),select=useRef(onSelect),lamp=useRef(light),shade=useRef(dark);
 const published=useRef(pins),selectedPinRef=useRef(selectedPin),pickPin=useRef(onPinSelect);published.current=pins;selectedPinRef.current=selectedPin;pickPin.current=onPinSelect;
 const perf=useRef(onPerf),milestone=useRef(onMilestone),first=useRef(priority??[]),loadingTap=useRef(onLoadingTap);loadingTap.current=onLoadingTap;perf.current=onPerf;milestone.current=onMilestone;first.current=priority??[];
 latest.current=state;select.current=onSelect;lamp.current=light;shade.current=dark;
 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastView='',lastReset=-1,lastIsolate='',layoutKey='',amount=0;
  let lastState:SceneState|null=null;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));renderer.setClearColor('#f1f0ec',0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=RIG.exposure;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.005,100),controls=new OrbitControls(camera,renderer.domElement);
  camera.position.set(1.4,1.05,3.6);controls.target.set(0,.85,0);controls.enableDamping=true;controls.dampingFactor=.085;controls.zoomToCursor=true;controls.minDistance=.07;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.96;controls.addEventListener('change',()=>{dirty=true;});
  const publishedLayer=new PublishedPinLayer();scene.add(publishedLayer.group);let lastPins:PublishedPin[]|null=null,lastPin:string|null=null;controls.addEventListener('start',()=>{fly=null;stopFloat();});
  const labels=new PinLabels(el,id=>pickPin.current(id));
  // Camera moves: one tween on the handoff's camera curve (no overshoot). Direction turns, distance eases in log space,
  // and the view offset (which keeps the subject clear of the panels) moves with them. Grabbing the model stops it.
  type Shot={pos:T.Vector3;target:T.Vector3;off:[number,number]};
  // After Learn more lands, the structure floats gently for a few seconds (as in the handoff), until anything is touched.
  const FLOAT={seconds:4,lift:3,period:2.8,breathe:.004};
  let floatPending=false,floatAt=0,floatStop=0;
  const stopFloat=()=>{floatPending=false;if(floatAt&&!floatStop)floatStop=performance.now();};
  for(const type of ['pointerdown','keydown','wheel'])addEventListener(type,stopFloat,{capture:true,passive:true});
  const applyFloat=()=>{
   if(!floatAt)return;const now=performance.now(),t=(now-floatAt)/1000,fade=floatStop?Math.max(0,1-(now-floatStop)/200):1;
   const w=el.clientWidth,h=el.clientHeight;
   if(t>=FLOAT.seconds||fade<=0){floatAt=0;floatStop=0;camera.zoom=1;camera.updateProjectionMatrix();setOffset(...off);dirty=true;return;}
   const env=Math.sin(Math.PI*t/FLOAT.seconds)*fade,wave=Math.sin(2*Math.PI*t/FLOAT.period);
   camera.setViewOffset(w,h,off[0],off[1]-FLOAT.lift*wave*env,w,h);camera.zoom=1+FLOAT.breathe*Math.sin(2*Math.PI*t/(FLOAT.period*1.6))*env;camera.updateProjectionMatrix();dirty=true;
  };
  let off:[number,number]=[0,0],fly:{from:Shot;to:Shot;t:number;dur:number}|null=null,bodyShot:Shot|null=null,isoShot:Shot|null=null;
  const setOffset=(x:number,y:number)=>{off=[x,y];const w=el.clientWidth,h=el.clientHeight;if(Math.abs(x)<.01&&Math.abs(y)<.01)camera.clearViewOffset();else camera.setViewOffset(w,h,x,y,w,h);};
  const shot=():Shot=>({pos:camera.position.clone(),target:controls.target.clone(),off:[...off]});
  const flyTo=(to:Shot,dur:number)=>{if(floatAt){floatAt=0;floatStop=0;camera.zoom=1;camera.updateProjectionMatrix();}if(dur<=0||reducedMotion()){fly=null;controls.target.copy(to.target);camera.position.copy(to.pos);setOffset(...to.off);controls.update();dirty=true;return;}fly={from:shot(),to,t:0,dur};dirty=true;};
  const stepFly=(dt:number)=>{if(!fly)return;fly.t=Math.min(1,fly.t+dt/fly.dur);const e=ease.cam(fly.t),f=fly.from,g=fly.to;
   const d0=f.pos.clone().sub(f.target),d1=g.pos.clone().sub(g.target),l0=Math.max(1e-4,d0.length()),l1=Math.max(1e-4,d1.length());
   const q=new T.Quaternion().setFromUnitVectors(d0.clone().normalize(),d1.clone().normalize()),dir=d0.clone().normalize().applyQuaternion(new T.Quaternion().slerp(q,e));
   controls.target.lerpVectors(f.target,g.target,e);camera.position.copy(controls.target).addScaledVector(dir,Math.exp(Math.log(l0)+(Math.log(l1)-Math.log(l0))*e));
   setOffset(f.off[0]+(g.off[0]-f.off[0])*e,f.off[1]+(g.off[1]-f.off[1])*e);controls.update();dirty=true;if(fly.t>=1){fly=null;if(floatPending&&!reducedMotion()){floatPending=false;floatAt=performance.now();floatStop=0;}}};
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0x6d737a,RIG.hemisphere));
  const key=new T.DirectionalLight(0xfff5e8,RIG.key);key.position.set(-2,4,3);scene.add(key);
  const fill=new T.DirectionalLight(0xe6f0ff,RIG.fill);scene.add(fill);
  const rim=new T.DirectionalLight(0xd9e6ff,RIG.rim);rim.position.set(2,2,-3);scene.add(rim);
  // The key and rim lights follow the camera, as in the app, so the chosen light holds while orbiting.
  const rimDirection=new T.Vector3(...RIM_DIRECTION).normalize(),fillDirection=new T.Vector3(...FILL_DIRECTION).normalize();let placedLight:Light|null=null;
  const placeLights=()=>{key.position.set(...lightDirection(lamp.current)).applyQuaternion(camera.quaternion).multiplyScalar(5);rim.position.copy(rimDirection).applyQuaternion(camera.quaternion).multiplyScalar(5);fill.position.copy(fillDirection).applyQuaternion(camera.quaternion).multiplyScalar(5);};
  const ground=new T.Mesh(new T.CircleGeometry(30,96),new T.MeshStandardMaterial({color:0xd5d9dc,roughness:1,envMap:env.texture}));ground.rotation.x=-Math.PI/2;ground.position.y=-.019;scene.add(ground);
  const platform=new T.Mesh(new T.CylinderGeometry(.68,.7,.028,100),new T.MeshStandardMaterial({color:0xeeeeec,metalness:.12,roughness:.67,envMap:env.texture}));platform.position.y=-.016;scene.add(platform);
  const shadowTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d')!,r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(0,0,0,.35)');r.addColorStop(.5,'rgba(0,0,0,.2)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);return new T.CanvasTexture(c);})();
  const contact=new T.Mesh(new T.CircleGeometry(.6,64),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));contact.rotation.x=-Math.PI/2;contact.position.y=.0005;contact.visible=false;scene.add(contact);
  const ring=new T.Mesh(new T.RingGeometry(.63,.632,128),new T.MeshBasicMaterial({color:0x8c969f,transparent:true,opacity:.4,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;scene.add(ring);
  const innerRing=new T.Mesh(new T.RingGeometry(.55,.551,128),new T.MeshBasicMaterial({color:0xa4aeb8,transparent:true,opacity:.16,side:T.DoubleSide}));innerRing.rotation.x=-Math.PI/2;innerRing.position.y=.001;scene.add(innerRing);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),data=new Float32Array(width*4),partTexture=new T.DataTexture(data,width,1,T.RGBAFormat,T.FloatType);partTexture.needsUpdate=true;
  const selectedData=new Uint8Array(width*4),selectionTexture=new T.DataTexture(selectedData,width,1);selectionTexture.needsUpdate=true;
  const materials:T.Material[]=[],geometries:T.BufferGeometry[]=[],pickers:(T.Mesh|undefined)[]=[],centers=atlas.parts.map(p=>new T.Vector3().fromArray(p.bounds[0]).add(new T.Vector3().fromArray(p.bounds[1])).multiplyScalar(.5));
  const offsets:T.Vector3[]=[],bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  let packingWidth=1,packingHeight=1;
  const markerPositions=new Float32Array(atlas.parts.length*3),markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(markerPositions,3));
  const markerMaterial=new T.PointsMaterial({color:0x64748b,size:5,sizeAttenuation:false,transparent:true,opacity:.72,depthTest:false});
  markerMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  const markers=new T.Points(markerGeometry,markerMaterial);markers.frustumCulled=false;markers.renderOrder=10;markers.visible=false;scene.add(markers);
  let staged:boolean|null=null;
  const stage=(dark:boolean)=>{const c=dark?STAGE.dark:STAGE.light;renderer.setClearColor(c.clear,c.alpha);const rim1=ring.material as T.MeshBasicMaterial,rim2=innerRing.material as T.MeshBasicMaterial;rim1.color.set(c.ring);rim1.opacity=c.ringOpacity;rim2.color.set(c.inner);rim2.opacity=c.innerOpacity;markerMaterial.color.set(c.marker);ghostMaterial.color.set(dark?0x8c969f:0x7d8892);staged=dark;dirty=true;};
  const hover=document.createElement('div');hover.className='part-hover';hover.setAttribute('role','tooltip');hover.hidden=true;el.appendChild(hover);
  type Target={index:number;x:number;y:number;left:number;right:number;top:number;bottom:number};let targets:Target[]=[];
  const projected=new T.Vector3();
  const findTarget=(x:number,y:number,radius:number)=>{
   let best=-1,score=Infinity;
   for(const t of targets){const dx=Math.max(t.left-x,0,x-t.right),dy=Math.max(t.top-y,0,y-t.bottom),distance=Math.hypot(dx,dy);if(distance>radius)continue;const candidate=distance+Math.hypot(t.x-x,t.y-y)*.025;if(candidate<score){score=candidate;best=t.index;}}
   return best;
  };
  const materialFor=(system:string,ghost=false)=>{
   const m=ghost
    // Neighbours in focus, as in the Playground: subdued grey glass that never hides the structure.
    ?new T.MeshStandardMaterial({color:0x8c969f,transparent:true,opacity:.2,depthWrite:false,roughness:.9,side:T.DoubleSide,envMap:env.texture,envMapIntensity:RIG.environment})
    :new T.MeshStandardMaterial({color:SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8',metalness:.08,roughness:.53,envMap:env.texture,envMapIntensity:RIG.environment,side:T.DoubleSide,transparent:system==='integumentary',opacity:system==='integumentary'?.1:1,depthWrite:system!=='integumentary'});
   m.onBeforeCompile=shader=>{
    shader.uniforms.partState={value:partTexture};shader.uniforms.selectionState={value:selectionTexture};shader.uniforms.stateWidth={value:width};
    shader.vertexShader='attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; varying float partVisible; varying float partSelected; varying float partGhost;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5); vec4 state = texture2D(partState, stateUv); transformed += state.xyz; partVisible = state.w; vec4 sel = texture2D(selectionState, stateUv); partSelected = sel.r; partGhost = sel.g;');
    shader.fragmentShader='varying float partVisible; varying float partSelected; varying float partGhost;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',ghost?'#include <clipping_planes_fragment>\nif (partVisible < 0.5 || partGhost < 0.5) discard;':'#include <clipping_planes_fragment>\nif (partVisible < 0.5 || partGhost > 0.5) discard;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.212, 0.686, 0.434), partSelected * 0.55);');
   };materials.push(m);return m;
  };
  const mats=new Map(SYSTEMS.map(s=>[s.id,materialFor(s.id)])),ghostMaterial=materialFor('ghost',true) as T.MeshStandardMaterial;
  // Parts arrive outside-in from the stream copy when this browser can use it (model-stream.ts), otherwise, or for
  // anything the stream fails to deliver, from the canonical chunks. Taps work from the first moment (a tap that a missing part might sit in front of is held, below); `outerIn` marks the outer body;
  // `ready` still means every part is in, as before.
  const added=new Uint8Array(atlas.parts.length),partIndex=new Map(atlas.parts.map((p,i)=>[p.id,i]));let outerIn=false,viewShown=false,shown=0,prioritySent=false;
  const addParts=(list:PartData[])=>{
   const groups=new Map<string,T.BufferGeometry[]>();
   for(const {index:i,positions,normals,indices} of list){
    if(added[i])continue;added[i]=1;const p=atlas.parts[i];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
    // GPU normalized signed-short normals keep the complete atlas compact in memory.
    g.setAttribute('normal',new T.BufferAttribute(normals,3,true));g.setIndex(new T.BufferAttribute(indices,1));
    g.boundingBox=bounds[i].clone();g.computeBoundingSphere();const pick=new T.Mesh(g);pick.matrixAutoUpdate=false;pick.position.set(data[i*4],data[i*4+1],data[i*4+2]);pick.updateMatrix();pick.updateMatrixWorld(true);pickers[i]=pick;geometries.push(g);
    g.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i),1));
    const list=groups.get(p.system)??[];list.push(g);groups.set(p.system,list);
   }
   groups.forEach((gs,system)=>{const geometry=mergeGeometries(gs,false);if(!geometry)throw new Error('Could not assemble anatomy geometry.');geometries.push(geometry);const mesh=new T.Mesh(geometry,mats.get(system as never));mesh.frustumCulled=false;scene.add(mesh);const ghost=new T.Mesh(geometry,ghostMaterial);ghost.frustumCulled=false;ghost.renderOrder=2;scene.add(ghost);});
   lastState=null;dirty=true;retryTap();
   // A linked structure is in: the page can show its focus view without waiting for the rest of the body.
   if(!prioritySent&&first.current.length&&first.current.every(id=>{const i=partIndex.get(id);return i!==undefined&&!!added[i];})){prioritySent=true;milestone.current?.('priority');}
  };
  const report=(n:number)=>{n=Math.max(shown,Math.min(99,Math.floor(n)));if(n!==shown){shown=n;onProgress(n);}};
  const reached=(outer:boolean,view:boolean)=>{if(outer&&!outerIn){outerIn=true;milestone.current?.('outer');}if(view&&!viewShown){viewShown=true;milestone.current?.('view');}};
  const loadCanonical=async(ci:number)=>{
   const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';const response=await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal});const buffer=await decodeModelResponse(response,chunk.bytes,compressed);if(disposed)return;
   addParts(atlas.parts.flatMap((p,index)=>p.chunk===ci?[{index,positions:new Float32Array(buffer,p.positions,p.vertexCount*3),normals:new Int16Array(buffer,p.normals,p.vertexCount*3),indices:new Uint32Array(buffer,p.indices,p.indexCount)}]:[]));
  };
  const loadStream=async()=>{
   const stream=await preloadStream();if(!stream||disposed||!matchesAtlas(stream,atlas))return;
   const m=stream;void pruneStore(m);const total=m.chunks.reduce((a,c)=>a+c.gzipBytes,0),taken=new Uint8Array(m.chunks.length),left:Record<Tier,number>={outer:0,inner:0,hidden:0};let bytes=0;
   m.chunks.forEach(c=>left[c.tier]++);
   // Next: a chunk holding a linked or selected structure that hasn't arrived (a shared link, a search during loading), else the next one outside-in.
   let failed=false;
   const next=()=>{if(failed)return -1;for(const id of [...first.current,...latest.current.selected]){const i=partIndex.get(id);if(i!==undefined&&!added[i]&&!taken[m.parts[i][0]])return m.parts[i][0];}return taken.indexOf(0);};
   try{await Promise.all(Array.from({length:2},async()=>{for(let c=next();c>=0&&!disposed;c=next()){taken[c]=1;const parts=await loadStreamChunk(m,atlas,c,abort.signal).catch(e=>{failed=true;throw e;});if(disposed)return;addParts(parts);left[m.chunks[c].tier]--;bytes+=m.chunks[c].gzipBytes;reached(!left.outer,!left.outer&&!left.inner);report(bytes/total*100);}}));}
   catch(e){if(disposed||(e instanceof DOMException&&e.name==='AbortError'))return;console.warn('Stream model failed; loading the remaining parts from the canonical files.',e);}
  };
  (async()=>{try{
   await loadStream();if(disposed)return;
   const missing=[...new Set(atlas.parts.flatMap((p,i)=>added[i]?[]:[p.chunk]))];let cursor=0,count=0;
   await Promise.all(Array.from({length:3},async()=>{while(cursor<missing.length&&!disposed){const ci=missing[cursor++];await loadCanonical(ci);count++;report(count/missing.length*100);}}));
   if(!disposed){reached(true,true);ready=true;dirty=true;onProgress(100);}
  }catch(e){if(!disposed)onError(e instanceof Error?e.message:'Could not load the anatomy.');}})();
  // The assembled body fills the screen space the panels leave free (app/insets.ts), centred in it; exploding blends
  // towards the inventory framing, which uses the whole screen.
  const BODY={centre:.86,height:1.86,width:.8};
  // Seconds, from the handoff: focus and feature moves, pin to pin, and back to the body.
  const DURATION={view:.9,focus:.95,feature:.9,next:.5,back:.85,reframe:.45};
  const fit=(view:string,extent=0,dur=0)=>{
   const w=el.clientWidth,h=el.clientHeight,mobile=w<768,tan=Math.tan(T.MathUtils.degToRad(camera.fov/2)),area=freeArea(el);
   const freeW=Math.max(120,area.right-area.left),freeH=Math.max(120,area.bottom-area.top);
   const bodyDistance=Math.max(BODY.height/2/tan*(h/freeH),BODY.width/2/tan/camera.aspect*(w/freeW));
   const reservedHeight=mobile?350:270;const availableAspect=Math.max(.35,(w-(mobile?40:340))/Math.max(160,h-reservedHeight));const atlasDistance=Math.max(packingHeight,packingWidth/availableAspect)/(2*tan)*(h/Math.max(160,h-reservedHeight))*1.08;
   const distance=T.MathUtils.lerp(bodyDistance,Math.max(.2,atlasDistance),extent);if(extent>.8)view='front';
   const direction=view==='front'?new T.Vector3(0,.02,1):view==='back'?new T.Vector3(0,.02,-1):view==='side'?new T.Vector3(1,.02,0):new T.Vector3(.35,.06,1).normalize();
   // Centred on the screen as in the handoff, moved sideways only as far as a panel would otherwise cover the body.
   const bodyPx=BODY.width*h/(2*tan*bodyDistance),cx=freeW<bodyPx?(area.left+area.right)/2:Math.min(Math.max(w/2,area.left+bodyPx/2),area.right-bodyPx/2);
   const keep=1-Math.min(1,extent*1.5);
   const target=new T.Vector3(extent>.1&&!mobile?-packingWidth*.12*Math.min(1,extent*2):0,T.MathUtils.lerp(BODY.centre,.85,Math.min(1,extent*2)),0);
   flyTo({target,pos:target.clone().addScaledVector(direction,distance),off:[(w/2-cx)*keep,(h/2-(area.top+area.bottom)/2)*keep]},dur);
  };
  const resize=()=>{layoutKey='';lastState=null;renderer.setPixelRatio(Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.5:2));camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);fit(latest.current.view,amount);};const observer=new ResizeObserver(resize);observer.observe(el);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap(),worldBox=new T.Box3(),hitPoint=new T.Vector3();
  const down=(e:PointerEvent)=>{stopFloat();hover.hidden=true;tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);};
  const move=(e:PointerEvent)=>{tap.move(e.pointerId,e.clientX,e.clientY);if(e.buttons||amount<.5||e.pointerType==='touch'){hover.hidden=true;return;}const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,index=findTarget(x,y,12);hover.hidden=index<0;renderer.domElement.style.cursor=index<0?'grab':'pointer';if(index>=0){hover.textContent=atlas.parts[index].name;hover.style.left=`${Math.max(8,Math.min(x+14,el.clientWidth-260))}px`;hover.style.top=`${Math.max(8,Math.min(y+18,el.clientHeight-55))}px`;}};
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  // A tap held because a part that might be in front of the hit is still on its way; tried again when parts arrive,
  // and dropped if the camera has moved since or it has waited longer than HOLD_MS (a late selection would surprise).
  const HOLD_MS=3000;
  let pendingTap:{ray:T.Ray;x:number;y:number;touch:boolean;camera:T.Matrix4;at:number}|null=null;const offset=new T.Vector3();
  const resolveTap=(x:number,y:number,touch:boolean,at=performance.now()):'held'|'answered'|'missed'=>{
   let nearest=Infinity,found=-1;const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);
   pickers.forEach((mesh,i)=>{if(!mesh||data[i*4+3]<.5||selectedData[i*4+1]>0||(hasSolid&&atlas.parts[i].system==='integumentary'))return;worldBox.copy(bounds[i]).translate(mesh.position);if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;const hits=raycaster.intersectObject(mesh,false);if(hits[0]&&hits[0].distance<nearest){nearest=hits[0].distance;found=i;}});
   if(!ready)for(let i=0;i<atlas.parts.length;i++){if(added[i]||data[i*4+3]<.5||(hasSolid&&atlas.parts[i].system==='integumentary'))continue;worldBox.copy(bounds[i]).translate(offset.set(data[i*4],data[i*4+1],data[i*4+2]));if(raycaster.ray.intersectBox(worldBox,hitPoint)&&hitPoint.distanceTo(raycaster.ray.origin)<nearest){pendingTap={ray:raycaster.ray.clone(),x,y,touch,camera:camera.matrixWorld.clone(),at};return 'held';}}
   const pinHit=publishedLayer.hit(raycaster);if(pinHit&&pinHit.distance<=nearest){pickPin.current(pinHit.object.userData.pinId);return 'answered';}
   if(found<0&&amount>.45)found=findTarget(x,y,touch?24:16);if(found>=0&&added[found]){hover.hidden=true;select.current(atlas.parts[found].id);return 'answered';}
   return 'missed';
  };
  function retryTap(){if(!pendingTap)return;const t=pendingTap;pendingTap=null;const waitMs=performance.now()-t.at;if(waitMs>HOLD_MS){loadingTap.current?.({result:'dropped',reason:'timeout',waitMs});return;}if(!t.camera.equals(camera.matrixWorld)){loadingTap.current?.({result:'dropped',reason:'moved',waitMs});return;}raycaster.ray.copy(t.ray);if(resolveTap(t.x,t.y,t.touch,t.at)!=='held')loadingTap.current?.({result:'resolved',waitMs});}
  const up=(e:PointerEvent)=>{
   const validTap=tap.up(e.pointerId,e.clientX,e.clientY);if(!validTap)return;
   if(pendingTap){loadingTap.current?.({result:'dropped',reason:'replaced',waitMs:performance.now()-pendingTap.at});pendingTap=null;}const loading=!ready;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   const result=resolveTap(e.clientX-rect.left,e.clientY-rect.top,e.pointerType==='touch');if(loading)loadingTap.current?.({result});
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  const clock=new T.Clock();let lastExtent=-1;
  // Smoothness, measured once per visit after loading: frames drawn on consecutive ticks (the model moving), however slow,
  // so a struggling phone still reports, and the time to draw each.
  let lastHover:string|null|undefined,lastLabels:string|undefined,lastBehind:boolean|undefined;
  let tick=0,lastDrawnTick=-2,lastDrawn=0,perfSent=false;const gaps:number[]=[],costs:number[]=[];const median=(a:number[])=>[...a].sort((x,y)=>x-y)[a.length>>1];
  const animate=()=>{
   if(disposed)return;frame=requestAnimationFrame(animate);tick++;const dt=Math.min(clock.getDelta(),.05),s=latest.current;
   // Theme first: the stage visibility below depends on it, and a frame drawn in between would stay on screen.
   if(shade.current!==staged)stage(shade.current);
   const changed=lastState?.visible!==s.visible||lastState?.selected!==s.selected||lastState?.isolate!==s.isolate||lastState?.neighbours!==s.neighbours;
   const moving=Math.abs(amount-s.explode)>.0001;
   if(moving){amount=T.MathUtils.damp(amount,s.explode,8,dt);dirty=true;}
   if(changed||moving||lastExtent<0){
    const visible=new Set(s.visible),selection=new Set(s.selected);
    // Focus: the nearest bones, muscles and organs around the structure stay as ghosts (vessels, nerves and skin run
    // the length of the body, so they are left out).
    const ghosts=new Set<number>();
    if(s.isolate&&s.neighbours!==false){const box=new T.Box3();atlas.parts.forEach((p,i)=>{if(selection.has(p.id))box.union(bounds[i]);});
     if(!box.isEmpty()){const size=box.getSize(new T.Vector3()),reach=box.clone().expandByScalar(Math.max(.03,.15*Math.max(size.x,size.y,size.z))),middle=box.getCenter(new T.Vector3());
      const volume=(b:T.Box3)=>{const v=b.getSize(new T.Vector3());return v.x*v.y*v.z;},own=Math.max(1e-9,volume(box));
      // Parts that wrap the structure (thigh muscles round the femur) would hide it, so they are left out.
      atlas.parts.map((p,i)=>({p,i})).filter(({p,i})=>!selection.has(p.id)&&!GHOSTLESS.has(p.system)&&reach.intersectsBox(bounds[i])&&!bounds[i].containsPoint(middle)&&volume(bounds[i].clone().intersect(box))/own<.4).sort((a,b)=>centers[a.i].distanceToSquared(middle)-centers[b.i].distanceToSquared(middle)).slice(0,30).forEach(({i})=>ghosts.add(i));}}
    const visibleParts=atlas.parts.filter(p=>s.isolate?selection.has(p.id):visible.has(p.system)||selection.has(p.id));
    const nextLayoutKey=visibleParts.map(p=>p.id).join(',')+':'+camera.aspect.toFixed(3);
    if(nextLayoutKey!==layoutKey){const layout=createExplosionLayout(visibleParts,camera.aspect);packingWidth=layout.width;packingHeight=layout.height;atlas.parts.forEach((p,i)=>{const cell=layout.cells.get(p.id);offsets[i]=cell?new T.Vector3(cell.x,cell.y+.85,0):centers[i].clone();});layoutKey=nextLayoutKey;if(amount>.05&&!s.isolate)fit(s.view,Math.max(0,(amount-.3)/.7));}

    atlas.parts.forEach((p,i)=>{
     const c=centers[i],destination=offsets[i];let dx=0,dy=0,dz=0;
     if(amount<=.45){const t=amount/.45;const group=SYSTEMS.findIndex(sys=>sys.id===p.system);const angle=group/SYSTEMS.length*Math.PI*2;dx=Math.sin(angle)*t*.48;dy=(c.y-.85)*t*.28;dz=Math.cos(angle)*t*.48;}
     else {const t=(amount-.45)/.55,group=SYSTEMS.findIndex(sys=>sys.id===p.system),angle=group/SYSTEMS.length*Math.PI*2;dx=T.MathUtils.lerp(Math.sin(angle)*.48,destination.x-c.x,t);dy=T.MathUtils.lerp((c.y-.85)*.28,destination.y-c.y,t);dz=T.MathUtils.lerp(Math.cos(angle)*.48,-c.z,t);}
     const selected=selection.has(p.id),ghost=ghosts.has(i);data.set([dx,dy,dz,(s.isolate?selected||ghost:visible.has(p.system)||selected)?1:0],i*4);selectedData[i*4]=selected&&!s.isolate?255:0;selectedData[i*4+1]=ghost?255:0;
     markerPositions.set(data[i*4+3]>.5?[c.x+dx,c.y+dy,c.z+dz]:[10000,10000,10000],i*3);const mesh=pickers[i];if(mesh){mesh.position.set(dx,dy,dz);mesh.updateMatrix();mesh.updateMatrixWorld(true);}
    });partTexture.needsUpdate=true;selectionTexture.needsUpdate=true;markerGeometry.attributes.position.needsUpdate=true;lastState=s;lastExtent=amount;dirty=true;
   }
   if(s.view!==lastView||s.reset!==lastReset){fit(s.view,amount,lastView&&!s.isolate?DURATION.view:0);lastView=s.view;lastReset=s.reset;}
   if(moving&&!s.isolate)fit(amount>.5?'front':s.view,Math.max(0,(amount-.3)/.7));
   const isolateKey=s.isolate?s.selected.join(',')+':'+s.reset+':'+s.inspectorOpen+':'+camera.aspect+':'+(s.frame??''):'';
   if(isolateKey!==lastIsolate||(s.isolate&&moving)){
    if(s.isolate){const box=new T.Box3();atlas.parts.forEach((p,i)=>{if(s.selected.includes(p.id))box.union(bounds[i].clone().translate(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])));});
     if(!box.isEmpty()){
      // Learn more: remember the body view to come back to, then frame the structure in the space the card leaves.
      const entering=!lastIsolate,sameSelection=lastIsolate.split(':')[0]===s.selected.join(',');if(entering)bodyShot=shot();
      const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());const w=el.clientWidth,h=el.clientHeight,{left,right,top,bottom}=freeArea(el);const availableWidth=Math.max(150,right-left),availableHeight=Math.max(40,bottom-top);
      const distance=Math.max(.07,Math.max(size.y*h/availableHeight,size.x*w/availableWidth/camera.aspect,size.z)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.35);controls.maxDistance=Math.max(40,distance*2);
      const dir=entering?camera.position.clone().sub(controls.target).normalize():new T.Vector3(.2,.1,1).normalize();if(entering){dir.y=T.MathUtils.clamp(dir.y,-.3,.45);dir.normalize();}else if(isoShot)dir.copy(isoShot.pos).sub(isoShot.target).normalize();
      isoShot={target:center,pos:center.clone().addScaledVector(dir,distance),off:[w/2-(left+right)/2,h/2-(top+bottom)/2]};
      // The card changed size (a tab, a detent): the camera reframes with it, quicker than a full move.
      if(!selectedPinRef.current){flyTo(isoShot,entering||!sameSelection?DURATION.focus:DURATION.reframe);if(entering)floatPending=true;}
     }
    }else if(lastIsolate){
     // Back to the body: the camera returns to the exact view that was left.
     if(bodyShot&&s.view===lastView)flyTo(bodyShot,DURATION.back);else fit(s.view,amount,DURATION.back);bodyShot=null;isoShot=null;
    }
    lastIsolate=isolateKey;
   }
   controls.enableRotate=amount<.8;controls.mouseButtons.LEFT=amount<.8?T.MOUSE.ROTATE:T.MOUSE.PAN;controls.touches.ONE=amount<.8?T.TOUCH.ROTATE:T.TOUCH.PAN;const onStage=amount<.5&&!s.isolate,floorOn=false,contactOn=onStage;if(ground.visible!==floorOn||ring.visible!==onStage||contact.visible!==contactOn)dirty=true;ground.visible=platform.visible=floorOn;ring.visible=innerRing.visible=false;contact.visible=contactOn;markers.visible=amount>.75;stepFly(dt);applyFloat();controls.autoRotate=s.rotate&&!s.isolate&&amount<.4;controls.autoRotateSpeed=.65;controls.update();if(controls.autoRotate)dirty=true;
   if(lamp.current!==placedLight){placedLight=lamp.current;dirty=true;}
   const pinHost=s.isolate&&s.selected.length===1?pickers[atlas.parts.findIndex(p=>p.id===s.selected[0])]:undefined;
   if(lastPins!==published.current||lastPin!==selectedPinRef.current){
    const sel=selectedPinRef.current;
    if(published.current!==lastPins)publishedLayer.delay=fly?(1-fly.t)*fly.dur*.75:0;
    // A feature: the camera turns to face its pin and comes 1.5x closer; pin to pin it glides; closing returns to the structure.
    if(lastPin!==sel&&s.isolate&&pinHost){publishedLayer.set(published.current,pinHost.geometry??null);publishedLayer.group.position.copy(pinHost.position);
     if(sel){const f=publishedLayer.facing(sel);if(f&&isoShot){const d=isoShot.pos.distanceTo(isoShot.target),n=f.normal.clone();n.y=T.MathUtils.clamp(n.y,-.5,.5);const dir=camera.position.clone().sub(controls.target).normalize().lerp(n.normalize(),.75).normalize(),target=f.point.clone().lerp(isoShot.target,.35);
      flyTo({target,pos:target.clone().addScaledVector(dir,d/1.5),off:isoShot.off},lastPin?DURATION.next:DURATION.feature);}}
     else if(isoShot)flyTo(isoShot,DURATION.feature);}
    lastPins=published.current;lastPin=sel;dirty=true;}
   publishedLayer.group.visible=!!pinHost&&published.current.length>0;publishedLayer.set(published.current,pinHost?.geometry??null);
   // Display toggles take effect at once, before this frame's labels and pins are placed.
   if(lastHover!==s.hoverPin||lastLabels!==s.labels||lastBehind!==s.behind){lastHover=s.hoverPin;lastLabels=s.labels;lastBehind=s.behind;dirty=true;}
   let popping=false;
   if(dirty&&pinHost)popping=publishedLayer.update(camera,el.clientHeight,pinHost.position,selectedPinRef.current,shade.current,s.behind??true);
   const labelled=!!pinHost&&published.current.length>0;
   labels.set(labelled?published.current.map(p=>({id:p.id,label:p.label})):[]);
   if(dirty&&labelled)labels.update(publishedLayer.points(),camera,el.clientWidth,el.clientHeight,{selected:selectedPinRef.current,mode:s.labels??'full',behind:s.behind??true,hover:s.hoverPin??null,delay:publishedLayer.delay+.16});
   if(dirty){placeLights();const drawStart=performance.now();renderer.render(scene,camera);
    if(ready&&!perfSent){if(lastDrawnTick===tick-1){gaps.push(drawStart-lastDrawn);costs.push(performance.now()-drawStart);}lastDrawn=drawStart;lastDrawnTick=tick;if(gaps.length>=60){perfSent=true;perf.current?.({frameMs:median(gaps),renderMs:median(costs)});}}
    targets=[];if(amount>.45){const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);atlas.parts.forEach((p,i)=>{if(data[i*4+3]<.5||(hasSolid&&p.system==='integumentary'))return;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(let corner=0;corner<8;corner++){projected.set(p.bounds[(corner&1)?1:0][0]+data[i*4],p.bounds[(corner&2)?1:0][1]+data[i*4+1],p.bounds[(corner&4)?1:0][2]+data[i*4+2]).project(camera);const x=(projected.x+1)*el.clientWidth/2,y=(1-projected.y)*el.clientHeight/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}projected.copy(centers[i]).add(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])).project(camera);if(projected.z< -1||projected.z>1)return;targets.push({index:i,x:(projected.x+1)*el.clientWidth/2,y:(1-projected.y)*el.clientHeight/2,left,right,top,bottom});});}dirty=false;}
   if(popping)dirty=true;
  };animate();
  const contextLost=(e:Event)=>{e.preventDefault();onError('The 3D session was paused by your device. Reload to continue.');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();publishedLayer.group.removeFromParent();publishedLayer.dispose();controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.traverse(o=>{if(o instanceof T.Mesh&&!geometries.includes(o.geometry)){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});env.dispose();shadowTexture.dispose();partTexture.dispose();selectionTexture.dispose();markerGeometry.dispose();markerMaterial.dispose();hover.remove();labels.dispose();for(const type of ['pointerdown','keydown','wheel'])removeEventListener(type,stopFloat,{capture:true});renderer.dispose();renderer.domElement.remove();};
 },[atlas]);
 return <div className="scene" ref={host}/>;
}
