// Runs after the build. Reads the live pins from Supabase and writes the files that search engines and AI assistants
// read: llms.txt (a short guide to the site), llms-full.txt (every pinned feature in plain text), a dated sitemap, and
// the current pin counts in dist/index.html (meta description, structured data, and a short text for crawlers) and in
// dist/whats-new/index.html (counts, date, the muscle list and its structured data).
// The pins are only drawn by JavaScript in the 3D viewer, so without this crawlers never see them.
// Locally and in the PR check, a failed read leaves the build as it is. The deploy sets SEO_STRICT=1, so a failed
// read fails it and a deploy never ships without the pin text.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url)),dist=`${root}dist/`,SITE='https://anatomygo.in';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});

async function env(){
 let url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)for(const f of ['playground/.env.local','playground/.env']){try{for(const line of (await readFile(root+f,'utf8')).split('\n')){const m=line.match(/^(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)=(.*)$/);if(m&&m[1]==='VITE_SUPABASE_URL')url??=m[2].trim();if(m&&m[1]==='VITE_SUPABASE_PUBLISHABLE_KEY')key??=m[2].trim();}}catch{}}
 if(key?.startsWith('sb_secret_'))throw Error('Use only a publishable key');
 return {url,key};
}
async function rows(base,key,path){
 const out=[];for(let offset=0;;offset+=1000){const r=await fetch(`${base}/rest/v1/${path}&limit=1000&offset=${offset}`,{headers:{apikey:key}});if(!r.ok)throw Error(`${path.split('?')[0]}: HTTP ${r.status}`);const page=await r.json();out.push(...page);if(page.length<1000)return out;}
}
const clean=s=>(s??'').replace(/\s+/g,' ').trim();
// "Acromial part of left deltoid" and "Right femur" become "Acromial part of deltoid" and "Femur": one entry for both sides.
const unsided=name=>{const s=name.replace(/\b(left|right) /i,'');return s[0].toUpperCase()+s.slice(1);};
const roles=shape=>{const s=JSON.stringify(shape??'');return {origin:s.includes('"origin"'),insertion:s.includes('"insertion"')};};

async function load(){
 const {url,key}=await env();if(!url||!key)throw Error('No Supabase URL or publishable key');
 const [pins,features]=await Promise.all([rows(url,key,'pg_proposals?select=landmark_id,mesh_id,shape&status=eq.community&order=id'),rows(url,key,'pg_landmarks?select=id,mesh_id,label,latin_name,description&archived=eq.false&order=id')]);
 const meshes=[...new Set(pins.map(p=>p.mesh_id))];
 const structures=meshes.length?await rows(url,key,`pg_structures?select=id,name,system&id=in.(${meshes.map(encodeURIComponent).join(',')})&order=id`):[];
 return {pins,features,structures};
}

/** Groups the pinned features by structure, with left and right merged. A feature is listed only when it has a pin and a
 * real description (40+ characters), which keeps out test and half-written contributions. */
function summarise({pins,features,structures}){
 const names=new Map(structures.map(s=>[s.id,s])),pinned=new Map();
 for(const p of pins){const r=roles(p.shape),had=pinned.get(p.landmark_id)??{origin:false,insertion:false};pinned.set(p.landmark_id,{origin:had.origin||r.origin,insertion:had.insertion||r.insertion});}
 const groups=new Map();
 for(const f of features){
  const s=names.get(f.mesh_id),role=pinned.get(f.id);if(!s||!role)continue;
  const g=groups.get(unsided(s.name))??{name:unsided(s.name),system:s.system,meshes:new Map(),features:new Map()};groups.set(g.name,g);
  g.meshes.set(s.id,s.name);
  const description=clean(f.description);if(description.length<40)continue;
  const label=clean(f.label),k=label.toLowerCase(),had=g.features.get(k);
  const kind=role.origin||/^origin\b/i.test(label)?'origin':role.insertion||/^insertion\b/i.test(label)?'insertion':'feature';
  if(!had||description.length>had.description.length)g.features.set(k,{label,latin:clean(f.latin_name),description,kind});
 }
 const order={muscular:0,skeletal:1};
 const list=[...groups.values()].filter(g=>g.features.size).sort((a,b)=>(order[a.system]??2)-(order[b.system]??2)||a.name.localeCompare(b.name));
 const featureIds=new Set(features.filter(f=>pinned.has(f.id)&&names.has(f.mesh_id)).map(f=>f.id));
 const stats={pins:pins.filter(p=>featureIds.has(p.landmark_id)).length,features:featureIds.size,structures:new Set(features.filter(f=>featureIds.has(f.id)).map(f=>f.mesh_id)).size,
  origins:[...pinned].filter(([id,r])=>featureIds.has(id)&&r.origin).length,insertions:[...pinned].filter(([id,r])=>featureIds.has(id)&&r.insertion).length,
  muscles:list.filter(g=>g.system==='muscular').map(g=>g.name)};
 return {list,stats};
}

