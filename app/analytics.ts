/** Usage statistics through Google Analytics, shared by the explorer and the share page. The measurement ID
 * belongs to the anatomygo.in web app in the Firebase project anatomy-go-app, so the data appears there too.
 * gtag.js needs only that ID, which keeps the Firebase SDK, and the API key it requires, out of the site.
 *
 * Nothing a person writes or reads out of a link is sent, with one exception for search (search-terms.ts): a search
 * sends its anatomy-vocabulary words, any other word replaced by "?", and a search that finds nothing sends its text,
 * cleaned to lowercase letters. The About sheet says so. Otherwise events carry fixed names, atlas IDs, flags and
 * bucketed counts, never pin text. (The Android app sends no search text at all.) Loading events add the browser's own
 * coarse hints (memory class, network type) and download sizes, to explain slow or failed loads. Shared pins sit in
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

/** Sends an event. `beacon` is for the moment a page is hidden or closed, so the hit survives it.
 * GA4 reads an event parameter called `source` as a traffic source and overwrote where visits came from,
 * so the UI place an action starts from is sent as `ui_source` (from 21 Oct 2026; older data says `source`). */
export function track(name:string,{source,...params}:Params={},{beacon=false}:{beacon?:boolean}={}){
 if(!started||!statsEnabled())return;
 if(source!==undefined)params.ui_source=source;
 gtag('event',name,{...params,...(beacon?{transport_type:'beacon'}:{}),...(debug?{debug_mode:true}:{})});
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

/** Ranges of seconds, for waits and visit lengths. */
export function secondsBucket(s:number){return s<5?'0_4':s<15?'5_14':s<30?'15_29':s<60?'30_59':s<180?'60_179':'180_plus';}

/** Load progress in quarters, so an interrupted download says roughly how far it got. */
export function progressBucket(p:number){return p<=0?'0':p<25?'1_24':p<50?'25_49':p<75?'50_74':p<100?'75_99':'100';}

/** Coarse device hints that explain slow or failed loads: memory class and network type, both from the browser's own
 * rounded values (Chrome and Edge only; Safari and Firefox report 'unknown'). */
export function deviceHints(){
 const nav=navigator as Navigator&{deviceMemory?:number;connection?:{effectiveType?:string}};
 const m=nav.deviceMemory;
 return {memory:m===undefined?'unknown':m<=2?'2_or_less':m<=4?'4':'8_plus',net:nav.connection?.effectiveType??'unknown'};
}

/** What the model download cost this visit, from Resource Timing: kilobytes over the network and whether the browser
 * cache served the files ('all', 'part' or 'none'). A file counts as cached when its body did not cross the network:
 * read straight from the cache (0 bytes) or confirmed unchanged by the server (headers only). Same-origin, so readable. */
export function modelTransfer(stored=0){
 const files=(performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e=>/\/models\/(body-\d+|stream\/s-\d+(-[0-9a-f]+)?)\.bin/.test(e.name));
 // `stored`: stream chunks read from the viewer's own Cache Storage, which leave no Resource Timing entry.
 const bytes=files.reduce((sum,e)=>sum+e.transferSize,0),cached=stored+files.filter(e=>e.decodedBodySize>0&&e.transferSize<e.encodedBodySize).length,total=files.length+stored;
 return {transfer_kb:Math.round(bytes/1024),cache:!total?'unknown':cached===total?'all':cached?'part':'none'};
}

/** The shape of a query, never the query, as in the app's Events.queryKind(). */
export function queryKind(query:string){
 const q=query.trim().toUpperCase();
 return !q?'empty':/^FJ\d+$/.test(q)?'mesh_id':/^FMA\d+$/.test(q)?'fma_id':q.includes(' ')?'phrase':'name';
}
