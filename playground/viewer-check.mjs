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
await page.waitForTimeout(500);assert.equal(await page.locator('.tip-card').count(),0,'coach marks are off: no homepage tips');
assert.equal(await page.locator('.playground-entry .new-tag').count(),1,'"New" until the Playground is opened');
await page.getByRole('button',{name:'Test approved surface',exact:true}).click();
await page.getByText('Browser fixture only; never published to the database.',{exact:true}).waitFor();
await page.waitForFunction(()=>!document.querySelector('.loading'),null,{timeout:60000});
await page.screenshot({path:'../.local/screenshots/approved-viewer.png'});
// Community pins (live, read-only): one per remaining feature, marked as not reviewed, each linking to that pin in the Playground.
const community=page.locator('.published-landmarks>button').filter({has:page.locator('.pin-chip')});
await community.first().waitFor({timeout:30000});
assert.equal(await page.getByRole('button',{name:'Test approved surface',exact:true}).locator('.pin-chip').count(),0,'published pins carry no chip');
await community.first().click();assert.match(await page.locator('.pin-byline').innerText(),/not yet reviewed/);
const pinLink=await page.locator('.pin-check').getAttribute('href');
assert.match(pinLink,/^\/playground\/\?structure=FJ3366&pin=[0-9a-f-]{36}&from=home_pin$/);
await page.getByRole('button',{name:'Show surrounding anatomy'}).click();
assert.equal(await features.count(),1,'the Playground entry stays without isolation');
assert.equal(await page.locator('.published-landmarks').count(),0);
// Without isolation the panel says how many features are pinned, and shows them on request.
const offer=page.locator('.pins-offer');await offer.waitFor();assert.match(await offer.innerText(),/features? (is|are) pinned/);
await offer.getByRole('button',{name:'Show on model'}).click();await page.locator('.published-landmarks').waitFor();
assert.equal(await page.locator('.pins-offer').count(),0,'the offer goes once the pins are shown');
await page.evaluate(()=>localStorage.setItem('anatomygo.playground.visited','1'));await page.reload();
await page.locator('.top-actions a.playground-entry').waitFor();assert.equal(await page.locator('.playground-entry .new-tag').count(),0,'opening the Playground clears "New"');
// The pin link opens that pin in the Playground, not as "Shared with you".
await page.goto(`http://127.0.0.1:3018${pinLink}`);await page.locator('.pg-card').waitFor({timeout:60000});
assert.equal(await page.locator('.pg-shared').count(),0,'a homepage pin link is not shown as shared');assert.doesNotMatch(page.url(),/pin=|from=/);
assert.deepEqual(errors,[]);console.log('PASS: Playground entries (top bar, details, no tips, "New" until visited), isolated viewer entry, approved pack display and biology, community pins (not reviewed, link to the pin), pins offer, cleanup on leaving isolation. Feed mocked; no published data changed.');
}finally{await b.close();}
