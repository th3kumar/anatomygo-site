/**
 * Feature shapes. A pin marks one spot, but many features are a line (a ridge, border or lip) or an area (a fossa,
 * surface, joint facet or muscle attachment). A pin can carry an optional shape: lines and ovals anchored on the
 * structure's triangles exactly like the pin itself, drawn as a soft tint on the surface. The pin stays the label.
 *
 * Shared by the explorer (app/) and the Playground (playground/), which use different three.js versions, so this file
 * has no three.js import: it validates the data, packs it into plain arrays and holds the shader text.
 * The format matches Muscle Studio's shapes (playground/src/studio/model.ts on feature/muscle-studio).
 */
export interface ShapeAnchor {triangle:number;u:number;v:number}
/** rx, ry: half-axes in mm. angle: degrees (0-180) in the surface frame, 0 = model +Y projected on the surface (+Z where the surface faces up or down). */
export interface ShapeOval {type:'oval';at:ShapeAnchor;rx:number;ry:number;angle:number}
/** A polyline along the surface; width in mm. */
export interface ShapeLine {type:'line';points:ShapeAnchor[];width:number}
export type ShapePart=ShapeOval|ShapeLine;
/** feature = a bone or structure feature (amber, which stands out on the teal of a selected structure); origin / insertion = a muscle attachment (red / blue). */
export type ShapeRole='feature'|'origin'|'insertion';
export interface FeatureShape {v:1;role:ShapeRole;shapes:ShapePart[]}

/** The shader draws at most this many primitives (one per oval, one per line segment). */
export const MAX_PRIMITIVES=64;
export const LIMITS={parts:16,linePoints:64,radius:[0.5,60],width:[0.5,20]} as const;

export const SHAPE_COLOURS:Record<'light'|'dark',Record<ShapeRole,string>>={
 light:{feature:'#d97706',origin:'#e34948',insertion:'#2a78d6'},
 dark:{feature:'#fbbf24',origin:'#e66767',insertion:'#3987e5'},
};

/** '#rrggbb' as 0-1 floats, used as-is by the shader (no colour-space conversion, so it matches the CSS colour). */
export function hexToRgb(hex:string):[number,number,number]{const n=parseInt(hex.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}

const isNum=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const inRange=(x:unknown,[lo,hi]:readonly [number,number]):x is number=>isNum(x)&&x>=lo&&x<=hi;
function anchorOk(a:unknown,triangleCount?:number):a is ShapeAnchor{
 const p=a as ShapeAnchor;
 return !!p&&Number.isInteger(p.triangle)&&p.triangle>=0&&(triangleCount===undefined||p.triangle<triangleCount)&&isNum(p.u)&&isNum(p.v)&&p.u>=0&&p.v>=0&&p.u+p.v<=1+1e-9;
}
export function primitiveCount(shape:FeatureShape){return shape.shapes.reduce((n,s)=>n+(s.type==='oval'?1:Math.max(1,s.points.length-1)),0);}

/** The shape if it is well formed, else null (so a bad shape falls back to a plain pin instead of breaking the view). */
export function parseFeatureShape(value:unknown,triangleCount?:number):FeatureShape|null{
 const s=value as FeatureShape;
 if(!s||typeof s!=='object'||s.v!==1||!['feature','origin','insertion'].includes(s.role)||!Array.isArray(s.shapes)||!s.shapes.length||s.shapes.length>LIMITS.parts)return null;
 for(const part of s.shapes){
  if(part?.type==='oval'){if(!anchorOk(part.at,triangleCount)||!inRange(part.rx,LIMITS.radius)||!inRange(part.ry,LIMITS.radius)||!inRange(part.angle,[0,180]))return null;}
  else if(part?.type==='line'){if(!Array.isArray(part.points)||part.points.length<2||part.points.length>LIMITS.linePoints||!part.points.every(a=>anchorOk(a,triangleCount))||!inRange(part.width,LIMITS.width))return null;}
  else return null;
 }
 return primitiveCount(s)<=MAX_PRIMITIVES?s:null;
}

type V3=[number,number,number];
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:V3):V3=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
function corner(positions:ArrayLike<number>,indices:ArrayLike<number>,t:number,k:number):V3{const i=indices[t*3+k]*3;return [positions[i],positions[i+1],positions[i+2]];}
/** Point and winding normal of an anchor, or null when the triangle is outside this mesh. */
export function resolveAnchor(positions:ArrayLike<number>,indices:ArrayLike<number>,a:ShapeAnchor):{point:V3;normal:V3}|null{
 if(a.triangle*3+2>=indices.length)return null;
 const A=corner(positions,indices,a.triangle,0),B=corner(positions,indices,a.triangle,1),C=corner(positions,indices,a.triangle,2),w=1-a.u-a.v;
 return {point:[A[0]*w+B[0]*a.u+C[0]*a.v,A[1]*w+B[1]*a.u+C[1]*a.v,A[2]*w+B[2]*a.u+C[2]*a.v],normal:norm(cross(sub(B,A),sub(C,A)))};
}
/** The oval's long axis on the surface: model +Y projected on the surface (or +Z where it faces up or down), turned by `angle`. */
export function majorAxis(n:V3,angleDeg:number):V3{
 const ref:V3=Math.abs(n[1])<0.9?[0,1,0]:[0,0,1],d=dot(ref,n),u=norm([ref[0]-d*n[0],ref[1]-d*n[1],ref[2]-d*n[2]]),v=cross(n,u),t=angleDeg*Math.PI/180;
 return norm([u[0]*Math.cos(t)+v[0]*Math.sin(t),u[1]*Math.cos(t)+v[1]*Math.sin(t),u[2]*Math.cos(t)+v[2]*Math.sin(t)]);
}

