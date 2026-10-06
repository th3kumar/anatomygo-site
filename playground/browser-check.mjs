import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('../.local/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const desk=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
const page=await desk.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
let leaveGuard=0;page.on('dialog',d=>{if(d.type()==='beforeunload'){leaveGuard++;d.accept();return;}errors.push(`native ${d.type()} dialog: ${d.message()}`);d.dismiss();});
const loaded=()=>page.waitForFunction(()=>document.querySelector('.viewer canvas')&&!document.querySelector('.stage-loading'),null,{timeout:60000});
try {
await page.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');
await loaded();
// First visit: coach marks are off, so nothing is shown and the homepage learns the Playground was opened.
await page.waitForTimeout(1500);assert.equal(await page.locator('.coach-layer, .coach-card').count(),0,'a first visit is free exploring');
assert.equal(await page.evaluate(()=>localStorage.getItem('anatomygo.playground.visited')),'1');
// "How it works" starts a hands-on practice. Each step waits for the real action; nothing is sent to the database.
const writes=[];page.on('request',r=>{if(/\/rpc\/pg_(submit|vote|withdraw|comment|report)(\?|$)/.test(r.url()))writes.push(r.url());});
const stepIs=t=>page.locator('.coach-card h2',{hasText:t}).waitFor({timeout:15000});
await page.getByRole('button',{name:'How it works'}).click();await stepIs('Add your own');
assert.deepEqual(await page.evaluate(()=>['Show neighbouring structures','Show pins behind the surface'].map(l=>document.querySelector(`.view-rail [aria-label="${l}"]`)?.getAttribute('aria-pressed'))),['true','true'],'practice shows neighbours and pins behind');
await page.locator('.pg-list .item').first().click({force:true});assert.equal(await page.locator('.pg-card').count(),0,'saved features cannot be opened during practice');
await page.locator('[data-coach="add"]').click();await stepIs('Place the pin');
const area=await page.locator('.pg-stage-free').boundingBox();let pinned=false;
for(const fy of [.5,.4,.6,.3,.7]){for(const fx of [.5,.45,.55,.4,.6]){await page.mouse.click(area.x+area.width*fx,area.y+area.height*fy);if(await page.locator('.pg-step.done').count()){pinned=true;break;}}if(pinned)break;}
assert(pinned,'practice pin placed on the model');
await stepIs('Save it');assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'My practice pin');
await page.getByRole('button',{name:'Save pin',exact:true}).click();
await stepIs('Vote');assert.equal(await page.getByRole('dialog',{name:'Sign in to save'}).count(),0,'practice needs no sign-in');
assert.equal(await page.getByRole('button',{name:'Share this pin'}).count(),0,'the practice pin cannot be shared');
await page.getByRole('button',{name:'Yes, it’s right'}).click();
await stepIs('Delete it');await page.getByRole('button',{name:'More options'}).click();await page.getByRole('menuitem',{name:'Delete my pin'}).click();
await page.getByRole('dialog',{name:'Delete your pin?'}).getByRole('button',{name:'Delete pin',exact:true}).click();
await stepIs('You’re ready');await page.getByRole('button',{name:'Start exploring',exact:true}).click();
await page.locator('.coach-layer').waitFor({state:'detached',timeout:2000});  // after its fade-out
assert.equal(await page.locator('.pg-list .item',{hasText:'My practice pin'}).count(),0,'the practice pin goes when practice ends');
assert.deepEqual(writes,[],'practice never writes to the database');
await page.reload();await loaded();await page.waitForTimeout(800);
assert.equal(await page.locator('.coach-card').count(),0,'practice never starts by itself');
await page.locator('.pg-list .item').filter({hasText:/\d pins?$/}).first().click();
await page.locator('[data-hint="vote"]').waitFor();await page.waitForTimeout(500);
assert.equal(await page.locator('.coach-card').count(),0,'no one-time vote hint');
await page.getByRole('button',{name:'Label every pin'}).hover();
await page.getByRole('tooltip').waitFor();
const tooltip=await page.getByRole('tooltip').evaluate(el=>{const r=el.getBoundingClientRect();return{inside:r.left>=0&&r.right<=innerWidth,z:getComputedStyle(el).zIndex}});
assert(tooltip.inside);assert.equal(tooltip.z,'1000');
await page.screenshot({path:'../.local/screenshots/playground-desktop.png'});
// Sharing: the card copies a link to that pin; opening it (signed out, first visit) shows the pin, and no practice afterwards.
await page.getByRole('button',{name:'Share this pin'}).click();
const shared=await page.evaluate(()=>navigator.clipboard.readText());
assert.match(shared,/\/playground\/\?structure=FJ3366&pin=[0-9a-f-]{36}&from=share$/);
const visitor=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();visitor.on('pageerror',e=>errors.push(e.message));
await visitor.goto(shared.replace(/^https?:\/\/[^/]+/,'http://127.0.0.1:3018'));
await visitor.locator('.pg-shared').waitFor({timeout:60000});assert.equal(await visitor.locator('.coach-layer').count(),0,'a shared link skips the practice');
await visitor.getByRole('button',{name:'Close',exact:true}).click();await visitor.waitForTimeout(800);
assert.equal(await visitor.locator('.pg-offer, .coach-layer').count(),0,'no practice offer after a shared pin');await visitor.close();
// A pin's floating name opens that feature.
const named=page.locator('.labels .pin-label').filter({hasNotText:'behind'}).last();const label=await named.innerText();
await named.click();await page.waitForFunction(t=>document.querySelector('.pg-card .pg-title')?.textContent===t,label);
await page.getByRole('button',{name:'Suggest a better spot'}).click();
await page.getByLabel('Name',{exact:true}).fill('Browser test draft — not submitted');
await page.getByRole('button',{name:'Save pin',exact:true}).click();
await page.getByRole('dialog',{name:'Sign in to save'}).waitFor();
// Sign-in shows Google's own button; its fallback runs in a small Google window. This page and its draft stay put. (No account is used.)
await page.locator('.pg-google-slot iframe').waitFor({state:'attached',timeout:20000});  // Google's own button, naming this site
await page.getByRole('button',{name:/Trouble signing in/}).click();
const [google]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Continue with Google',exact:true}).click()]);
await google.waitForURL(/accounts\.google\.com|\/auth\/v1\/authorize/,{timeout:30000});await google.close();
await page.getByText('Finish signing in in the Google window.',{exact:false}).waitFor();
assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Browser test draft — not submitted');
await page.getByRole('dialog',{name:'Sign in to save'}).getByRole('button',{name:'Close',exact:true}).click();
await page.reload();await loaded();assert.equal(leaveGuard,1,'leaving with an unsaved pin asks first');
assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Browser test draft — not submitted');
await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.getByRole('dialog',{name:'Discard your pin?'}).getByRole('button',{name:'Discard',exact:true}).click();
await page.getByRole('button',{name:/Find a structure/}).click();
await page.getByRole('combobox',{name:'Search structures'}).fill('FJ1252');
await page.locator('.pg-finder [role=option]').first().click();
await page.waitForFunction(()=>document.querySelector('.pg-identity h1')?.textContent==='Gingiva of upper jaw');
await loaded();
await page.getByText('Nothing pinned here yet.',{exact:true}).waitFor();
await page.getByRole('button',{name:'Add the first feature',exact:true}).click();
await page.getByLabel('Name',{exact:true}).fill('Unplaced sample');
assert(await page.getByRole('button',{name:'Save pin',exact:true}).isDisabled());
// Exercise the production surface picker on a previously empty structure, without saving.
const free=await page.evaluate(()=>({left:document.querySelector('.pg-checklist')?.getBoundingClientRect().right??0,right:document.querySelector('.pg-card')?.getBoundingClientRect().left??innerWidth,top:130,bottom:innerHeight-100}));
let placed=false;
for(const fy of [.5,.4,.6,.3,.7]) { for(const fx of [.5,.4,.6,.3,.7]) {
 await page.mouse.click(free.left+(free.right-free.left)*fx,free.top+(free.bottom-free.top)*fy);
 if(await page.getByRole('button',{name:'Save pin',exact:true}).isEnabled()){placed=true;break;}
} if(placed)break; }
assert(placed,'a surface click should place a new pin');
await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.getByRole('dialog',{name:'Discard your pin?'}).getByRole('button',{name:'Discard',exact:true}).click();
assert.equal(await page.locator('.pg-draft').count(),0);

// Phone: a fresh visitor on a touch screen.
const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));
const mobileLoaded=()=>mobile.waitForFunction(()=>document.querySelector('.viewer canvas')&&!document.querySelector('.stage-loading'),null,{timeout:60000});
const inView=sel=>mobile.locator(sel).first().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight});
await mobile.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');await mobileLoaded();
await mobile.waitForTimeout(1500);assert.equal(await mobile.locator('.coach-layer').count(),0,'a first visit on a phone is free exploring too');
await mobile.getByRole('button',{name:'Menu',exact:true}).tap();await mobile.getByRole('menuitem',{name:'How it works'}).tap();
await mobile.locator('.coach-card').waitFor();assert(await inView('.coach-card'),'the practice card stays on screen');
await mobile.locator('.coach-card h2',{hasText:'Add your own'}).waitFor();
await mobile.getByRole('button',{name:'Skip tutorial'}).tap();
await mobile.locator('.coach-layer').waitFor({state:'detached',timeout:2000});  // practice can be skipped on a phone
assert.equal(await mobile.locator('.pg-checklist').count(),0,'the list starts as a bar so the model is visible');
await mobile.locator('.pg-tab-open').tap();
await mobile.locator('.pg-list .item').filter({hasText:/\d pins?$/}).first().tap();
await mobile.locator('.pg-card').waitFor();
assert.equal(await mobile.locator('.pg-checklist, .pg-list-tab').count(),0,'one sheet at a time');
assert(await mobile.evaluate(()=>document.querySelector('.pg-card').getBoundingClientRect().top>innerHeight*.35),'the model keeps the top of the screen');
await mobile.screenshot({path:'../.local/screenshots/playground-mobile.png'});
await mobile.emulateMedia({colorScheme:'dark'});await mobile.screenshot({path:'../.local/screenshots/playground-mobile-dark.png'});
assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.equal(await mobile.getByRole('button',{name:'Open on device',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS: live catalogue, quiet first visit, hands-on practice on request (no database writes), pin sharing, clickable pin names, Google button and sign-in window, phone tour and sheets, imported pins, tooltip layering, sign-in gate, draft recovery, in-app discard, structure finder, empty structure, surface placement. No database mutations.');
} finally { await browser.close(); }
