/** Usage statistics through Google Analytics, shared by the explorer and the share page. The measurement ID
 * belongs to the anatomygo.in web app in the Firebase project anatomy-go-app, so the data appears there too.
 * gtag.js needs only that ID, which keeps the Firebase SDK, and the API key it requires, out of the site.
 *
 * Same rule as the Android app: nothing a person writes or reads out of a link is sent. Events carry
 * fixed names, atlas IDs, flags and bucketed counts, never search text or pin text. Shared pins sit in
 * the URL fragment of /v/, so every hit reports a page address the caller has already cleaned.
 *
 * Collection is on by default and can be turned off in About; the choice is kept in localStorage. It runs
 * only on anatomygo.in, or anywhere with ?analytics_debug (events then go to DebugView).
 */
const MEASUREMENT_ID='G-RFXTMB69WH',CHOICE='anatomygo.analytics',HOSTS=['anatomygo.in','www.anatomygo.in'];
const debug=new URLSearchParams(location.search).has('analytics_debug');
export type Params=Record<string,string|number>;
declare global{interface Window{dataLayer:unknown[];[key:`ga-disable-${string}`]:boolean}}
let page:Params={},started=false;

// gtag.js reads the Arguments object itself, not an array.
function gtag(..._:unknown[]){window.dataLayer.push(arguments);}

export function statsEnabled(){try{return localStorage.getItem(CHOICE)!=='off';}catch{return true;}}

/** Starts collection if allowed. `location` must already be free of anything private. */
export function startAnalytics(location:string,title?:string){page={page_location:location,...(title?{page_title:title}:{})};if(statsEnabled())load();}

function load(){
 if(started||(!HOSTS.includes(location.hostname)&&!debug))return;
 started=true;
 window.dataLayer=window.dataLayer||[];
 gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 gtag('js',new Date());
 // `set` applies to every hit, so no event can fall back to the real address or document.title.
 gtag('set',page);
 gtag('config',MEASUREMENT_ID,{...page,allow_google_signals:false,allow_ad_personalization_signals:false,...(debug?{debug_mode:true}:{})});
 const script=document.createElement('script');
 script.async=true;
 script.src=`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
 document.head.appendChild(script);
}

export function track(name:string,params:Params={}){
 if(!started||!statsEnabled())return;
 gtag('event',name,debug?{...params,debug_mode:true}:params);
}

export function setStatsEnabled(on:boolean){
 try{if(on)localStorage.removeItem(CHOICE);else localStorage.setItem(CHOICE,'off');}catch{}
 window[`ga-disable-${MEASUREMENT_ID}`]=!on;
 if(on){load();return;}
 for(const cookie of document.cookie.split(';')){
  const name=cookie.split('=')[0].trim();
  if(name.startsWith('_ga'))for(const domain of ['',`;domain=.${location.hostname.replace(/^www\./,'')}`])document.cookie=`${name}=;max-age=0;path=/${domain}`;
 }
}

/** Ranges instead of exact counts, as in the app's Events.bucket(). */
export function bucket(count:number){return count<=0?'0':count===1?'1':count<=5?'2_5':count<=20?'6_20':count<=100?'21_100':count<=500?'101_500':'500_plus';}

/** The shape of a query, never the query, as in the app's Events.queryKind(). */
export function queryKind(query:string){
 const q=query.trim().toUpperCase();
 return !q?'empty':/^FJ\d+$/.test(q)?'mesh_id':/^FMA\d+$/.test(q)?'fma_id':q.includes(' ')?'phrase':'name';
}
