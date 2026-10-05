/** The page a shared view opens for people without the app: https://anatomygo.in/v/#1.<payload>.
 *
 * Mirrors ShareCodec.decode in the Android app (SharedView.kt): `<version>.<base64url(zlib(json))>`, the same
 * size limits, and typed validation. Links sit in chats indefinitely, so version 1 must keep decoding. Pin text
 * is only ever inserted with textContent.
 */
import {startAnalytics,track,bucket,statsEnabled,setStatsEnabled} from '../../app/analytics';
import {PLAY_PUBLIC,playUrl} from '../../app/play';

const PACKAGE='com.anatomygo';
const PLAY=playUrl('share_view');
const MAX_INFLATED=65536;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;

type Pin={label:string,notes:string};
type View={id:string,title:string,isolated:boolean,quiz:boolean,pins:Pin[]};
class LinkError extends Error{}

// Before anything reads the link: every hit reports this page as /v/, without the query or the fragment.
startAnalytics(location.origin+'/v/','Shared view · AnatomyGo');

function payload(){return location.hash.slice(1)||new URLSearchParams(location.search).get('d')||'';}
function text(value:unknown,max:number,optional=false):string{
 if(value===undefined||value===null){if(optional)return '';throw new LinkError('invalid');}
 if(typeof value!=='string'||value.length>max)throw new LinkError('invalid');
 return value;
}

async function decode(p:string):Promise<View>{
 const dot=p.indexOf('.');
 const version=dot>0?Number(p.slice(0,dot)):NaN;
 if(!Number.isInteger(version))throw new LinkError('invalid');
 if(version>1)throw new LinkError('newer');
 if(version!==1)throw new LinkError('invalid');
 let b64=p.slice(dot+1).replace(/-/g,'+').replace(/_/g,'/');
 while(b64.length%4)b64+='=';
 let bytes:Uint8Array;
 try{bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}catch{throw new LinkError('invalid');}
 const reader=new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.length;
   if(size>MAX_INFLATED)throw new LinkError('invalid');
   chunks.push(value);
  }
 }catch{throw new LinkError('invalid');}
 const all=new Uint8Array(size);let at=0;
 for(const c of chunks){all.set(c,at);at+=c.length;}
 let json:any;
 try{json=JSON.parse(new TextDecoder().decode(all));}catch{throw new LinkError('invalid');}
 if(!json||typeof json!=='object'||Array.isArray(json))throw new LinkError('invalid');
 const pins=json.p===undefined?[]:json.p;
 if(!Array.isArray(pins)||pins.length>100)throw new LinkError('invalid');
 return {
  // Only a well-formed atlas ID goes into the 3D link; anything else opens the whole body.
  id:typeof json.i==='string'&&/^(FMA|FJ)\d{1,9}$/.test(json.i)?json.i:'',
  title:text(json.t,200,true),
  isolated:json.s===1,
  quiz:json.q===1&&pins.length>0,
  pins:pins.map((pin:any)=>{
   if(!pin||typeof pin!=='object')throw new LinkError('invalid');
   const label=text(pin.l,256);
   if(!label.trim())throw new LinkError('invalid');
   return {label,notes:text(pin.n,4000,true)};
  }),
 };
}