/** Uniform data for the shader: per primitive three vec4s.
 * Oval: p0 = (centre, 0), p1 = (long axis, rx m), p2 = (normal, ry m). Segment: p0 = (a, 1), p1 = (b, 0), p2 = (0, 0, 0, half width m). */
export interface PackedShape {count:number;p0:Float32Array;p1:Float32Array;p2:Float32Array}
export function emptyPacked():PackedShape{return {count:0,p0:new Float32Array(MAX_PRIMITIVES*4),p1:new Float32Array(MAX_PRIMITIVES*4),p2:new Float32Array(MAX_PRIMITIVES*4)};}
export function packFeatureShape(positions:ArrayLike<number>,indices:ArrayLike<number>,shape:FeatureShape|null,out=emptyPacked()):PackedShape{
 out.count=0;if(!shape)return out;
 const put=(a:number[],b:number[],c:number[])=>{if(out.count>=MAX_PRIMITIVES)return;const o=out.count*4;out.p0.set(a,o);out.p1.set(b,o);out.p2.set(c,o);out.count++;};
 for(const s of shape.shapes){
  if(s.type==='oval'){const r=resolveAnchor(positions,indices,s.at);if(!r)continue;const m=majorAxis(r.normal,s.angle);put([...r.point,0],[...m,s.rx/1000],[...r.normal,s.ry/1000]);}
  else{const pts=s.points.map(a=>resolveAnchor(positions,indices,a)?.point).filter((p):p is V3=>!!p),half=s.width/2000;
   for(let k=0;k<pts.length-1;k++)put([...pts[k],1],[...pts[k+1],0],[0,0,0,half]);}
 }
 return out;
}

export const SHAPE_VERTEX=`
varying vec3 vShapePos;
varying vec3 vShapeNormal;
void main(){
 vShapePos=position;
 vShapeNormal=normal;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
/** Colours the covered surface with a soft edge and a light rim; everything else is discarded, so the lit bone shows through. */
export const SHAPE_FRAGMENT=`
#define MAX_PRIMITIVES ${MAX_PRIMITIVES}
varying vec3 vShapePos;
varying vec3 vShapeNormal;
uniform int uCount;
uniform vec4 uP0[MAX_PRIMITIVES];
uniform vec4 uP1[MAX_PRIMITIVES];
uniform vec4 uP2[MAX_PRIMITIVES];
uniform vec3 uColour;
uniform float uStrength;
void main(){
 vec3 pn=normalize(vShapeNormal);
 float best=1e9;
 float soft=0.08;
 for(int i=0;i<MAX_PRIMITIVES;i++){
  if(i>=uCount)break;
  vec4 a=uP0[i];vec4 b=uP1[i];vec4 c=uP2[i];
  float e;
  if(a.w<0.5){
   vec3 d=vShapePos-a.xyz;
   if(abs(dot(d,c.xyz))>max(b.w,c.w)||dot(pn,c.xyz)<0.15)continue;
   vec3 minor=cross(c.xyz,b.xyz);
   e=length(vec2(dot(d,b.xyz)/b.w,dot(d,minor)/c.w));
   soft=min(soft,0.0006/min(b.w,c.w)+0.04);
  }else{
   vec3 ab=b.xyz-a.xyz;
   float t=clamp(dot(vShapePos-a.xyz,ab)/max(dot(ab,ab),1e-12),0.0,1.0);
   e=length(vShapePos-(a.xyz+t*ab))/c.w;
   soft=min(soft,0.0006/c.w+0.04);
  }
  best=min(best,e);
 }
 float cover=1.0-smoothstep(1.0-soft,1.0,best);
 if(cover<=0.001)discard;
 float rim=smoothstep(0.72,0.9,best)*cover;
 gl_FragColor=vec4(mix(uColour,vec3(1.0),rim*0.35),cover*mix(uStrength,min(1.0,uStrength+0.25),rim));
}`;
