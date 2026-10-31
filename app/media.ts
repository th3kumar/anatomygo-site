/** Layout queries, read synchronously so the first render already has the right layout (no desktop flash on phones).
 * Phone layout: narrow screens, and phones held sideways (too short for the desktop panels). Keep in step with ui.css. */
import {useSyncExternalStore} from 'react';

/** The phone layout (bottom sheet and bottom controls): phones, phones on their side, and upright tablets up to 1023 px wide. */
export const PHONE='(max-width: 767px), (max-height: 600px) and (orientation: landscape), (max-width: 1023px) and (orientation: portrait)';
/** Phones held sideways: the phone layout, with the view pill along the top. */
export const LANDSCAPE='(max-height: 600px) and (orientation: landscape)';
export const COARSE='(pointer: coarse)';

const lists=new Map<string,MediaQueryList>();
const list=(q:string)=>{let l=lists.get(q);if(!l){l=matchMedia(q);lists.set(q,l);}return l;};
export function useMedia(query:string){
 return useSyncExternalStore(cb=>{const l=list(query);l.addEventListener('change',cb);return()=>l.removeEventListener('change',cb);},()=>list(query).matches);
}