function show(view:View){
 const title=view.title?view.title.charAt(0).toUpperCase()+view.title.slice(1):'A shared view';
 $('title').textContent=title;
 document.title=`${title} · AnatomyGo`;
 const n=view.pins.length;
 $('kind').textContent=n===0?'SHARED STRUCTURE':view.quiz?'QUIZ':'STUDY PINS';
 $('summary').textContent=n===0?'Shared with you from AnatomyGo.'
  :view.quiz?`Name the ${n} numbered ${n===1?'structure':'structures'} in the picture, then reveal the answers.`
  :`${n} study ${n===1?'pin':'pins'} shared with you. The numbers match the picture in your chat.`;
 const reveals:(()=>void)[]=[];
 view.pins.forEach((pin,i)=>{
  const li=document.createElement('li');
  const number=document.createElement('div');
  number.className='number';number.textContent=String(i+1);
  const body=document.createElement('div');
  body.className='pin';
  const label=document.createElement('div');
  label.className='label';label.textContent=pin.label;
  body.appendChild(label);
  if(pin.notes){
   const notes=document.createElement('div');
   notes.className='notes';notes.textContent=pin.notes;
   body.appendChild(notes);
  }
  if(view.quiz){
   body.hidden=true;
   const button=document.createElement('button');
   button.className='reveal';button.textContent='Tap to reveal';
   const reveal=()=>{button.remove();body.hidden=false;};
   button.addEventListener('click',()=>{reveal();track('shared_pin_revealed',{all:0});});
   reveals.push(reveal);
   li.appendChild(number);li.appendChild(button);li.appendChild(body);
  }else{li.appendChild(number);li.appendChild(body);}
  $('pins').appendChild(li);
 });
 if(view.quiz){
  $('reveal-all').hidden=false;
  $('reveal-all').addEventListener('click',()=>{reveals.forEach(r=>r());$('reveal-all').hidden=true;track('shared_pin_revealed',{all:1});});
 }
 $('disclaimer').hidden=n===0;
 $('view').hidden=false;
 $<HTMLAnchorElement>('explore').href=view.id?`/?structure=${view.id}${view.isolated?'&isolate=1':''}`:'/';
}

function problem(kind:string){
 $('open').hidden=true; // The app could only report the same problem.
 $('problem-detail').textContent=kind==='newer'
  ?'It was made with a newer version of AnatomyGo. Update the app, then open the link again.'
  :kind==='missing'?"There's no shared view in this link. Ask for it to be sent again."
  :'The link is damaged or incomplete. Some chat apps cut long links; ask for it to be sent again.';
 $('problem').hidden=false;
 $('explore-label').textContent='Explore the atlas in 3D';
}

function showStats(){
 const on=statsEnabled();
 $('stats-state').textContent=on?'Usage statistics are on.':'Usage statistics are off.';
 $('stats').textContent=on?'Turn off':'Turn on';
}

(async()=>{
 const p=payload();
 const ua=navigator.userAgent,android=/Android/i.test(ua),apple=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 const platform=android?'android':apple?'ios':'other';
 const play=$<HTMLAnchorElement>('play'),explore=$<HTMLAnchorElement>('explore');
 play.href=PLAY;
 play.addEventListener('click',()=>track('play_clicked',{source:'share_page'}));
 explore.addEventListener('click',()=>track('view_in_3d_clicked',{platform}));
 // Play and Open in AnatomyGo only make sense on Android. Until the public launch the Play listing is visible
 // only to testers, so the browser view leads everywhere and Open in AnatomyGo serves testers who have the app.
 const install=android&&PLAY_PUBLIC;
 play.hidden=!install;
 $('after').hidden=!install;
 $('android-only').hidden=install;
 if(!PLAY_PUBLIC)$('android-only').textContent='The AnatomyGo Android app is coming soon to Google Play.';
 if(install)explore.parentNode!.insertBefore(play,explore);
 else{explore.className='primary';$('open').className='secondary';explore.parentNode!.insertBefore(explore,$('open'));}
 if(android&&p){
  // Opens the app directly when link verification didn't, e.g. inside an in-app browser. The payload moves to
  // `?d=` because the intent syntax takes over the fragment. It is built on tap and handed to Android, never
  // fetched, and it is a button rather than a link so analytics never sees its address.
  $('open').hidden=false;
  $('open').addEventListener('click',()=>{
   track('open_in_app_clicked');
   // Without the app, Android goes to the fallback: Play once it's public, the browser view until then.
   const fallback=PLAY_PUBLIC?PLAY:explore.href;
   location.href=`intent://${location.host}/v/?d=${encodeURIComponent(p)}#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  });
 }
 showStats();
 $('stats').addEventListener('click',()=>{setStatsEnabled(!statsEnabled());showStats();});
 if(!p){problem('missing');track('share_link_invalid',{reason:'missing',platform});return;}
 try{
  const view=await decode(p);
  show(view);
  track('share_link_opened',{pin_count:bucket(view.pins.length),quiz:view.quiz?1:0,notes:view.pins.some(x=>x.notes)?1:0,isolated:view.isolated?1:0,platform});
 }catch(e){
  const reason=e instanceof LinkError?e.message:'invalid';
  problem(reason);
  track('share_link_invalid',{reason,platform});
 }
})();
