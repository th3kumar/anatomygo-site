/** Motion tokens from the handoff films (docs/revamp/plan.md §3): springs as stiffness/damping with mass 1, and cubic
 * eases. Every animation reads from here, in one of three forms: `spring.*`/`tween.*` for the motion library,
 * `springAt`/`ease` for code that animates per frame (the 3D camera, pins), and `css.*` for plain CSS transitions. */

type Spring={stiffness:number,damping:number};
export const SPRINGS={
 /** Tab indicator, pin and label pops, toggles. */
 snappy:{stiffness:520,damping:38},
 /** Card resize and morph, dialogs. */
 card:{stiffness:260,damping:28},
 /** Phone sheet detents, search open and close. */
 sheet:{stiffness:300,damping:30},
 /** Swipe commits, nudges coming to rest. */
 settle:{stiffness:200,damping:26},
 /** A pin dropped on the model: one small bounce. */
 drop:{stiffness:520,damping:30},
} satisfies Record<string,Spring>;
export type SpringName=keyof typeof SPRINGS;

const BEZIER={cam:[.65,0,.35,1],out:[.22,1,.36,1],in:[.4,0,1,1],io:[.45,0,.2,1]} as const;
export type EaseName=keyof typeof BEZIER;

/** Seconds. Leaving is quicker than arriving; arrivals start a beat after the leave. */
export const DUR={leave:.14,enter:.22,enterDelay:.05,stagger:.03,chromeStagger:.04,camera:.9,cameraShort:.5,cameraBack:.85,theme:.75};

/** For the motion library: `transition={spring.card}`. */
export const spring=Object.fromEntries(Object.entries(SPRINGS).map(([k,s])=>[k,{type:'spring',mass:1,...s}])) as Record<SpringName,{type:'spring',mass:number}&Spring>;
export const tween=(name:EaseName,duration:number,delay=0)=>({type:'tween' as const,ease:[...BEZIER[name]] as [number,number,number,number],duration,delay});

/** Position of a spring released from 0 towards 1, after t seconds (the films' own formula). */
export function springAt(name:SpringName,t:number){
 const {stiffness:k,damping:c}=SPRINGS[name],w0=Math.sqrt(k),z=c/(2*w0),wd=w0*Math.sqrt(Math.max(1e-6,1-z*z));
 return t<=0?0:1-Math.exp(-z*w0*t)*(Math.cos(wd*t)+(z*w0/wd)*Math.sin(wd*t));
}
/** How long a spring takes to come within 0.1% of rest, in seconds. */
export function springDuration(name:SpringName){let t=0;for(;t<3;t+=1/120){if(Math.abs(1-springAt(name,t))<.001&&Math.abs(1-springAt(name,t+.05))<.001)break;}return t;}

function bezier(x1:number,y1:number,x2:number,y2:number){
 return (x:number)=>{
  if(x<=0)return 0;if(x>=1)return 1;
  let u=x;
  for(let i=0;i<10;i++){
   const f=3*x1*u*(1-u)*(1-u)+3*x2*u*u*(1-u)+u*u*u-x,d=3*x1*(1-u)*(1-u)+6*(x2-x1)*u*(1-u)+3*(1-x2)*u*u;
   if(Math.abs(d)<1e-6)break;u=Math.min(1,Math.max(0,u-f/d));
  }
  return 3*y1*u*(1-u)*(1-u)+3*y2*u*u*(1-u)+u*u*u;
 };
}
export const ease=Object.fromEntries(Object.entries(BEZIER).map(([k,b])=>[k,bezier(b[0],b[1],b[2],b[3])])) as Record<EaseName,(x:number)=>number>;

/** CSS forms: `transition: transform ${css.spring('card')}`. A spring becomes a linear() curve over its own duration. */
const linear=(name:SpringName)=>{const d=springDuration(name),n=40;return `${Math.round(d*1000)}ms linear(${Array.from({length:n+1},(_,i)=>+springAt(name,d*i/n).toFixed(4)).join(',')})`;};
const cache=new Map<SpringName,string>();
export const css={
 spring:(name:SpringName)=>{let v=cache.get(name);if(!v){v=linear(name);cache.set(name,v);}return v;},
 ease:(name:EaseName)=>`cubic-bezier(${BEZIER[name].join(',')})`,
};

/** Publishes each spring as a CSS variable (`--spring-card: 520ms linear(…)`), so stylesheets can use the same curves:
 * `transition: translate var(--spring-card)`. Called once at start. */
export function installCssSprings(root=document.documentElement){
 for(const name of Object.keys(SPRINGS) as SpringName[])root.style.setProperty(`--spring-${name}`,css.spring(name));
}

/** True when the visitor asked for less motion: springs become short fades and the camera cuts. */
export const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
