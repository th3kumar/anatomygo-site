import {fingerprint,forgetPins,useStructurePins,type PublishedPin} from './published-pins';
import type {Session} from '@supabase/supabase-js';
import {cloud,rpc,storedSession,watchSession} from './community/cloud';
import {useVotes} from './community/votes';
import {SignInDialog,type SignInReason} from './community/sign-in-dialog';
import {Dialog} from './community/dialog';
import type {MenuItem} from './community/pin-menu';
import {Profile} from './community/account';
import {copy,pinLink} from './community/share';
import {useFeatureDetail,type Spot} from './community/feature-detail';
import {FeatureExtras} from './community/feature-extras';
import {ReviewQueue} from './community/admin';
import {PlaceSteps,type Refusal} from './community/place-card';
import {dropDraft,keepDraft,keptDrafts,myName,reopen,submit,toSaved,unusable,type Draft,type Saved} from './community/placing';
import {flushSync} from 'react-dom';
import {registerAtlasTools} from './agent-tools';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AnimatePresence,LazyMotion,MotionConfig,domMax,m} from 'motion/react';
import {ArrowUpRight,ChevronRight,Focus,Info,Layers3,Pin,X} from 'lucide-react';
import {useFeatureCounts} from './feature-counts';
import {Tip} from './tips';
import {COACH_MARKS} from './coach';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {AboutCard} from './about-card';
import AnatomyScene from './scene';
import {track,bucket,queryKind,statsEnabled,setStatsEnabled,secondsBucket,progressBucket,deviceHints,modelTransfer} from './analytics';
import {preloadStream,storedChunks} from './model-stream';
import {aliasesFor,searchTerms,searchText} from './search-terms';
import {FeedbackForm,FeedbackPrompt,type FeedbackContext} from './feedback';
import {APP_SEEN,PLAY_PUBLIC,platform,playUrl} from './play';
import LightPad from './light-pad';
import {DEFAULT_LIGHT,isDefaultLight,type Light} from './lighting';
import {setAppearance,useAppearance} from './theme';
import {DEFAULT_VISIBLE,PANEL_ORDER,SYSTEMS,EXPLANATIONS,explanation,type Atlas,type Concept,type SceneState,type SystemId,type View} from './anatomy';
import {Arrive,BackButton,FocusPill,GlassButton,Hint,ThemeButton,ViewPill,Wordmark,type FocusToggle} from './chrome';
import {StructureCard,type CardFacts,type CardMode,type CardTab} from './structure-card';
import {SystemsBody,presetSystems,type Preset} from './systems-panel';
import {SearchPanel,SearchPill,type Result} from './search';
import {useFeatureSearch} from './feature-search';
import {LANDSCAPE,PHONE,useMedia} from './media';
import {spring,tween} from './motion';
// Touch screens pinch and tap; mice scroll and click.
const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
// Atlas names are lower case ("vascular tree"); the interface raises the first letter.
const capitalise=(name:string)=>name.charAt(0).toUpperCase()+name.slice(1);
const initial:SceneState={explode:0,visible:DEFAULT_VISIBLE,selected:[],isolate:false,view:'three-quarter',rotate:false,reset:0};
// A load still running in this tab; if it is there when the page starts again, the last load never finished (a reload, or on phones usually the browser closing the tab for memory).
const LOADING='anatomygo.loading';
const fpsBucket=(fps:number)=>fps<20?'0_19':fps<30?'20_29':fps<45?'30_44':fps<58?'45_57':'58_plus';
export default function Home(){
 const detailTitle=useRef<HTMLHeadingElement>(null),ready=useRef(false),usable=useRef(false),exploded=useRef(false),preExplodeView=useRef<View|null>(null);
 const {choice,dark}=useAppearance();
 const [stats,setStats]=useState(statsEnabled),[light,setLight]=useState<Light>(DEFAULT_LIGHT),[lighting,setLighting]=useState(false);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[state,setState]=useState(initial),[progress,setProgress]=useState(0),[error,setError]=useState(''),[panel,setPanel]=useState<'layers'|'search'|null>(null),[details,setDetails]=useState(false),[about,setAbout]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Concept|null>(null);
 useEffect(()=>{const abort=new AbortController();setProgress(0);setError('');setAtlas(null);setChosen(null);setDetails(false);setState({...initial,visible:DEFAULT_VISIBLE});preloadStream();fetch('/models/atlas.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.json();}).then(data=>setAtlas(data as Atlas)).catch(e=>{if(e.name!=='AbortError'){setError(e.message);track('atlas_download_failed',{stage:'catalogue'});}});return()=>abort.abort();},[]);
 // Loading, measured: time while the page is visible, a load interrupted by leaving the page, and a restart after a load that never finished.
 const load=useRef({start:performance.now(),hidden:0,hiddenAt:0,progress:0,interrupted:false});
 // Taps made before the whole model is in, and what became of them (scene.tsx LoadingTap); capped per visit.
 const loadingTaps=useRef(0);
 const loadMs=()=>{const l=load.current,now=performance.now();return Math.round(now-l.start-l.hidden-(l.hiddenAt?now-l.hiddenAt:0));};
 // One summary of each visit, sent when the page is hidden and only when something new happened since the last one.
 const visit=useRef({structures:new Set<string>(),systems:new Set<string>(),explode:0,isolated:false,searches:0,visible:0,visibleSince:performance.now(),last:''});
 useEffect(()=>{
  try{const before=sessionStorage.getItem(LOADING);if(before!==null)track('atlas_load_restarted',{progress:before,...deviceHints()});sessionStorage.setItem(LOADING,'0');}catch{}
  const changed=()=>{
   const l=load.current,v=visit.current,now=performance.now();
   if(document.visibilityState==='visible'){if(l.hiddenAt){l.hidden+=now-l.hiddenAt;l.hiddenAt=0;}v.visibleSince=now;return;}
   l.hiddenAt=now;v.visible+=now-v.visibleSince;
   // Interrupted means the visit ended before the body was usable (outer body in); after that it's a visit, summarised below.
   if(!usable.current){if(!l.interrupted){l.interrupted=true;track('atlas_load_interrupted',{progress:progressBucket(l.progress),seconds:secondsBucket(loadMs()/1000),...deviceHints()},{beacon:true});}return;}
   const activity={depth:bucket(v.structures.size),systems:bucket(v.systems.size),explode_max:v.explode<=0?'0':v.explode<.5?'1_49':v.explode<1?'50_99':'100',isolated:v.isolated?1:0,searches:bucket(v.searches)},key=JSON.stringify(activity);
   if(key===v.last)return;v.last=key;track('visit_summary',{...activity,seconds:secondsBucket(v.visible/1000),stage:ready.current?'all':'outer'},{beacon:true});
  };
  document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);
 },[]);
 useEffect(()=>{if(state.isolate)visit.current.isolated=true;},[state.isolate]);
 useEffect(()=>{visit.current.explode=Math.max(visit.current.explode,state.explode);},[state.explode]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();setPanel('search');setDetails(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const parts=useMemo(()=>new Map(atlas?.parts.map(p=>[p.id,p])),[atlas]);
 const counts=useMemo(()=>Object.fromEntries(SYSTEMS.map(s=>[s.id,atlas?.parts.filter(p=>p.system===s.id).length??0])),[atlas]);
 const activeSystems=PANEL_ORDER.map(id=>SYSTEMS.find(s=>s.id===id)!).filter(s=>counts[s.id]>0);
 const selectedParts=state.selected.map(id=>parts.get(id)).filter(p=>!!p),selected=selectedParts[0],system=SYSTEMS.find(s=>s.id===selected?.system);
 // Pins on an isolated single piece: published ones, then one community pin per remaining feature (marked as not yet reviewed).
 const [pinsVersion,setPinsVersion]=useState(0);
 const shown=useStructurePins(state.isolate&&selectedParts.length===1?selected.id:null,pinsVersion);
 // The contribute list, in the card (film K6). It belongs to one structure, so it closes when that changes.
 const [contributing,setContributing]=useState(false);
 useEffect(()=>{setContributing(false);},[selected?.id,state.isolate]);
 // Contributing. Signed-in Supabase loads only when needed: a session already kept here, a sign-in returning, or a first vote.
 const [cloudOn,setCloudOn]=useState(()=>storedSession()||new URLSearchParams(location.search).has('code')),[session,setSession]=useState<Session|null>(null);
 useEffect(()=>cloudOn?watchSession(setSession):undefined,[cloudOn]);
 const votes=useVotes(session,shown.pins.flatMap(p=>p.proposal?[p.proposal]:[]));
 // Asked after the action lands (0.25 s), once a visit: Later means "not now", and the vote stays on this device.
 const [ask,setAsk]=useState<SignInReason|null>(null),later=useRef(false);
 useEffect(()=>{if(session&&ask){setAsk(null);track('sign_in_completed',{method:'google_button'});}},[session,ask]);
 const castVote=async(pin:PublishedPin,up=true)=>{if(!pin.proposal)return;const want=up?1:-1,next=votes.mine(pin.proposal)===want?0:want;
  if(await votes.vote(pin.proposal,next)==='kept'&&next!==0&&!later.current){setCloudOn(true);setTimeout(()=>{setAsk('vote');track('sign_in_prompted',{reason:'vote'});},250);}};
 const [selectedPin,setSelectedPin]=useState<string|null>(null);const pin=shown.pins.find(p=>p.id===selectedPin);
 useEffect(()=>{if(pin)setContributing(false);},[pin]);
 // Other spots for the open feature: choosing one shows it on the model, and the card's vote and byline follow it.
 // A suggestion is a point, so a chosen spot never carries the reviewed pin's line or area.
 const [pendingAlt,setPendingAlt]=useState<string|null>(null);
 const [alt,setAlt]=useState<Spot|null>(null),[detailVersion,setDetailVersion]=useState(0),[geometry,setGeometry]=useState<string|null>(null);
 useEffect(()=>{void fingerprint().then(setGeometry).catch(()=>{});},[]);
 useEffect(()=>{setAlt(null);},[selectedPin]);
 const viewPin=useMemo(()=>pin&&alt&&alt.proposal!==pin.proposal?{...pin,proposal:alt.proposal,label:alt.label||pin.label,latinName:alt.latinName||pin.latinName,description:alt.description,anchor:alt.anchor,by:alt.by,at:alt.at,upvotes:alt.upvotes,kind:'community' as const,shape:null}:pin,[pin,alt]);
 const detail=useFeatureDetail(pin?.id??null,viewPin?.proposal??null,geometry,detailVersion);
 useEffect(()=>{if(!pendingAlt)return;const s=detail.spots.find(x=>x.proposal===pendingAlt);if(s){setAlt(s);setPendingAlt(null);}},[detail.spots,pendingAlt]);
 // A shared pin's link (?structure=…&pin=…) opens on that feature once its pins arrive. Older Playground links name
 // the placement rather than the feature, so either is matched.
 const [linkPin,setLinkPin]=useState(()=>{const q=new URLSearchParams(location.search);return q.get('structure')?q.get('pin'):null;});
 useEffect(()=>{if(!linkPin||!shown.pins.length&&!shown.error)return;const p=shown.pins.find(x=>x.id===linkPin||x.proposal===linkPin);
  track('shared_pin_opened',{found:p?1:0,published:p?.kind==='published'?1:0});if(p){setSelectedPin(p.id);setDetails(true);}setLinkPin(null);},[linkPin,shown.pins,shown.error]);
 // Placing a pin (films K7–K9): a draft for the open structure. Every suggestion is a point.
 const draftRef=useRef<string|null>(null);
 const [draft,setDraft]=useState<Draft|null>(null),[refused,setRefused]=useState<Refusal|null>(null),[saveState,setSaveState]=useState<'idle'|'saving'|'saved'>('idle'),[saveError,setSaveError]=useState(''),[invalidTris,setInvalidTris]=useState<number[]>([]);
 const [openProposal,setOpenProposal]=useState<string|null>(null);
 // Pins kept on this device (signed out, or not sent yet): drawn on the model in mint, marked Draft in the list, and
 // opened again where they were left.
 const [kept,setKept]=useState<Saved[]>(keptDrafts),syncKept=()=>setKept(keptDrafts());
 const keptHere=useMemo(()=>selected&&state.isolate&&selectedParts.length===1?kept.filter(k=>k.mesh===selected.id):[],[kept,selected?.id,state.isolate,selectedParts.length]);
 const scenePins=useMemo(()=>{const mine=keptHere.filter(k=>k.request!==draft?.request).map(k=>({id:`draft:${k.request}`,label:k.label,latinName:k.latin,description:k.description,anchor:k.anchor,kind:'draft' as const}));
  const base=viewPin&&viewPin!==pin?shown.pins.map(x=>x.id===viewPin.id?viewPin:x):shown.pins;
  return mine.length?[...base,...mine]:base;},[shown.pins,keptHere,draft?.request,viewPin,pin]);
 const resume=(k:Saved)=>{setDraft(reopen(k));setRefused(null);setSaveState('idle');setSaveError('');void unusable(k.mesh).then(setInvalidTris);track('draft_started',{kind:k.kind,practice:0});};
 // "Pin saved" (film K10), and your own name, so your pins read "Added by you".
 const [toast,setToast]=useState(''),[me,setMe]=useState<string|null>(null),[admin,setAdmin]=useState(false),[review,setReview]=useState(false);
 useEffect(()=>{setAdmin(false);if(session)void rpc<boolean>('pg_is_admin',{}).then(v=>setAdmin(!!v)).catch(()=>{});},[session]);
 const postRemark=async(text:string)=>{if(!viewPin?.proposal)return false;if(!session){setCloudOn(true);setAsk('comment');track('sign_in_prompted',{reason:'comment'});return false;}
  try{await rpc('pg_comment',{p_proposal:viewPin.proposal,p_body:text,p_request:crypto.randomUUID()});setDetailVersion(v=>v+1);return true;}catch{setToast('That didn’t post. Please try again.');return false;}};
 const removeRemark=async(id:string)=>{try{await rpc('pg_remove_comment',{p_comment:id});track('comment_deleted');setDetailVersion(v=>v+1);}catch{setToast('That didn’t delete. Please try again.');}};
 // The pin's ⋯ menu: vote down, report (signed in), delete your own unpublished pin. Each asks in a small dialog.
 const [act,setAct]=useState<{kind:'report'|'delete';pin:PublishedPin}|null>(null),[reason,setReason]=useState(''),[actBusy,setActBusy]=useState(false),[actError,setActError]=useState('');
 const menuFor=(x:PublishedPin)=>{const mine=!!x.by&&x.by===me,items:MenuItem[]=[];if(!x.proposal)return items;
  if(!mine)items.push({label:'Doesn’t look right',checked:votes.mine(x.proposal)===-1,onSelect:()=>void castVote(x,false)});
  if(!mine)items.push({label:'Report a problem',onSelect:()=>{if(!session){setCloudOn(true);setAsk('report');track('sign_in_prompted',{reason:'report'});return;}setReason('');setActError('');setAct({kind:'report',pin:x});}});
  if(mine&&x.kind!=='published')items.push({label:'Delete my pin',danger:true,onSelect:()=>{setActError('');setAct({kind:'delete',pin:x});}});
  return items;};
 const runAct=async()=>{if(!act?.pin.proposal||actBusy)return;setActBusy(true);setActError('');
  try{if(act.kind==='report'){await rpc('pg_report',{p_proposal:act.pin.proposal,p_reason:reason.trim()});track('report_sent');setToast('Thanks. We’ll take a look.');}
   else{await rpc('pg_withdraw',{p_proposal:act.pin.proposal});track('pin_deleted');setToast('Pin deleted');if(selected)forgetPins(selected.id);setPinsVersion(v=>v+1);setSelectedPin(null);}
   setAct(null);}catch{setActError(act.kind==='report'?'That didn’t send. Please try again.':'That didn’t delete. Please try again.');}finally{setActBusy(false);}};
 const saveName=async(v:string)=>{await rpc('pg_set_profile',{p_name:v});setMe(v);track('public_name_set',{first:me?0:1});};
 const signOut=async()=>{await (await cloud()).auth.signOut();track('signed_out');setAbout(false);setToast('Signed out');};
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2400);return()=>clearTimeout(t);},[toast]);
 useEffect(()=>{setMe(null);if(session)void myName(session).then(setMe).catch(()=>{});},[session]);
 useEffect(()=>{setDraft(null);},[selected?.id,state.isolate]);
 draftRef.current=draft?.request??null;
 const startDraft=(d:Pick<Draft,'kind'|'landmark'|'supersedes'|'label'|'latin'|'description'>)=>{if(!selected)return;
  const left=d.landmark&&keptHere.find(k=>k.landmark===d.landmark&&k.kind===d.kind);if(left){resume(left);return;}
  setDraft({...d,request:crypto.randomUUID(),mesh:selected.id,anchor:null,note:''});setRefused(null);setSaveState('idle');setSaveError('');setInvalidTris([]);
  void unusable(selected.id).then(setInvalidTris);track('draft_started',{kind:d.kind,practice:0});};
 const cancelDraft=()=>{if(draft)track('draft_cancelled',{stage:draft.anchor?'placed':'placing'});setDraft(null);};
 const savePin=async()=>{if(!draft?.anchor||saveState!=='idle')return;setSaveState('saving');setSaveError('');
  try{const saved=toSaved(draft,await fingerprint());
   // Signed out: kept on this device, then sign-in is offered (Later keeps it here).
   if(!session){keepDraft(saved);syncKept();setSaveState('saved');setTimeout(()=>{setCloudOn(true);setAsk('pin');track('sign_in_prompted',{reason:'save'});},250);return;}
   const id=await submit(saved,session);dropDraft(saved.request);syncKept();setSaveState('saved');forgetPins(saved.mesh);void myName(session).then(setMe);
   setTimeout(()=>setToast('Pin saved'),700);
   setTimeout(()=>{setDraft(null);setPinsVersion(v=>v+1);setOpenProposal(id);if(saved.landmark)setSelectedPin(saved.landmark);},700);
  }catch(e){setSaveState('idle');setSaveError(e instanceof Error&&/name/.test(e.message)?e.message:'That didn’t save. Please try again.');}};
 // A new part has no feature id until it is saved: open it once its pin arrives.
 useEffect(()=>{if(!openProposal)return;const p=shown.pins.find(x=>x.proposal===openProposal);if(p){setSelectedPin(p.id);setOpenProposal(null);}},[shown.pins,openProposal]);
 // After sign-in, pins kept on this device are sent, then forgotten here.
 useEffect(()=>{if(!session)return;const list=keptDrafts();if(!list.length)return;
  void (async()=>{let sent=0,open:string|null=null;for(const k of list){try{const id=await submit(k,session);dropDraft(k.request);forgetPins(k.mesh);sent++;if(k.request===draftRef.current)open=id;}catch{/* kept for the next try */}}
   syncKept();setPinsVersion(v=>v+1);void myName(session).then(setMe);if(sent)setToast(sent>1?`${sent} pins saved`:'Pin saved');if(open)setOpenProposal(open);
   // A pin saved just before signing in is now sent: its step card closes.
   setDraft(d=>d&&!keptDrafts().some(k=>k.request===d.request)?null:d);})();},[session]);
 const selectPin=(id:string,source:'list'|'model')=>{setSelectedPin(id);const p=shown.pins.find(x=>x.id===id);if(p)track('home_pin_selected',{kind:p.kind??'published',source});};
 useEffect(()=>{if(shown.pins.length)track('home_pins_shown',{structure_id:selected?.id??'',pins:bucket(shown.pins.length),published:bucket(shown.pins.filter(p=>p.kind!=='community').length)});},[shown.pins]);
 // Playground entry: a count of the structure's parts & features, a "New" tag and (with coach marks on) two one-time tips until the visitor has tried it.
 const featureCounts=useFeatureCounts(details?state.selected:[]),featureTotal=featureCounts?featureCounts.features:null;
 // Not isolated yet: say how many features are pinned and offer to show them on the model.
 const pinsOffer=!state.isolate&&selectedParts.length===1&&!!featureCounts&&featureCounts.pinned>0?featureCounts.pinned:0;
 useEffect(()=>{if(pinsOffer)track('home_pins_offered',{structure_id:selected?.id??'',pins:bucket(pinsOffer)});},[pinsOffer,selected?.id]);
 const featureHref=`/playground/?structure=${encodeURIComponent(selectedParts.length===1?selected?.id??'':chosen?.id??selected?.id??'')}&from=details`;
 const [tipsSeen,setTipsSeen]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('anatomygo.home.tips')??'[]');}catch{return [];}});
 // Tried: the Playground has been opened (its own flag), or its practice was finished or skipped (older visitors).
 const triedPlayground=useMemo(()=>{try{return !!(localStorage.getItem('anatomygo.playground.visited')||localStorage.getItem('anatomygo.playground.practice'));}catch{return true;}},[]);
 const seeTips=(...ids:string[])=>setTipsSeen(s=>{const next=[...new Set([...s,...ids])];try{localStorage.setItem('anatomygo.home.tips',JSON.stringify(next));}catch{}return next;});
 const [settled,setSettled]=useState(false),[viewReady,setViewReady]=useState(false);
 // The structure a shared link opens on, so the viewer downloads its parts first.
 const linked=useMemo(()=>{if(!atlas)return [];const id=new URLSearchParams(location.search).get('structure');if(!id)return [];const c=atlas.concepts.find(x=>x.id===id);return c?c.elements:atlas.parts.some(p=>p.id===id)?[id]:[];},[atlas]);useEffect(()=>{if(progress<100)return;const t=setTimeout(()=>setSettled(true),1500);return()=>clearTimeout(t);},[progress]);
 // The Android app's launch: a badge on About, once the model has settled, until the visitor opens About. Apple devices can't install it, so they get no badge.
 const [appNews,setAppNews]=useState(()=>{if(!PLAY_PUBLIC||platform==='ios')return false;try{return !localStorage.getItem(APP_SEEN);}catch{return false;}});
 const [appFresh,setAppFresh]=useState(false),appBadge=appNews&&settled;
 useEffect(()=>{if(appBadge)track('app_badge_shown');},[appBadge]);
 const featureTip=COACH_MARKS&&!triedPlayground&&details&&selectedParts.length>0&&!tipsSeen.includes('features');
 const entryTip=COACH_MARKS&&!triedPlayground&&settled&&!details&&!panel&&!about&&!lighting&&!tipsSeen.includes('entry')&&!tipsSeen.includes('features');
 useEffect(()=>{if(entryTip)track('home_tip_shown',{tip:'entry'});},[entryTip]);useEffect(()=>{if(featureTip)track('home_tip_shown',{tip:'features'});},[featureTip]);
 useEffect(()=>setSelectedPin(null),[state.selected]);
 // A feature chosen in search: its structure opens in focus, and the feature opens as soon as its pins are in.
 const [wantPin,setWantPin]=useState<string|null>(null);
 useEffect(()=>{if(wantPin&&shown.pins.some(p=>p.id===wantPin)){selectPin(wantPin,'list');setWantPin(null);}},[shown.pins,wantPin]);
 const visibleCount=atlas?.parts.filter(p=>state.isolate?state.selected.includes(p.id):state.visible.includes(p.system)||state.selected.includes(p.id)).length??0;
 const results=useMemo(()=>{if(!atlas)return[];const term=query.toLowerCase().trim();if(!term)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);const also=aliasesFor(term);return atlas.concepts.filter(c=>{const n=c.name.toLowerCase();return n.includes(term)||c.id.toLowerCase().includes(term)||also.some(a=>n.includes(a));}).sort((a,b)=>a.name.length-b.name.length).slice(0,80);},[atlas,query]);
 // A search that finds nothing, once typing pauses: the query's shape and length only, never its text. Longer versions of the same miss are not repeated.

 // Feedback. The card asks once per device: after three minutes of visible use, once the body is usable and the visitor
 // has done something, at a calm moment (nothing open, no input for four seconds). About always offers the same form.
 const FEEDBACK='anatomygo.feedback',[feedbackPrompt,setFeedbackPrompt]=useState(false),[aboutFeedback,setAboutFeedback]=useState(false);
 const lastInput=useRef(0),calm=useRef(false);
 const visibleMs=()=>{const v=visit.current;return v.visible+(document.visibilityState==='visible'?performance.now()-v.visibleSince:0);};
 const feedbackContext=():FeedbackContext=>({device:innerWidth<768?'mobile':'desktop',minutes:Math.round(visibleMs()/60000),structures:visit.current.structures.size});
 // Returns whether the choice was really stored: if it can't be remembered, the card isn't shown at all (no repeat asks).
 const markFeedback=(state:'shown'|'dismissed'|'sent')=>{try{localStorage.setItem(FEEDBACK,JSON.stringify({state,at:new Date().toISOString().slice(0,10)}));return !!localStorage.getItem(FEEDBACK);}catch{return false;}};
 useEffect(()=>{const input=()=>{lastInput.current=performance.now();};for(const e of ['pointerdown','wheel','keydown'])addEventListener(e,input,{capture:true,passive:true});return()=>{for(const e of ['pointerdown','wheel','keydown'])removeEventListener(e,input,{capture:true});};},[]);
 // Local dev only (`npm run dev`, then ?feedback_preview): show the card at once to review it. Not in production builds.
 useEffect(()=>{if(import.meta.env.DEV&&atlas&&new URLSearchParams(location.search).has('feedback_preview'))setFeedbackPrompt(true);},[atlas]);
 useEffect(()=>{if(!atlas)return;let asked=true;try{asked=!!localStorage.getItem(FEEDBACK);}catch{}if(asked)return;
  // The marker is read again on every check, so a card shown (or sent, or dismissed) in another tab stops this one too.
  const t=setInterval(()=>{try{if(localStorage.getItem(FEEDBACK)){clearInterval(t);return;}}catch{clearInterval(t);return;}
   const v=visit.current,acted=lastInput.current>0||v.structures.size>0||v.systems.size>0||v.searches>0;
   if(!usable.current||!acted||!calm.current||visibleMs()<180000||performance.now()-lastInput.current<4000)return;
   clearInterval(t);if(!markFeedback('shown'))return;setFeedbackPrompt(true);track('feedback_prompt_shown',{seconds:secondsBucket(visibleMs()/1000)});},5000);
  return()=>clearInterval(t);},[atlas]);
 calm.current=!panel&&!about&&!lighting&&!details&&!entryTip&&!featureTip;
 const missed=useRef('');
 // A search closed without picking a result (and not already reported as finding nothing), once per distinct query.
 const searchSession=useRef({open:false,chosen:false,reported:''});
 useEffect(()=>{const s=searchSession.current,term=query.trim();
  if(panel==='search'){if(!s.open){s.open=true;s.chosen=false;}return;}
  if(!s.open)return;s.open=false;
  if(!s.chosen&&atlas&&term&&results.length&&term!==s.reported){s.reported=term;track('search_abandoned',{query_kind:queryKind(term),result_count:bucket(results.length),search_terms:searchTerms(term,atlas)});}
 },[panel]);
 useEffect(()=>{const term=query.trim();if(!atlas||!term||results.length)return;const t=setTimeout(()=>{if(missed.current&&term.startsWith(missed.current))return;missed.current=term;track('search_no_result',{query_kind:queryKind(term),count:bucket(term.length),search_terms:searchTerms(term,atlas),search_text:searchText(term)});},1200);return()=>clearTimeout(t);},[atlas,query,results.length]);
 const choose=(c:Concept,source:string)=>{visit.current.structures.add(c.id);track('structure_selected',{source,structure_id:c.id,system_id:parts.get(c.elements[0])?.system??'concept',count:bucket(c.elements.length)});setChosen(c);setState(s=>({...s,selected:c.elements,isolate:false,rotate:false}));setDetails(true);setPanel(null);};
 useEffect(()=>{if(!atlas)return;return registerAtlasTools(atlas,c=>flushSync(()=>choose(c,'agent')));},[atlas]);
 const choosePart=(id:string,source:string)=>{const p=parts.get(id);if(!p)return;visit.current.structures.add(id);track('structure_selected',{source,structure_id:id,system_id:p.system,count:1});setChosen({id:p.conceptId,name:p.name,elements:[id]});setState(s=>({...s,selected:[id],isolate:false,rotate:false}));setDetails(true);setPanel(null);};
 const toggle=(id:SystemId)=>{visit.current.systems.add(id);track('system_toggled',{system_id:id,visible:state.visible.includes(id)?0:1});setDetails(false);setState(s=>({...s,selected:[],isolate:false,visible:s.visible.includes(id)?s.visible.filter(x=>x!==id):[...s.visible,id]}));};
 const reset=()=>{track('view_reset');setState(s=>({...initial,visible:DEFAULT_VISIBLE,reset:s.reset+1}));setChosen(null);setDetails(false);setPanel(null);};
 useEffect(()=>{if(!atlas)return;const q=new URLSearchParams(location.search),id=q.get('structure');if(!id)return;const c=atlas.concepts.find(x=>x.id===id);if(c)choose(c,'link');else if(parts.has(id))choosePart(id,'link');else return;if(q.get('isolate')!=='0')setState(s=>({...s,isolate:true,explode:0}));},[atlas]);
 const failed=(message:string)=>{setError(message);if(/WebGL/.test(message))track('renderer_failed',{reason:'webgl'});else if(/paused/.test(message))track('renderer_failed',{reason:'context_lost'});else track('atlas_download_failed',{stage:'models'});};
 const closeLighting=()=>{track('lighting_closed',{custom:isDefaultLight(light)?0:1});setLighting(false);};
 const toggleLighting=()=>{if(lighting){closeLighting();return;}track('lighting_opened');setPanel(null);setLighting(true);};
 const openAbout=(source:'top_bar'|'footer')=>{track('about_opened',{source:appBadge?`${source}_badge`:source});if(appNews){setAppNews(false);setAppFresh(true);try{localStorage.setItem(APP_SEEN,'1');}catch{}}setDetails(false);setPanel(null);setAbout(true);};
 const playClicked=()=>track('play_clicked',{source:'about',platform});
 const openPanel=(next:'layers'|'search')=>{setDetails(false);setPanel(p=>p===next?null:next);};
 const phone=useMedia(PHONE),sideways=useMedia(LANDSCAPE),chromeReady=viewReady||progress===100||!!error;
 // On <html> too, so sheets and dialogs (rendered outside <main>) take the phone layout.
 useEffect(()=>{document.documentElement.classList.toggle('is-phone',phone);},[phone]);
 // "All" is the default view: every system but the body surface, which would hide everything else.
 // The structure card: peek after a tap, focus after Learn more (isolated), feature once a part is open.
 const [returning,setReturning]=useState(false),[linkedReady,setLinkedReady]=useState(false),[sheetRest,setSheetRest]=useState(0),[cardMini,setCardMini]=useState(false);
 const [tab,setTab]=useState<CardTab>('about'),[hoverPin,setHoverPin]=useState<string|null>(null);
 const [focusOptions,setFocusOptions]=useState<Record<FocusToggle,boolean>>({neighbours:true,labels:true,behind:true});
 const mode:CardMode|null=!(details&&selectedParts.length>0)?null:!state.isolate?'peek':draft?'place':pin?'feature':contributing?'contribute':'focus';
 // A structure link opens in focus, but its chrome waits until that structure has loaded (the bar under the wordmark shows the way).
 const linkWaiting=linked.length>0&&!linkedReady&&!viewReady;
 const focused=(mode==='focus'||mode==='feature'||mode==='contribute'||mode==='place')&&!linkWaiting;
 useEffect(()=>{setTab('about');setHoverPin(null);},[state.selected]);
 const clearing=useRef(0);
 const mid=useMedia('(min-width: 768px) and (max-width: 1099px)');
 // Back to the body: the card and pins leave, the camera returns, and the structure keeps its tint for 1.2 s.
 const backToBody=()=>{setSelectedPin(null);setDetails(false);setState(s=>({...s,isolate:false}));setReturning(true);const token=++clearing.current;setTimeout(()=>{if(clearing.current===token)setReturning(false);},1100);setTimeout(()=>{if(clearing.current===token)setState(s=>s.isolate?s:{...s,selected:[]});},2050);};
 const closeCard=()=>{if(focused){backToBody();return;}setDetails(false);setState(s=>({...s,selected:[],isolate:false}));};
 const learnMore=()=>{track('structure_isolated',{isolated:1,system_id:selected?.system??'concept',source:'learn_more'});setState(s=>({...s,isolate:true,explode:0,rotate:false}));};
 const toggleFocus=(k:FocusToggle)=>{setFocusOptions(o=>{track('display_toggled',{toggle:k,on:o[k]?0:1});return {...o,[k]:!o[k]};});};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape'||panel||lighting)return;if(about){setAbout(false);return;}if(mode==='place'){cancelDraft();}else if(mode==='feature'){setSelectedPin(null);setTab('parts');}else if(mode==='contribute'){setContributing(false);}else if(focused)backToBody();else if(mode==='peek')closeCard();};addEventListener('keydown',key);return()=>removeEventListener('keydown',key);});
 const KIND:Record<string,string>={skeletal:'Bone',muscular:'Muscle',arterial:'Artery',venous:'Vein'};
 const side=chosen?/\bleft\b/i.test(chosen.name)?'Left':/\bright\b/i.test(chosen.name)?'Right':null:null;
 const counterpart=(()=>{if(!atlas||!selected||selectedParts.length!==1||!side)return null;const want=selected.name.replace(/\b(Left|Right|left|right)\b/,w=>({Left:'Right',Right:'Left',left:'right',right:'left'} as Record<string,string>)[w]);const p=atlas.parts.find(x=>x.name===want);return p?{id:p.id,name:p.name}:null;})();
 const facts:CardFacts|null=chosen&&selected?{kind:KIND[selected.system]??system?.name??'Structure',title:capitalise(chosen.name),description:explanation(chosen.name,selected.system),curated:!!EXPLANATIONS[chosen.name.toLowerCase()],system:system?.name??'Anatomy',side,pieces:selectedParts.length,features:featureCounts?featureCounts.pinned:null,reference:chosen.id}:null;
 const pinHref=(p:{proposal?:string})=>`/playground/?structure=${encodeURIComponent(selected?.id??'')}${p.proposal?`&pin=${encodeURIComponent(p.proposal)}`:''}&from=home_pin`;
 const systemIds=DEFAULT_VISIBLE.filter(id=>activeSystems.some(s=>s.id===id));
 const applyPreset=(p:Preset)=>{track('preset_applied',{preset:p});setDetails(false);setState(s=>({...s,selected:[],isolate:false,visible:presetSystems(p,systemIds)}));};
 const showOnly=(id:SystemId)=>{track('preset_applied',{preset:'only',system_id:id});setDetails(false);setState(v=>({...v,visible:[id],isolate:false,selected:[]}));};
 const explodeTo=(value:number)=>{if(!exploded.current){exploded.current=true;track('explode_used');}setState(s=>{if(s.explode<=.8&&value>.8)preExplodeView.current=s.view;const view=s.explode>.8&&value<=.8?preExplodeView.current??s.view:value>.8?'front':s.view;return {...s,explode:value,view,rotate:false};});};
 const setView=(v:View)=>{track('camera_view',{view:v});setState(s=>({...s,view:v,reset:s.reset+1,rotate:false}));};
 // The theme button: the whole page eases to the other theme in one cross-fade (a View Transition where the browser has one).
 const toggleTheme=()=>{const next=dark?'light':'dark';track('appearance_changed',{mode:next});const apply=()=>flushSync(()=>setAppearance(next));const doc=document as Document&{startViewTransition?:(cb:()=>void)=>unknown};if(doc.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)doc.startViewTransition(apply);else apply();};
 const searchResults:Result[]=results.map(c=>{const sys=SYSTEMS.find(x=>x.id===parts.get(c.elements[0])?.system);return {id:c.id,name:capitalise(c.name),meta:`${sys?.name??'Structure'}${c.elements.length>1?` · ${c.elements.length} pieces`:''}`};});
 const featureHits=useFeatureSearch(panel==='search'?query:'');
 const featureResults:Result[]=featureHits.filter(h=>parts.has(h.mesh)).map(h=>({id:`f:${h.id}:${h.mesh}`,name:capitalise(h.label),meta:`On ${capitalise(parts.get(h.mesh)!.name)}`}));
 const chooseResult=(id:string)=>{
  if(id.startsWith('f:')){const [,pin,mesh]=id.split(':');if(!parts.has(mesh))return;visit.current.searches++;searchSession.current.chosen=true;track('search_performed',{query_kind:queryKind(query),result_count:bucket(results.length+featureResults.length),...(atlas?{search_terms:searchTerms(query,atlas)}:{})});choosePart(mesh,'search');setState(s=>({...s,isolate:true,explode:0,rotate:false}));setWantPin(pin);return;}
  const c=results.find(x=>x.id===id);if(!c)return;visit.current.searches++;searchSession.current.chosen=true;track('search_performed',{query_kind:queryKind(query),result_count:bucket(results.length),...(atlas?{search_terms:searchTerms(query,atlas)}:{})});choose(c,'search');};
 const tap=coarse?'Tap':'Click',inspecting=details&&selectedParts.length>0;
 // Body chrome waits for the camera to land after Back; focus chrome arrives as the Learn more move lands.
 const bodyDelay=returning?.75:0,focusDelay=phone?.7:.8;
 const sceneState={...state,inspectorOpen:inspecting,neighbours:focusOptions.neighbours,behind:focusOptions.behind,labels:(!focusOptions.labels?'off':mode==='focus'&&tab==='about'?'soft':'full') as 'off'|'soft'|'full',hoverPin,frame:`${mode}:${tab}:${focused?1:0}:${phone?sheetRest:0}:${cardMini?1:0}`};
 const hintId=state.explode>.8?'pan':inspecting?'switch':'learn';
 const systemsBody=<SystemsBody systems={activeSystems} allSet={systemIds} counts={counts} visible={state.visible} shown={visibleCount} explode={state.explode} onPreset={applyPreset} onToggle={toggle} onOnly={showOnly} onExplode={explodeTo}/>;
 const aboutPages={
  about:<div className="about-copy">
   <p className="t-body">A free 3D atlas of the adult male body: 2,234 parts to explore, isolate and pin.</p>
   {PLAY_PUBLIC?<section className={`tile app-card ${appFresh?'is-fresh':''}`} aria-labelledby="app-card-title">
   <div className="app-card-head"><img src="/app-icon.png" alt="" width={48} height={48}/><div><h3 id="app-card-title" className="t-body">AnatomyGo for Android{appFresh&&<b className="new-tag">New</b>}</h3><p className="t-meta">Works offline. No account.</p></div></div>
   {platform==='ios'?<p className="t-meta app-card-note">Android only for now.</p>
   :coarse||platform==='android'?<a className="btn-accent app-card-cta" href={playUrl('site')} target="_blank" rel="noreferrer" onClick={playClicked}>Get it on Google Play<ArrowUpRight size={16}/></a>
   :<div className="app-card-qr"><img src="/app-qr.svg" alt="QR code for AnatomyGo on Google Play" width={104} height={104}/><div><strong className="t-body">Scan with your Android phone</strong><a className="link-mint" href={playUrl('site')} target="_blank" rel="noreferrer" onClick={playClicked}>Or open Google Play <ArrowUpRight size={13}/></a></div></div>}
  </section>:undefined}
   <p className="t-meta">For learning, not for diagnosis or surgery.</p>
   <p className="t-meta about-credits">Anatomy: BodyParts3D © DBCLS (<a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">CC BY 4.0</a>) · Viewer: Human Atlas (<a href="/human-atlas-license.txt" target="_blank" rel="noreferrer">MIT</a>)</p>
  </div>,
  feedback:<div className="about-copy">
   <section className="feedback-about" aria-label="Feedback"><p className="t-body2">What helped, what didn’t, what’s missing?</p>
    {aboutFeedback?<FeedbackForm source="about" context={feedbackContext} onSent={()=>markFeedback('sent')}/>:<button type="button" className="btn-quiet feedback-open" onClick={()=>{setAboutFeedback(true);track('feedback_opened',{ui_source:'about'});}}>Write feedback</button>}</section>
   <div className="stats-choice"><span className="t-body">Share usage statistics<small className="t-meta">Visits, features used and load speed. Searches keep only anatomy words, plus the words of searches that find nothing.</small></span><Switch checked={stats} onCheckedChange={on=>{setStats(on);setStatsEnabled(on);}} aria-label="Share usage statistics"/></div>
  </div>,
 };

 return <LazyMotion features={domMax} strict><MotionConfig reducedMotion="user"><main className={`studio ${phone?'is-phone':'is-desk'}`}>
  {atlas&&<AnatomyScene pins={scenePins} selectedPin={mode==='place'?null:selectedPin} onPinSelect={id=>{if(draft)return;if(id.startsWith('draft:')){const k=keptHere.find(x=>`draft:${x.request}`===id);if(k)resume(k);return;}selectPin(id,'model');setDetails(true);}}
   placing={mode==='place'&&draft?{anchor:draft.anchor,invalid:invalidTris}:null}
   onPlace={r=>{if('refused' in r){setRefused(r.refused);track('pin_refused',{reason:r.refused,practice:0});return;}setRefused(null);if(!r.moved)track('pin_placed',{kind:draft?.anchor?'moved':'placed',practice:0});setDraft(d=>d&&{...d,anchor:r.anchor});}} atlas={atlas} light={light} dark={dark} state={sceneState} onSelect={id=>choosePart(id,'tap')} onProgress={n=>{setProgress(n);load.current.progress=n;try{sessionStorage.setItem(LOADING,progressBucket(n));}catch{}if(n===100){setError('');if(!ready.current){ready.current=true;usable.current=true;try{sessionStorage.removeItem(LOADING);}catch{}track('atlas_ready',{duration_ms:Math.round(performance.now()),load_ms:loadMs(),...modelTransfer(storedChunks()),...deviceHints()});}}}} priority={linked} onLoadingTap={t=>{if(loadingTaps.current++<30)track('loading_tap',{result:t.result,progress:progressBucket(load.current.progress),...(t.waitMs===undefined?{}:{seconds:secondsBucket(t.waitMs/1000)}),...(t.reason?{reason:t.reason}:{})});}} onMilestone={m=>{if(m==='priority')setLinkedReady(true);else if(m==='view')setViewReady(true);else{usable.current=true;try{sessionStorage.removeItem(LOADING);}catch{}track('atlas_outer_ready',{duration_ms:Math.round(performance.now()),load_ms:loadMs(),...modelTransfer(storedChunks()),...deviceHints()});}}} onPerf={p=>track('render_perf',{fps:fpsBucket(1000/p.frameMs),frame_ms:Math.round(p.frameMs*10)/10,render_ms:Math.round(p.renderMs*10)/10,...deviceHints()})} onError={failed}/>}
  <AnimatePresence>{lighting&&<LightPad key="light" light={light} onMove={setLight} onReset={()=>{track('lighting_reset');setLight(DEFAULT_LIGHT);}} onDone={closeLighting}/>}</AnimatePresence>
  {/* The header, with the intro also in web/index.html's first frame: keep the two in step. */}
  <header className="topbar" data-inset="top">
   <AnimatePresence initial={false} mode="popLayout">{focused
    ?mode==='place'?null:<m.div key="back" className="back-dock" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0,transition:tween('out',.26,phone?.7:.15)}} exit={{opacity:0,transition:tween('in',.14)}}><BackButton esc={!phone&&mode==='focus'} label={phone&&mode==='feature'?facts?.title??'Back':phone?'Body':'Whole body'} onBack={()=>{if(phone&&mode==='feature'){setSelectedPin(null);setTab('parts');}else backToBody();}}/></m.div>
    :<m.div key="mark" initial={{opacity:0}} animate={{opacity:1,transition:tween('out',.24)}} exit={{opacity:0,transition:tween('in',.18)}}><Wordmark compact={phone} progress={chromeReady?null:progress}/></m.div>}</AnimatePresence>
   <p className="sr-only">A free 3D atlas of the human body, built from BodyParts3D. Explore, isolate and pin {atlas?atlas.parts.length.toLocaleString():'2,234'} bones, muscles, organs, vessels and nerves in your browser.</p>
   {!phone&&<Arrive ready={chromeReady&&!focused} delay={bodyDelay} edge="top" order={1} className="top-search"><SearchPill onOpen={()=>openPanel('search')}/></Arrive>}
   <AnimatePresence initial={false}>{phone&&focused?<Arrive key="focus-actions" ready delay={focusDelay} enter={.26} edge="top" order={0} className="top-actions focus-actions"><FocusPill compact view={state.view} options={focusOptions} onToggle={toggleFocus}/></Arrive>:<Arrive key="page-actions" ready={chromeReady&&!focused} delay={bodyDelay} edge="top" order={2} className="top-actions" role="group" aria-label="Page">
    <ThemeButton dark={dark} onToggle={toggleTheme}/>
    {phone
     ?<GlassButton icon={<Info size={18}/>} onClick={()=>openAbout('top_bar')} aria-label={appBadge?'About this atlas. New: the Android app':'About this atlas'}>{appBadge&&<span className="app-dot" aria-hidden="true"/>}</GlassButton>
     :<GlassButton label="About" onClick={()=>openAbout('top_bar')} aria-label={appBadge?'About this atlas. New: the Android app':'About this atlas'}>{appBadge&&<span className="app-dot" aria-hidden="true"/>}</GlassButton>}
   </Arrive>}</AnimatePresence>
  </header>
  {!phone&&<Arrive ready={chromeReady&&!focused&&!(mid&&inspecting)} delay={bodyDelay} edge="left" order={0} className="panel systems" data-inset={focused||(mid&&inspecting)?undefined:'left'} role="region" aria-label="Systems">{systemsBody}</Arrive>}
  <AnimatePresence>{phone&&panel==='layers'&&<>
   <m.div key="scrim" className="sheet-scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={tween('out',.2)} onClick={()=>setPanel(null)}/>
   <m.section key="systems" className="sheet systems-sheet" role="dialog" aria-label="Systems" initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%',transition:tween('in',.22)}} transition={spring.sheet} drag="y" dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:.6}} onDragEnd={(_,i)=>{if(i.offset.y>80||i.velocity.y>500)setPanel(null);}}>
    <span className="grab" aria-hidden="true"/><button type="button" className="sheet-close" onClick={()=>setPanel(null)} aria-label="Close systems"><X size={18}/></button>{systemsBody}
   </m.section>
  </>}</AnimatePresence>
  <AnimatePresence>{panel==='search'&&<SearchPanel key="search" phone={phone} query={query} setQuery={setQuery} results={searchResults} features={featureResults} note={query.trim()?(results.length===80?'Showing the first 80 matches. Keep typing to narrow them.':''):'Or search any named structure.'} onChoose={chooseResult} onClose={()=>setPanel(null)}/>}</AnimatePresence>
  {phone
   ?<>
    <Arrive ready={chromeReady&&!inspecting&&!about} delay={bodyDelay} edge={sideways?'left':'right'} order={1} className="view-dock is-phone" data-inset={inspecting?undefined:sideways?'left':'right'}><ViewPill vertical view={state.view} explode={state.explode} rotate={state.rotate} lighting={lighting} onView={setView} onRotate={()=>setState(s=>({...s,rotate:!s.rotate}))} onLight={toggleLighting}/></Arrive>
    {<Arrive ready={chromeReady&&!panel&&!inspecting&&!about&&!lighting&&!(phone&&feedbackPrompt)} delay={inspecting||returning?bodyDelay||.1:0} edge="bottom" order={3} className="bottom-bar" data-inset={!inspecting&&!panel?'bottom':undefined}>
     {!lighting&&<Hint id={hintId} className="hint-phone">{state.explode>.8?'Drag to pan · Pinch to zoom':`${tap} any part to learn about it`}</Hint>}
     <div className="bottom-row">{panel!=='search'?<SearchPill phone onOpen={()=>openPanel('search')}/>:<span className="search-pill-gap"/>}<GlassButton className="systems-button" icon={<Layers3 size={18}/>} label="Systems" onClick={()=>openPanel('layers')} aria-expanded={panel==='layers'}/></div>
    </Arrive>}
   </>
   :<>
    <AnimatePresence initial={false}>{focused?<Arrive key="focus-dock" ready delay={focusDelay} edge="bottom" order={1} className="view-dock is-focus" data-inset="bottom"><FocusPill view={state.view} options={focusOptions} onView={setView} onToggle={toggleFocus}/></Arrive>
    :<Arrive key="body-dock" ready={chromeReady} delay={bodyDelay} edge="bottom" order={3} className="view-dock" data-inset="bottom"><ViewPill view={state.view} explode={state.explode} rotate={state.rotate} lighting={lighting} onView={setView} onRotate={()=>setState(s=>({...s,rotate:!s.rotate}))} onLight={toggleLighting} onReset={reset}/></Arrive>}</AnimatePresence>
    {<Arrive ready={chromeReady&&!focused&&!lighting} delay={bodyDelay} edge="bottom" order={4} className="hint-dock"><Hint id={hintId}>{state.explode>.8?<>Drag to pan · Scroll to zoom</>:<>Drag to turn · Scroll to zoom · <b>{inspecting?`${tap} another part to switch`:`${tap} any part to learn about it`}</b></>}</Hint></Arrive>}
   </>}
  <p className="sr-only" role="status">{chromeReady?'':`Preparing the anatomy, ${progress}%`}</p>
  {error&&<div className="panel error-card" role="alert"><p className="t-body">{error}</p><button type="button" className="btn-quiet" onClick={()=>location.reload()}>Reload</button></div>}
  <AnimatePresence>{about?<AboutCard key="about" phone={phone} onClose={()=>setAbout(false)} pages={aboutPages}
   profile={session?{name:me??'',page:<Profile name={me??''} email={session.user.email??''} onSave={saveName} onSignOut={()=>void signOut()} onReview={admin?()=>{setAbout(false);setReview(true);}:undefined}/>}:null}/>:mode&&facts&&<StructureCard key="card" mode={mode} phone={phone} facts={facts} tab={tab} onTab={t=>{setTab(t);track('display_toggled',{toggle:`tab_${t}`,on:1});}}
   members={selectedParts.length>1?selectedParts.map(p=>({id:p.id,name:p.name})):[]} pins={shown.pins} pinsLoading={state.isolate&&!shown.pins.length&&!shown.error&&!!featureCounts?.pinned} pinsError={shown.error}
   pin={viewPin??null} counterpart={counterpart} pinHref={pinHref}
   menu={menuFor}
   extras={viewPin&&<FeatureExtras key={viewPin.id} spots={detail.spots} current={viewPin.proposal??null} onPick={x=>{track('pin_alternative_viewed');setAlt(x);}}
    remarks={detail.remarks} more={detail.more} onOlder={()=>void detail.older()} me={session?.user.id??null} admin={admin} onPost={postRemark} onRemove={id=>void removeRemark(id)}/>}
   onShare={async x=>{const ok=selected?await copy(pinLink(selected.id,x.id)):false;track('pin_shared',{source:'card',result:ok?'copied':'failed',published:x.kind==='published'?1:0});return ok;}}
   needsPin={shown.needsPin} kept={keptHere} me={me} onResume={r=>{const k=keptHere.find(x=>x.request===r);if(k)resume(k);}} onOpenContribute={()=>{setContributing(true);track('playground_opened',{source:'details',count:bucket(featureTotal??0)});}} onCloseContribute={()=>setContributing(false)}
 onPlace={f=>startDraft(f?{kind:'first_pin',landmark:f.id,supersedes:null,label:f.label,latin:f.latinName,description:''}:{kind:'new',landmark:null,supersedes:null,label:'',latin:'',description:''})}
   onSuggest={x=>startDraft({kind:'correction',landmark:x.id,supersedes:x.proposal??null,label:x.label,latin:x.latinName,description:x.description})}
   placeView={draft&&<PlaceSteps phone={phone} draft={draft} structure={facts?.title??''} refused={refused} state={saveState} error={saveError}
    onName={v=>setDraft(d=>d&&{...d,label:v})} onNote={v=>setDraft(d=>d&&{...d,note:v})} onSave={()=>void savePin()} onCancel={cancelDraft}/>}
   vote={x=>x.proposal?{on:votes.mine(x.proposal)===1,count:votes.count(x.proposal,x.upvotes??0)}:null} onVote={x=>void castVote(x)} voteError={votes.error}
   onLearnMore={learnMore} onClose={closeCard} onBack={()=>{if(focused)backToBody();else closeCard();}}
   onPin={id=>selectPin(id,'list')} onPinClose={()=>{setSelectedPin(null);setTab('parts');}} onHoverPin={setHoverPin}
   onMember={id=>{choosePart(id,'list');setState(s=>({...s,isolate:true}));}} onCounterpart={()=>{if(counterpart){choosePart(counterpart.id,'list');if(focused)setState(s=>({...s,isolate:true}));}}}
   onRest={setSheetRest} onMinimise={setCardMini} onContribute={source=>{seeTips('entry','features');track('playground_opened',source==='home_pin'?{source:'home_pin'}:{source:'details',count:bucket(featureTotal??0)});}}/>}</AnimatePresence>
  <AnimatePresence>{toast&&<m.div key="toast" className="panel toast" role="status" initial={{opacity:0,y:-14}} animate={{opacity:1,y:0,transition:spring.card}} exit={{opacity:0,y:-8,transition:tween('in',.16)}}>{toast}</m.div>}</AnimatePresence>
  <AnimatePresence>{review&&atlas&&<ReviewQueue key="review" structures={atlas.parts} onClose={()=>setReview(false)}
   onOpen={(mesh,landmark,proposal)=>{setReview(false);choosePart(mesh,'link');setState(s=>({...s,isolate:true,explode:0}));setDetails(true);setLinkPin(landmark);setPendingAlt(proposal);}}/>}</AnimatePresence>
  <AnimatePresence>{act&&<Dialog key="act" title={act.kind==='report'?'Report this pin':'Delete your pin?'} line={act.kind==='report'?'What’s wrong? If it’s on the wrong part, say which.':'It disappears for everyone.'} onClose={()=>setAct(null)}>
   {act.kind==='report'&&<textarea className="field note" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={3} aria-label="What’s wrong?" autoFocus={!phone}/>}
   {actError&&<p className="t-meta dialog-problem" role="alert">{actError}</p>}
   <div className="action-row"><button type="button" className="btn-quiet" onClick={()=>setAct(null)}>Cancel</button>
    {act.kind==='report'?<button type="button" className="btn-accent" disabled={reason.trim().length<3||actBusy} onClick={()=>void runAct()}>{actBusy?'Sending…':'Send'}</button>
     :<button type="button" className="btn-quiet btn-danger" disabled={actBusy} onClick={()=>void runAct()}>{actBusy?'Deleting…':'Delete'}</button>}</div>
  </Dialog>}</AnimatePresence>
  <AnimatePresence>{ask&&<SignInDialog key="sign-in" kind={ask} dark={dark} onLater={()=>{if(ask==='pin')setDraft(null);else if(ask==='vote')later.current=true;setAsk(null);}}/>}</AnimatePresence>
  <AnimatePresence>{feedbackPrompt&&<FeedbackPrompt key="feedback" phone={phone} context={feedbackContext} onClose={sent=>{setFeedbackPrompt(false);if(!sent){markFeedback('dismissed');track('feedback_dismissed',{ui_source:'prompt'});}}}/>}</AnimatePresence>
  {featureTip&&<Tip target='[data-tip-target="features"]' side={phone?'top':'left'} onDone={()=>{track('home_tip_dismissed',{tip:'features'});seeTips('entry','features');}}><strong>New: parts & features</strong>See where each part of this structure sits, or pin one that’s missing.</Tip>}
  {entryTip&&<Tip target='[data-tip-target="entry"]' side="bottom" onDone={()=>{track('home_tip_dismissed',{tip:'entry'});seeTips('entry');}}><strong>New: Playground</strong>Pin the parts & features of any structure, and vote on other people’s pins.</Tip>}
 </main></MotionConfig></LazyMotion>;
}
