// Browser check for feature shapes (lines and areas) in the explorer. Serve the built site on 3018 first:
//   npm run build:viewer && npx vite preview --host 127.0.0.1 --port 3018
// The pack is a local fixture (.local/shape-fixture.json); nothing is read from or written to the database.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('../.local/shape-fixture.json','utf8'));
const mesh='FJ3384';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const errors=[];
try{
 for(const dark of [false,true]){
  const page=await b.newPage({viewport:{width:1440,height:900},colorScheme:dark?'dark':'light'});page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|GLSL/i.test(m.text()))errors.push(m.text());});
  const geometry=await (await page.request.get('http://127.0.0.1:3018/models/playground-geometry.json')).json();
  const pack={schema:1,meshId:mesh,label:'Right scapula',geometry:geometry.geometry,pins:Object.entries(fixture).map(([label,f],i)=>({id:'shape-test-'+i,label,latinName:'',description:'Browser fixture only; never published to the database.',anchor:f.anchor,shape:f.shape}))};
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
  await page.route('**/rest/v1/rpc/pg_published_pack',r=>r.fulfill({status:200,contentType:'application/json',headers:cors,body:JSON.stringify(pack)}));
  await page.route('**/rest/v1/pg_proposals*',r=>r.fulfill({status:200,contentType:'application/json',headers:cors,body:'[]'}));
  await page.goto(`http://127.0.0.1:3018/?structure=${mesh}&isolate=1`);
  await page.waitForFunction(()=>!document.querySelector('.loading'),null,{timeout:90000});
  await page.waitForTimeout(800);
  await page.screenshot({path:`../.local/screenshots/shape-none-${dark?'dark':'light'}.png`});
  // Turn the isolated bone round to its back, where both test pins sit.
  await page.mouse.move(720,400);await page.mouse.down();for(let i=1;i<=30;i++)await page.mouse.move(720+i*14,400);await page.mouse.up();
  await page.waitForTimeout(900);
  for(const label of Object.keys(fixture)){
   await page.getByRole('button',{name:label,exact:true}).click();
   await page.waitForTimeout(1200);
   await page.screenshot({path:`../.local/screenshots/shape-${label.replace(/\W+/g,'-').toLowerCase()}-${dark?'dark':'light'}.png`});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: shapes drawn for the selected pin in light and dark; screenshots in .local/screenshots/shape-*.png');
}finally{await b.close();}
