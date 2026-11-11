/** A tab left open keeps running the code it loaded: some stay open for a week (BigQuery, 2-10 Nov 2026) and miss
 * every release in between. Each build writes its id to /version.json (vite.config.ts); an open tab reads that file
 * now and then, and once a newer build has been live long enough to be served everywhere, the page offers a reload.
 * The reload keeps the visitor's place (app/place.ts). */
import {useEffect,useState} from 'react';

const BUILD:string=import.meta.env.VITE_BUILD??'';
const EVERY=30*60_000;
// GitHub Pages lets browsers and its own edge keep a page for 10 minutes, so a reload sooner than that after a release
// could bring the old page back. The offer waits until the new build has been seen for longer.
const SETTLED=11*60_000;
// The build a reload was already asked for in this tab: if the old page came back all the same, it isn't offered again.
const TRIED='anatomygo.update.tried';

/** The id of a newer build that is ready to load, or null. `preview` shows the offer at once (local development). */
export function useNewVersion(preview=false):string|null{
 const [ready,setReady]=useState<string|null>(preview?'preview':null);
 useEffect(()=>{
  if(preview||import.meta.env.DEV||!BUILD)return;
  let seen:{build:string;at:number}|null=null,last=Date.now(),timer=0,stopped=false;
  const check=async()=>{
   last=Date.now();
   try{
    const r=await fetch(`/version.json?${last}`,{cache:'no-store'});if(!r.ok)return;
    const build=(await r.json() as {build?:unknown}).build;
    if(stopped||typeof build!=='string'||!build||build===BUILD){seen=null;return;}
    let tried='';try{tried=sessionStorage.getItem(TRIED)??'';}catch{}
    if(tried===build)return;
    if(seen?.build!==build){seen={build,at:last};clearTimeout(timer);timer=window.setTimeout(check,SETTLED);return;}
    if(last-seen.at>=SETTLED-1000)setReady(build);
   }catch{/* offline, or not JSON: try again later */}
  };
  const every=window.setInterval(()=>{if(document.visibilityState==='visible')void check();},EVERY);
  // Coming back to the tab is when a new version matters, so it is checked then too (at most every five minutes).
  const back=()=>{if(document.visibilityState==='visible'&&Date.now()-last>5*60_000)void check();};
  document.addEventListener('visibilitychange',back);
  return()=>{stopped=true;clearInterval(every);clearTimeout(timer);document.removeEventListener('visibilitychange',back);};
 },[preview]);
 return ready;
}

/** Loads the new build. The build asked for is remembered, so a stale copy of the page can't start a loop of offers. */
export function loadNewVersion(build:string){try{sessionStorage.setItem(TRIED,build);}catch{}location.reload();}
