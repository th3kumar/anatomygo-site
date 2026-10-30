import * as T from 'three';

/** A depth-of-field style blur for the focus move (Learn more and Back): the scene is drawn into a buffer, blurred at
 * half size and composited, then the focused structure is drawn sharp on top. It runs only while the camera moves, so a
 * still view costs nothing. The buffer holds linear, premultiplied colour; tone mapping and the sRGB conversion happen
 * in the composite, exactly as when drawing straight to the screen, so frames before and after match. */
const VERTEX='varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
const BLUR=`uniform sampler2D tSource; uniform vec2 uStep; varying vec2 vUv;
void main(){
 // 9 taps of a gaussian along one axis; uStep is the distance between taps in UV.
 vec4 c=texture2D(tSource,vUv)*.2270270270;
 c+=(texture2D(tSource,vUv+uStep)+texture2D(tSource,vUv-uStep))*.1945945946;
 c+=(texture2D(tSource,vUv+uStep*2.)+texture2D(tSource,vUv-uStep*2.))*.1216216216;
 c+=(texture2D(tSource,vUv+uStep*3.)+texture2D(tSource,vUv-uStep*3.))*.0540540541;
 c+=(texture2D(tSource,vUv+uStep*4.)+texture2D(tSource,vUv-uStep*4.))*.0162162162;
 gl_FragColor=c;
}`;
const COMPOSITE=`uniform sampler2D tSharp; uniform sampler2D tBlur; uniform float uMix; varying vec2 vUv;
void main(){
 vec4 c=mix(texture2D(tSharp,vUv),texture2D(tBlur,vUv),uMix);
 // Straight colour for tone mapping, then premultiplied again for the transparent canvas.
 gl_FragColor=vec4(c.a>.0001?c.rgb/c.a:vec3(0.),c.a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 gl_FragColor.rgb*=gl_FragColor.a;
}`;

export class FocusBlur {
 /** Off after a slow transition, so a struggling device keeps its frame rate instead. */
 enabled=true;
 private sharp:T.WebGLRenderTarget;private a:T.WebGLRenderTarget;private b:T.WebGLRenderTarget;
 private quad:T.Mesh;private camera=new T.OrthographicCamera(-1,1,1,-1,0,1);private scene=new T.Scene();
 private blur:T.ShaderMaterial;private composite:T.ShaderMaterial;
 constructor(private renderer:T.WebGLRenderer,private light:()=>boolean){
  const options={type:T.HalfFloatType,depthBuffer:false};
  this.sharp=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:light()?0:4});
  this.a=new T.WebGLRenderTarget(1,1,options);this.b=new T.WebGLRenderTarget(1,1,options);
  this.blur=new T.ShaderMaterial({vertexShader:VERTEX,fragmentShader:BLUR,uniforms:{tSource:{value:null},uStep:{value:new T.Vector2()}},depthTest:false,depthWrite:false});
  this.composite=new T.ShaderMaterial({vertexShader:VERTEX,fragmentShader:COMPOSITE,uniforms:{tSharp:{value:null},tBlur:{value:null},uMix:{value:0}},depthTest:false,depthWrite:false,transparent:true,
   blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor,toneMapped:true});
  this.quad=new T.Mesh(new T.PlaneGeometry(2,2),this.blur);this.quad.frustumCulled=false;this.scene.add(this.quad);
 }
 private size(){
  const v=this.renderer.getDrawingBufferSize(new T.Vector2()),w=Math.max(1,v.x),h=Math.max(1,v.y);
  if(this.sharp.width!==w||this.sharp.height!==h){this.sharp.setSize(w,h);this.a.setSize(Math.max(1,w>>1),Math.max(1,h>>1));this.b.setSize(Math.max(1,w>>1),Math.max(1,h>>1));}
 }
 /** Draws one frame with the surroundings blurred by `amount` (0–1), then `sharp()` draws the subject on top. */
 render(scene:T.Scene,camera:T.Camera,amount:number,sharp:()=>void){
  const r=this.renderer,clear=r.getClearAlpha(),auto=r.autoClear;this.size();
  r.setRenderTarget(this.sharp);r.setClearAlpha(0);r.clear();r.render(scene,camera);
  // Two passes at half size; phones blur a little less.
  const radius=amount*(this.light()?1.5:2.5);
  this.quad.material=this.blur;
  this.blur.uniforms.tSource.value=this.sharp.texture;this.blur.uniforms.uStep.value.set(radius/this.a.width,0);r.setRenderTarget(this.a);r.render(this.scene,this.camera);
  this.blur.uniforms.tSource.value=this.a.texture;this.blur.uniforms.uStep.value.set(0,radius/this.a.height);r.setRenderTarget(this.b);r.render(this.scene,this.camera);
  // At the very start and end the half-size buffer would soften the picture, so the sharp frame is mixed back in.
  this.quad.material=this.composite;this.composite.uniforms.tSharp.value=this.sharp.texture;this.composite.uniforms.tBlur.value=this.b.texture;this.composite.uniforms.uMix.value=Math.min(1,amount*4);
  r.setRenderTarget(null);r.setClearAlpha(clear);r.clear();r.render(this.scene,this.camera);
  r.autoClear=false;r.clearDepth();sharp();r.autoClear=auto;
 }
 /** Compiles the shaders and allocates the buffers ahead of time, so the first Learn more doesn't stall on them. */
 warm(scene:T.Scene,camera:T.Camera){
  const r=this.renderer;this.size();r.compile(scene,camera);
  for(const m of [this.blur,this.composite]){this.quad.material=m;r.compile(this.scene,this.camera);}
  for(const t of [this.sharp,this.a,this.b]){r.setRenderTarget(t);r.clear();}r.setRenderTarget(null);
 }
 dispose(){this.sharp.dispose();this.a.dispose();this.b.dispose();this.blur.dispose();this.composite.dispose();this.quad.geometry.dispose();}
}
