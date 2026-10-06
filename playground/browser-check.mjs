import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('../.local/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
let leaveGuard=0;page.on('dialog',d=>{if(d.type()==='beforeunload'){leaveGuard++;d.accept();return;}errors.push(`native ${d.type()} dialog: ${d.message()}`);d.dismiss();});
const loaded=()=>page.waitForFunction(()=>document.querySelector('.viewer canvas')&&!document.querySelector('.stage-loading'),null,{timeout:60000});
try {
await page.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');
await loaded();
// First visit: a three-step spotlight tour, one control at a time.
await page.locator('.coach-card').waitFor();
assert.equal(await page.locator('.coach-count').innerText(),'1 OF 3');
assert(await page.locator('.coach-hole').isVisible(),'the tour lights its target');
await page.getByRole('button',{name:'Skip',exact:true}).click();
assert.equal(await page.locator('.coach-card').count(),0);
await page.reload();await loaded();await page.waitForTimeout(800);
assert.equal(await page.locator('.coach-card').count(),0,'the tour shows once');
await page.locator('.pg-list .item').filter({hasText:/\d pins?$/}).first().click();
await page.locator('[data-hint="vote"]').waitFor();
await page.getByRole('button',{name:'Label every pin'}).hover();
await page.getByRole('tooltip').waitFor();
const tooltip=await page.getByRole('tooltip').evaluate(el=>{const r=el.getBoundingClientRect();return{inside:r.left>=0&&r.right<=innerWidth,z:getComputedStyle(el).zIndex}});
assert(tooltip.inside);assert.equal(tooltip.z,'1000');
await page.screenshot({path:'../.local/screenshots/playground-desktop.png'});
await page.getByRole('button',{name:'Suggest a better spot'}).click();
await page.getByLabel('Name',{exact:true}).fill('Browser test draft — not submitted');
await page.getByRole('button',{name:'Save pin',exact:true}).click();
await page.getByRole('dialog',{name:'Sign in to save'}).waitFor();
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
await page.getByText('No landmarks here yet.',{exact:true}).waitFor();
await page.getByRole('button',{name:'Add the first landmark',exact:true}).click();
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

await page.setViewportSize({width:390,height:844});
await page.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');
await loaded();await page.locator('.pg-list .item').filter({hasText:/\d pins?$/}).first().click();
await page.screenshot({path:'../.local/screenshots/playground-mobile.png'});
await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'../.local/screenshots/playground-mobile-dark.png'});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.equal(await page.getByRole('button',{name:'Open on device',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS: live catalogue, one-time tour, imported pins, tooltip layering, sign-in gate, draft recovery, in-app discard, structure finder, empty structure, surface placement. No database mutations.');
} finally { await browser.close(); }
