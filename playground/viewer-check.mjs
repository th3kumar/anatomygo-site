import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const seed=JSON.parse(await readFile('../public/playground-seed.json','utf8'));
const candidate=seed.proposals.find(p=>p.mesh_id==='FJ3366');
const pack={schema:1,meshId:'FJ3366',label:'Right fibula',geometry:candidate.geometry,pins:[{id:'browser-test-approved',label:'Test approved surface',latinName:'',description:'Browser fixture only; never published to the database.',anchor:{triangle:candidate.triangle,u:candidate.u,v:candidate.v}}]};
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const page=await b.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.route('**/rest/v1/rpc/pg_published_pack',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type','access-control-allow-methods':'POST,OPTIONS'},body:JSON.stringify(pack)}));
await page.goto('http://127.0.0.1:3018/?structure=FJ3366&isolate=1');
const features=page.locator('.detail-sheet a.features-action');
await features.waitFor({timeout:60000});
assert.match(await features.innerText(),/^Parts & features/);
assert.match(await features.getAttribute('href'),/structure=FJ3366&from=details$/);  // ?from= says which entry was used (removed on arrival)
assert.equal(await page.locator('.top-actions a.playground-entry').getAttribute('href'),'/playground/?from=top_bar');
await page.getByRole('button',{name:'Test approved surface',exact:true}).click();
await page.getByText('Browser fixture only; never published to the database.',{exact:true}).waitFor();
await page.waitForFunction(()=>!document.querySelector('.loading'),null,{timeout:60000});
await page.screenshot({path:'../.local/screenshots/approved-viewer.png'});
await page.getByRole('button',{name:'Show surrounding anatomy'}).click();
assert.equal(await features.count(),1,'the Playground entry stays without isolation');
assert.equal(await page.locator('.published-landmarks').count(),0);
assert.deepEqual(errors,[]);console.log('PASS: Playground entries (top bar, details), isolated viewer entry, approved pack display and biology, cleanup on leaving isolation. Feed mocked; no published data changed.');
}finally{await b.close();}
