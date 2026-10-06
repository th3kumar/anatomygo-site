/** Light or dark appearance, as in the Android app: follow the system (default), or a saved choice. The
 * `dark` class on <html> drives app/dark.css and the UI kit's dark: variants; public/theme.js applies it
 * before the first paint. */
import {useSyncExternalStore} from 'react';

export type Appearance='system'|'light'|'dark';
const KEY='anatomygo.appearance',media=matchMedia('(prefers-color-scheme: dark)'),listeners=new Set<()=>void>(),root=document.documentElement;

export function appearance():Appearance{try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'system';}catch{return 'system';}}
export const isDark=(a:Appearance)=>a==='dark'||(a==='system'&&media.matches);

function apply(){
 const dark=isDark(appearance());
 root.classList.toggle('dark',dark);root.style.colorScheme=dark?'dark':'only light';
 document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#1d1f23':'#f3f4f4');
 listeners.forEach(l=>l());
}
media.addEventListener('change',apply);
// Whatever sets the class (theme.js before paint, apply() later), everything that draws follows it.
new MutationObserver(()=>listeners.forEach(l=>l())).observe(root,{attributes:true,attributeFilter:['class']});
apply();

export function setAppearance(a:Appearance){
 try{if(a==='system')localStorage.removeItem(KEY);else localStorage.setItem(KEY,a);}catch{}
 apply();
}

const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
/** The saved choice, and whether the page is dark right now: read from <html>, so the 3D stage can never
 * disagree with the stylesheet. */
export function useAppearance():{choice:Appearance,dark:boolean}{
 const choice=useSyncExternalStore(subscribe,appearance),dark=useSyncExternalStore(subscribe,()=>root.classList.contains('dark'));
 return {choice,dark};
}
