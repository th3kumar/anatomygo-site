// Live read-only check: real community pins with shapes from the production database. BASE=https://anatomygo.in to test the live site (default: local build on 3018).
const BASE=process.env.BASE||'http://127.0.0.1:3018';
import {chromium} from 'playwright-core';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const errors=[];
try{
 for(const [mesh,labels,turn] of [['FJ3384',['Infraspinous fossa','Lateral (Axillary) border','Upper lip'],true],['FJ3152',['Iliac crest','Gluteal surface','Acetabular margin'],false],['FJ3375',['Alveolar process of maxilla','Infraorbital margin'],false]]){
  const page=await b.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${BASE}/?structure=${mesh}&isolate=1`);
  await page.waitForFunction(()=>!document.querySelector('.loading'),null,{timeout:90000});
  await page.locator('.published-landmarks>button').first().waitFor({timeout:30000});
  if(turn){await page.mouse.move(720,400);await page.mouse.down();for(let i=1;i<=30;i++)await page.mouse.move(720+i*14,400);await page.mouse.up();}
  for(const label of labels){
   await page.getByRole('button',{name:new RegExp('^'+label.replace(/[()]/g,'\\$&'))}).first().click();await page.waitForTimeout(1200);
   await page.screenshot({path:`../.local/screenshots/live-${mesh}-${label.replace(/\W+/g,'-').toLowerCase()}.png`});
  }
  await page.close();
 }
 console.log(errors.length?'ERRORS '+errors.join(' | '):'PASS: live shapes rendered');
}finally{await b.close();}
