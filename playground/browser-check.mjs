import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('../.local/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');
await page.waitForSelector('.viewer canvas',{timeout:60000});
await page.waitForFunction(()=>!document.querySelector('.public-status')?.textContent?.includes('Loading structure'));
if(await page.getByRole('button',{name:'Skip tutorial'}).isVisible())await page.getByRole('button',{name:'Skip tutorial'}).click();
await page.locator('.public-checklist button').filter({hasText:'proposal'}).first().click();
await page.getByRole('button',{name:'Label every pin'}).hover();
await page.getByRole('tooltip').waitFor();
const tooltip=await page.getByRole('tooltip').evaluate(el=>{const r=el.getBoundingClientRect();return{inside:r.left>=0&&r.right<=innerWidth,z:getComputedStyle(el).zIndex}});
assert(tooltip.inside);assert.equal(tooltip.z,'1000');
await page.screenshot({path:'../.local/screenshots/playground-desktop.png'});
await page.getByRole('button',{name:'Suggest a correction'}).click();
await page.getByLabel('Landmark name',{exact:true}).fill('Browser test draft — not submitted');
await page.getByRole('button',{name:'Save proposal',exact:true}).click();
await page.getByRole('dialog',{name:'Sign in to contribute'}).waitFor();
assert.equal(await page.getByLabel('Landmark name',{exact:true}).inputValue(),'Browser test draft — not submitted');
await page.getByRole('button',{name:'Close dialog',exact:true}).click();
await page.reload();await page.waitForSelector('.viewer canvas',{timeout:60000});
assert.equal(await page.getByLabel('Landmark name',{exact:true}).inputValue(),'Browser test draft — not submitted');
page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Discard',exact:true}).click();
await page.getByRole('button',{name:'Structure',exact:true}).click();
await page.getByRole('textbox',{name:'Search structures'}).fill('FJ1252');
await page.locator('.structure-results button').first().click();
await page.waitForFunction(()=>document.querySelector('.identity-meta')?.textContent==='Gingiva of upper jaw');
await page.getByText('No landmarks added yet.',{exact:false}).waitFor();
await page.getByRole('button',{name:'Add landmark',exact:true}).click();
await page.getByLabel('Landmark name',{exact:true}).fill('Unplaced sample');
assert(await page.getByRole('button',{name:'Save proposal',exact:true}).isDisabled());
// Exercise the production surface picker on a previously empty structure, without saving.
const free=await page.evaluate(()=>({left:document.querySelector('.checklist-panel')?.getBoundingClientRect().right??0,right:document.querySelector('.landmark-card')?.getBoundingClientRect().left??innerWidth,top:130,bottom:innerHeight-100}));
let placed=false;
for(const fy of [.5,.4,.6,.3,.7]) { for(const fx of [.5,.4,.6,.3,.7]) {
 await page.mouse.click(free.left+(free.right-free.left)*fx,free.top+(free.bottom-free.top)*fy);
 if(await page.getByRole('button',{name:'Save proposal',exact:true}).isEnabled()){placed=true;break;}
} if(placed)break; }
assert(placed,'a surface click should place a new pin');

await page.getByRole('button',{name:'Discard',exact:true}).click();
await page.setViewportSize({width:390,height:844});
await page.goto('http://127.0.0.1:3018/playground/?structure=FJ3366');
await page.waitForSelector('.viewer canvas',{timeout:60000});await page.locator('.public-checklist button').filter({hasText:'proposal'}).first().click();
await page.screenshot({path:'../.local/screenshots/playground-mobile.png'});
await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'../.local/screenshots/playground-mobile-dark.png'});
const railClear=await page.evaluate(()=>document.querySelector('.view-rail').getBoundingClientRect().bottom<document.querySelector('.landmark-card').getBoundingClientRect().top);assert(railClear,'mobile controls must stay above the inspector');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.equal(await page.getByRole('button',{name:'Open on device',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS: live catalogue, imported pins, tooltip layering, sign-in gate, draft recovery, empty structure, mobile layout. No database mutations.');
} finally { await browser.close(); }
