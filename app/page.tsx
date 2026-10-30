import {useStructurePins} from './published-pins';
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
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import AnatomyScene from './scene';
import {track,bucket,queryKind,statsEnabled,setStatsEnabled,secondsBucket,progressBucket,deviceHints,modelTransfer} from './analytics';
import {preloadStream,storedChunks} from './model-stream';
import {searchTerms,searchText} from './search-terms';
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
 const shown=useStructurePins(state.isolate&&selectedParts.length===1?selected.id:null);
 const [selectedPin,setSelectedPin]=useState<string|null>(null);const pin=shown.pins.find(p=>p.id===selectedPin);
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
 const visibleCount=atlas?.parts.filter(p=>state.isolate?state.selected.includes(p.id):state.visible.includes(p.system)||state.selected.includes(p.id)).length??0;
 const results=useMemo(()=>{if(!atlas)return[];const term=query.toLowerCase().trim();if(!term)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);return atlas.concepts.filter(c=>c.name.toLowerCase().includes(term)||c.id.toLowerCase().includes(term)).sort((a,b)=>a.name.length-b.name.length).slice(0,80);},[atlas,query]);
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
 const [returning,setReturning]=useState(false),[linkedReady,setLinkedReady]=useState(false),[sheetRest,setSheetRest]=useState(0);
 const [tab,setTab]=useState<CardTab>('about'),[hoverPin,setHoverPin]=useState<string|null>(null);
 const [focusOptions,setFocusOptions]=useState<Record<FocusToggle,boolean>>({neighbours:true,labels:true,behind:true});
 const mode:CardMode|null=!(details&&selectedParts.length>0)?null:!state.isolate?'peek':pin?'feature':'focus';
 // A structure link opens in focus, but its chrome waits until that structure has loaded (the bar under the wordmark shows the way).
 const linkWaiting=linked.length>0&&!linkedReady&&!viewReady;
 const focused=(mode==='focus'||mode==='feature')&&!linkWaiting;
 useEffect(()=>{setTab('about');setHoverPin(null);},[state.selected]);
 const clearing=useRef(0);
 const mid=useMedia('(min-width: 768px) and (max-width: 1099px)');
 // Back to the body: the card and pins leave, the camera returns, and the structure keeps its tint for 1.2 s.
 const backToBody=()=>{setSelectedPin(null);setDetails(false);setState(s=>({...s,isolate:false}));setReturning(true);const token=++clearing.current;setTimeout(()=>{if(clearing.current===token)setReturning(false);},1100);setTimeout(()=>{if(clearing.current===token)setState(s=>s.isolate?s:{...s,selected:[]});},2050);};
 const closeCard=()=>{if(focused){backToBody();return;}setDetails(false);setState(s=>({...s,selected:[],isolate:false}));};
 const learnMore=()=>{track('structure_isolated',{isolated:1,system_id:selected?.system??'concept',source:'learn_more'});setState(s=>({...s,isolate:true,explode:0,rotate:false}));};
 const toggleFocus=(k:FocusToggle)=>{setFocusOptions(o=>{track('display_toggled',{toggle:k,on:o[k]?0:1});return {...o,[k]:!o[k]};});};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape'||panel||about||lighting)return;if(mode==='feature'){setSelectedPin(null);setTab('parts');}else if(focused)backToBody();else if(mode==='peek')closeCard();};addEventListener('keydown',key);return()=>removeEventListener('keydown',key);});
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
 const chooseResult=(id:string)=>{const c=results.find(x=>x.id===id);if(!c)return;visit.current.searches++;searchSession.current.chosen=true;track('search_performed',{query_kind:queryKind(query),result_count:bucket(results.length),...(atlas?{search_terms:searchTerms(query,atlas)}:{})});choose(c,'search');};
 const tap=coarse?'Tap':'Click',inspecting=details&&selectedParts.length>0;
 // Body chrome waits for the camera to land after Back; focus chrome arrives as the Learn more move lands.
 const bodyDelay=returning?.75:0,focusDelay=phone?.7:.8;
 const sceneState={...state,inspectorOpen:inspecting,neighbours:focusOptions.neighbours,behind:focusOptions.behind,labels:(!focusOptions.labels?'off':mode==='focus'&&tab==='about'?'soft':'full') as 'off'|'soft'|'full',hoverPin,frame:`${mode}:${tab}:${focused?1:0}:${phone?sheetRest:0}`};
 const hintId=state.explode>.8?'pan':inspecting?'switch':'learn';
 const systemsBody=<SystemsBody systems={activeSystems} allSet={systemIds} counts={counts} visible={state.visible} shown={visibleCount} explode={state.explode} onPreset={applyPreset} onToggle={toggle} onOnly={showOnly} onExplode={explodeTo}/>;
 return <LazyMotion features={domMax} strict><MotionConfig reducedMotion="user"><main className={`studio ${phone?'is-phone':'is-desk'}`}>
  {atlas&&<AnatomyScene pins={shown.pins} selectedPin={selectedPin} onPinSelect={id=>{selectPin(id,'model');setDetails(true);}} atlas={atlas} light={light} dark={dark} state={sceneState} onSelect={id=>choosePart(id,'tap')} onProgress={n=>{setProgress(n);load.current.progress=n;try{sessionStorage.setItem(LOADING,progressBucket(n));}catch{}if(n===100){setError('');if(!ready.current){ready.current=true;usable.current=true;try{sessionStorage.removeItem(LOADING);}catch{}track('atlas_ready',{duration_ms:Math.round(performance.now()),load_ms:loadMs(),...modelTransfer(storedChunks()),...deviceHints()});}}}} priority={linked} onLoadingTap={t=>{if(loadingTaps.current++<30)track('loading_tap',{result:t.result,progress:progressBucket(load.current.progress),...(t.waitMs===undefined?{}:{seconds:secondsBucket(t.waitMs/1000)}),...(t.reason?{reason:t.reason}:{})});}} onMilestone={m=>{if(m==='priority')setLinkedReady(true);else if(m==='view')setViewReady(true);else{usable.current=true;try{sessionStorage.removeItem(LOADING);}catch{}track('atlas_outer_ready',{duration_ms:Math.round(performance.now()),load_ms:loadMs(),...modelTransfer(storedChunks()),...deviceHints()});}}} onPerf={p=>track('render_perf',{fps:fpsBucket(1000/p.frameMs),frame_ms:Math.round(p.frameMs*10)/10,render_ms:Math.round(p.renderMs*10)/10,...deviceHints()})} onError={failed}/>}
  <AnimatePresence>{lighting&&<LightPad key="light" light={light} onMove={setLight} onReset={()=>{track('lighting_reset');setLight(DEFAULT_LIGHT);}} onDone={closeLighting}/>}</AnimatePresence>
  {/* The header, with the intro also in web/index.html's first frame: keep the two in step. */}
  <header className="topbar" data-inset="top">
   <AnimatePresence initial={false} mode="popLayout">{focused
    ?<m.div key="back" className="back-dock" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0,transition:tween('out',.26,phone?.7:.15)}} exit={{opacity:0,transition:tween('in',.14)}}><BackButton esc={!phone&&mode==='focus'} label={phone&&mode==='feature'?facts?.title??'Back':phone?'Body':'Whole body'} onBack={()=>{if(phone&&mode==='feature'){setSelectedPin(null);setTab('parts');}else backToBody();}}/></m.div>
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
  <AnimatePresence>{panel==='search'&&<SearchPanel key="search" phone={phone} query={query} setQuery={setQuery} results={searchResults} note={query.trim()?(results.length===80?'Showing the first 80 matches. Keep typing to narrow them.':''):'Or search any named structure.'} onChoose={chooseResult} onClose={()=>setPanel(null)}/>}</AnimatePresence>
  {phone
   ?<>
    <Arrive ready={chromeReady&&!inspecting} delay={bodyDelay} edge={sideways?'left':'right'} order={1} className="view-dock is-phone" data-inset={inspecting?undefined:sideways?'left':'right'}><ViewPill vertical view={state.view} explode={state.explode} rotate={state.rotate} lighting={lighting} onView={setView} onRotate={()=>setState(s=>({...s,rotate:!s.rotate}))} onLight={toggleLighting}/></Arrive>
    {<Arrive ready={chromeReady&&!panel&&!inspecting&&!lighting} delay={inspecting||returning?bodyDelay||.1:0} edge="bottom" order={3} className="bottom-bar" data-inset={!inspecting&&!panel?'bottom':undefined}>
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
  <AnimatePresence>{mode&&facts&&<StructureCard key="card" mode={mode} phone={phone} facts={facts} tab={tab} onTab={t=>{setTab(t);track('display_toggled',{toggle:`tab_${t}`,on:1});}}
   members={selectedParts.length>1?selectedParts.map(p=>({id:p.id,name:p.name})):[]} pins={shown.pins} pinsLoading={state.isolate&&!shown.pins.length&&!shown.error&&!!featureCounts?.pinned} pinsError={shown.error}
   pin={pin??null} counterpart={counterpart} contributeHref={featureHref} pinHref={pinHref}
   onLearnMore={learnMore} onClose={closeCard} onBack={()=>{if(focused)backToBody();else closeCard();}}
   onPin={id=>selectPin(id,'list')} onPinClose={()=>{setSelectedPin(null);setTab('parts');}} onHoverPin={setHoverPin}
   onMember={id=>{choosePart(id,'list');setState(s=>({...s,isolate:true}));}} onCounterpart={()=>{if(counterpart){choosePart(counterpart.id,'list');if(focused)setState(s=>({...s,isolate:true}));}}}
   onRest={setSheetRest} onContribute={source=>{seeTips('entry','features');track('playground_opened',source==='home_pin'?{source:'home_pin'}:{source:'details',count:bucket(featureTotal??0)});}}/>}</AnimatePresence>
  <Sheet open={about} onOpenChange={setAbout}><SheetContent side={phone?'bottom':'right'} className="card about-sheet"><p className="t-meta">About</p><SheetTitle className="t-title">AnatomyGo</SheetTitle><SheetDescription className="t-body2">A 3D atlas of the adult male body, built from BodyParts3D: 2,234 pieces to explore, isolate and pin.</SheetDescription>{PLAY_PUBLIC&&<section className={`tile app-card ${appFresh?'is-fresh':''}`} aria-labelledby="app-card-title"><div className="app-card-head"><img src="/app-icon.png" alt="" width={48} height={48}/><div><h3 id="app-card-title" className="t-body">AnatomyGo for Android{appFresh&&<b className="new-tag">New</b>}</h3><p className="t-meta">The same 3D atlas as an app. Works fully offline, with no account.</p></div></div>{platform==='ios'?<p className="t-meta app-card-note">Android only for now. This site works on any device.</p>:coarse||platform==='android'?<a className="btn-accent app-card-cta" href={playUrl('site')} target="_blank" rel="noreferrer" onClick={playClicked}>Get it on Google Play<ArrowUpRight size={16}/></a>:<div className="app-card-qr"><img src="/app-qr.svg" alt="QR code for AnatomyGo on Google Play" width={104} height={104}/><div><strong className="t-body">Scan with your Android phone</strong><span className="t-meta">The camera opens the app’s Google Play page.</span><a className="link-mint" href={playUrl('site')} target="_blank" rel="noreferrer" onClick={playClicked}>Or open Google Play <ArrowUpRight size={13}/></a></div></div>}</section>}<div className="about-copy"><p className="t-body2">Made for learning. Shapes are simplified for the web, so it is not a tool for diagnosis or surgery.</p><p className="t-meta about-credits">Anatomy: BodyParts3D © DBCLS, <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">CC BY 4.0</a>. Viewer based on Human Atlas (<a href="/human-atlas-license.txt" target="_blank" rel="noreferrer">MIT</a>). <a href="/whats-new/">What’s new</a></p><section className="feedback-about" aria-labelledby="feedback-about-title"><h3 id="feedback-about-title" className="t-label">Feedback</h3><p className="t-meta">Tell us what helped, what didn’t, or what you’d like to see.</p>{aboutFeedback?<FeedbackForm source="about" context={feedbackContext} onSent={()=>markFeedback('sent')}/>:<button type="button" className="btn-quiet feedback-open" onClick={()=>{setAboutFeedback(true);track('feedback_opened',{ui_source:'about'});}}>Write feedback</button>}</section><div className="stats-choice"><span className="t-body">Share usage statistics<small className="t-meta">Counts visits, features used and how fast the model loads. Of what you type, it keeps only the anatomy words in searches, and the words of searches that find nothing.</small></span><Switch checked={stats} onCheckedChange={on=>{setStats(on);setStatsEnabled(on);}} aria-label="Share usage statistics"/></div></div></SheetContent></Sheet>
  {feedbackPrompt&&<FeedbackPrompt context={feedbackContext} onClose={sent=>{setFeedbackPrompt(false);if(!sent){markFeedback('dismissed');track('feedback_dismissed',{ui_source:'prompt'});}}}/>}
  {featureTip&&<Tip target='[data-tip-target="features"]' side={phone?'top':'left'} onDone={()=>{track('home_tip_dismissed',{tip:'features'});seeTips('entry','features');}}><strong>New: parts & features</strong>See where each part of this structure sits, or pin one that’s missing.</Tip>}
  {entryTip&&<Tip target='[data-tip-target="entry"]' side="bottom" onDone={()=>{track('home_tip_dismissed',{tip:'entry'});seeTips('entry');}}><strong>New: Playground</strong>Pin the parts & features of any structure, and vote on other people’s pins.</Tip>}
 </main></MotionConfig></LazyMotion>;
}