const link=id=>`${SITE}/?structure=${encodeURIComponent(id)}&isolate=1`;
const n=x=>x.toLocaleString('en-US');
const sides=g=>[...g.meshes].sort(([,a],[,b])=>a.localeCompare(b)).map(([id,name])=>`[${name}](${link(id)})`).join(' · ');

function llms({list,stats}){
 const muscles=list.filter(g=>g.system==='muscular'),others=list.filter(g=>g.system!=='muscular');
 return `# AnatomyGo

> AnatomyGo (${SITE}) is a free 3D human anatomy atlas that runs in the browser, with no sign-up. It has 2,234 modelled bones, muscles, organs, vessels and nerves from BodyParts3D, plus ${n(stats.pins)} pins that mark ${n(stats.features)} named landmarks and features on ${n(stats.structures)} structures, including the origin and insertion areas of ${n(stats.muscles.length)} muscles. Built for medical, physiotherapy, nursing, dental and allied-health students and their teachers.

## What makes it different

- **Landmarks on the real 3D shape.** Each pin sits on the exact spot of the model: tubercles, foramina, fossae, lines and borders, each with a short description. Lines and areas are drawn as shapes, not only as points.
- **Muscle origins and insertions as areas.** Muscles show where they attach: origins in red, insertions in blue, together with the bone landmark they attach to.
- **Placed by measurement and checked against sources.** Most pins were placed by measuring the 3D model (joint lines, sutures, borders and contact with neighbouring structures) and checked against published anatomy references such as Gray's Anatomy, TeachMeAnatomy and peer-reviewed measurement studies. Every pin stays open to community review, and the app marks pins that have not been reviewed yet.
- **Free and open.** Free on the web and on Android (Google Play). The 3D model is BodyParts3D (CC BY-SA 2.1 Japan, Database Center for Life Science).

## How to link to a structure

Link to \`${SITE}/?structure=<ID>&isolate=1\`. The 3D explorer opens on that structure, shown on its own with its pins. The IDs are listed below.

## Muscles with mapped origins and insertions

${muscles.map(g=>`- ${g.name}: ${sides(g)}`).join('\n')}

## Bones and other structures with pinned landmarks

${others.map(g=>`- ${g.name} (${g.features.size} ${g.features.size===1?'feature':'features'}): ${sides(g)}`).join('\n')}

## More

- [Every pinned feature with its description](${SITE}/llms-full.txt)
- [What's new](${SITE}/whats-new/): every muscle's origin and insertion, and dated updates
- [Playground](${SITE}/playground/): see the features of each structure and vote on or suggest pin placements
- [Android app](https://play.google.com/store/apps/details?id=com.anatomygo)

Updated ${today}.
`;
}

