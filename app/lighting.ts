/** A key light that follows the camera, placed on a pad as in the Android app (LightDirection.kt): x runs
 * left to right and y top to bottom, both 0–1. The default reproduces the atlas's original world-fixed key
 * light as seen from the default three-quarter view, so the first look is unchanged. */
export type Light={x:number,y:number};
export const DEFAULT_LIGHT:Light={x:.1993,y:.0957};
/** The original rim light from the default view, kept behind the anatomy relative to the camera. */
export const RIM_DIRECTION:[number,number,number]=[.6982,.5141,-.4982];

/** Light balance, after the Android app's shader (key 1.15, fill 0.22, rim 0.75, ambient 0.16–0.5), in three.js's
 * physical units (the app's factors × π), tuned by eye on the emulator. The key light dominates, so the side facing away from it falls into
 * shade the way it would under one studio light; ambient and the studio reflections only lift the shadows. */
export const RIG={key:4.4,fill:.4,rim:2.1,hemisphere:.42,environment:.08,exposure:1};
/** The app's fill, front right of the camera, so shadows never go flat black. */
export const FILL_DIRECTION:[number,number,number]=[.7,.15,.9];

const unit=(n:number)=>Number.isFinite(n)?Math.min(1,Math.max(0,n)):.5;
export const isDefaultLight=(l:Light)=>l.x===DEFAULT_LIGHT.x&&l.y===DEFAULT_LIGHT.y;
export const movedLight=(x:number,y:number):Light=>({x:unit(x),y:unit(y)});

/** Camera-space direction toward the light: +x right, +y up, +z toward the viewer. */
export function lightDirection(l:Light):[number,number,number]{
 const h=(unit(l.x)-.5)*4,v=(.5-unit(l.y))*4,length=Math.hypot(h,v,1);
 return [h/length,v/length,1/length];
}