function llmsFull({list,stats}){
 const block=g=>{
  const fs=[...g.features.values()],head=[`## ${g.name}`,'',`Open in 3D: ${sides(g)}`,''];
  const lines=kind=>fs.filter(f=>f.kind===kind).map(f=>`- **${f.label}**${f.latin?` (${f.latin})`:''} — ${f.description}`);
  const parts=[['Origins','origin'],['Insertions','insertion'],[g.system==='muscular'?'Other features':'Landmarks and features','feature']].map(([t,k])=>{const l=lines(k);return l.length?`### ${t}\n\n${l.join('\n')}\n`:'';}).filter(Boolean);
  return [...head,...parts].join('\n');
 };
 return `# AnatomyGo: pinned anatomy features

> Every landmark, origin and insertion pinned on the AnatomyGo 3D atlas (${SITE}), in plain text. ${n(stats.pins)} pins on ${n(stats.features)} features of ${n(stats.structures)} structures, updated ${today}. Each structure links to the free 3D explorer, which opens on that structure with its pins. Left and right sides are listed together. Most pins were placed by measuring the 3D model and checked against published anatomy references; all pins stay open to community review.

${list.map(block).join('\n')}
`;
}

const sitemap=()=>`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}/playground/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}/whats-new/</loc><lastmod>${today}</lastmod></url>
</urlset>
`;

const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const round=x=>x>=100?`${n(Math.floor(x/50)*50)}+`:n(x);
const swap=(s,re,to)=>{if(!re.test(s))throw Error(`HTML: ${re} not found`);return s.replace(re,to);};
// Bing reports a meta description outside 25–160 characters as an error, and search results cut longer ones off.
function checkDescription(html,page){const d=html.match(/<meta name="description" content="([^"]*)"/)?.[1];const len=d===undefined?0:d.replace(/&[a-z]+;|&#\d+;/g,'x').length;if(len<25||len>160)throw Error(`${page}: meta description is ${len} characters; keep it between 25 and 160`);return html;}
const ldJson=data=>`<!--seo:data--><script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script><!--/seo:data-->`;
function homepage(html,{stats}){
 const description=`Free 3D human anatomy atlas: 2,234 structures, ${round(stats.features)} pinned landmarks, and muscle origins and insertions. In your browser, no sign-up.`;
 const data={'@context':'https://schema.org','@graph':[
  {'@type':'WebSite','@id':`${SITE}/#website`,name:'AnatomyGo',alternateName:'Anatomy Go',url:`${SITE}/`,inLanguage:'en'},
  {'@type':'WebApplication','@id':`${SITE}/#app`,name:'AnatomyGo',url:`${SITE}/`,description,applicationCategory:'EducationalApplication',operatingSystem:'Any (web browser with WebGL)',isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},
   audience:{'@type':'EducationalAudience',educationalRole:'student',audienceType:'Medical, physiotherapy, nursing, dental and allied-health students and teachers'},
   about:[{'@type':'Thing',name:'Human anatomy'},{'@type':'Thing',name:'Anatomical landmarks'},{'@type':'Thing',name:'Muscle origins and insertions'}],
   featureList:['2,234 modelled structures from BodyParts3D',`${n(stats.pins)} pins on ${n(stats.features)} anatomical landmarks and features`,`Origin and insertion areas of ${n(stats.muscles.length)} muscles`,'Isolate, hide and explode any structure','Free, no sign-up'],
   sameAs:['https://play.google.com/store/apps/details?id=com.anatomygo'],dateModified:today}]};
 const about=`<section class="sr-only" aria-label="About AnatomyGo"><h2>Pinned landmarks, origins and insertions</h2><p>${n(stats.pins)} pins mark ${n(stats.features)} landmarks and features on ${n(stats.structures)} structures, each placed on the 3D model and described. Muscle origins are shown in red and insertions in blue. Most pins were placed by measuring the model and checked against published anatomy references, and every pin stays open to community review.</p><p>Muscles with mapped origins and insertions: ${esc(stats.muscles.join(', '))}. <a href="/whats-new/#origins-insertions">See each muscle's origin and insertion</a>.</p></section>`;
 html=swap(html,/<meta name="description" content="[^"]*"\/>/,`<meta name="description" content="${esc(description)}"/>`);
 html=swap(html,/<meta property="og:description" content="[^"]*"\/>/,`<meta property="og:description" content="${esc(description)}"/>`);
 html=swap(html,/<!--seo:data-->[\s\S]*?<!--\/seo:data-->/,ldJson(data));
 return swap(html,/<!--seo:about-->[\s\S]*?<!--\/seo:about-->/,`<!--seo:about-->${about}<!--/seo:about-->`);
}

// The short names students search for, in place of the atlas's part names.
const COMMON={'Clavicular part of deltoid':'Anterior deltoid','Acromial part of deltoid':'Middle deltoid','Spinal part of deltoid':'Posterior deltoid',
 'Descending part of trapezius':'Upper trapezius','Ascending part of trapezius':'Lower trapezius','Clavicular part of pectoralis major':'Pectoralis major, clavicular head',
 'Sternocostal part of pectoralis major':'Pectoralis major, sternocostal head','Long head of biceps brachii':'Biceps brachii, long head'};
const cap=s=>s[0].toUpperCase()+s.slice(1);
/** One row per muscle: its name, origin → insertion, linking to the right side in 3D. */
function muscleRows(list){
 const rows=list.filter(g=>g.system==='muscular').map(g=>{
  const fs=[...g.features.values()],name=COMMON[g.name]??g.name;
  const part=kind=>fs.filter(f=>f.kind===kind).map(f=>f.label.replace(/^(origin|insertion):\s*/i,'')).join('; ');
  const meshes=[...g.meshes],[id]=meshes.find(([,m])=>/\bright\b/i.test(m))??meshes[0];
  const from=part('origin'),to=part('insertion');
  return {name,html:`<li><a href="/?structure=${encodeURIComponent(id)}&amp;isolate=1"><div class="name">${esc(name)}</div><div class="attach">${from?`<span class="from">${esc(cap(from))}</span>`:''}${to?`<span class="to">${esc(cap(to))}</span>`:''}</div></a></li>`};
 });
 return `<ol class="muscles">${rows.sort((a,b)=>a.name.localeCompare(b.name)).map(r=>r.html).join('')}</ol>`;
}
const strip=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function whatsNew(html,{list,stats}){
 const counts={pins:n(stats.pins),muscles:n(stats.muscles.length)};
 for(const [k,v] of Object.entries(counts))html=swap(html,new RegExp(`(<span data-count="${k}">)[^<]*(</span>)`,'g'),`$1${v}$2`);
 const date=new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 html=swap(html,/<time data-count="updated" datetime="[^"]*">[^<]*<\/time>/,`<time data-count="updated" datetime="${today}">${date}</time>`);
 html=swap(html,/<!--seo:muscles-->[\s\S]*?<!--\/seo:muscles-->/,`<!--seo:muscles-->${muscleRows(list)}<!--/seo:muscles-->`);
 const data={'@context':'https://schema.org','@type':'WebPage','@id':`${SITE}/whats-new/#page`,url:`${SITE}/whats-new/`,name:"What's new in AnatomyGo",
  description:strip(html.match(/<p class="summary">([\s\S]*?)<\/p>/)?.[1]??''),inLanguage:'en',datePublished:'2026-10-30',dateModified:today,isPartOf:{'@id':`${SITE}/#website`},about:{'@id':`${SITE}/#app`}};
 return swap(html,/<!--seo:data-->[\s\S]*?<!--\/seo:data-->/,ldJson(data));
}

try{
 const summary=summarise(await load());
 if(!summary.list.length)throw Error('No pinned features found');
 await writeFile(`${dist}llms.txt`,llms(summary));
 await writeFile(`${dist}llms-full.txt`,llmsFull(summary));
 await writeFile(`${dist}sitemap.xml`,sitemap());
 await writeFile(`${dist}index.html`,checkDescription(homepage(await readFile(`${dist}index.html`,'utf8'),summary),'index.html'));
 await writeFile(`${dist}whats-new/index.html`,checkDescription(whatsNew(await readFile(`${dist}whats-new/index.html`,'utf8'),summary),'whats-new/index.html'));
 const {stats}=summary;console.log(`SEO files: ${n(stats.pins)} pins, ${n(stats.features)} features, ${n(stats.structures)} structures, ${stats.muscles.length} muscles, ${summary.list.length} entries in llms.txt`);
}catch(e){
 if(process.env.SEO_STRICT)throw e;
 console.warn(`SEO files skipped: ${e.message}. dist/ keeps the static versions from public/ and web/index.html.`);
}
