// Read-only: the Playground (this worktree's dev server: npx vite --port 3027 in playground/; live data) tints the selected pin's shape.
import {chromium} from 'playwright-core';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});const errors=[];
try{
 const page=await b.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:3027/playground/?structure=${process.argv[3]||"FJ3384"}&pin=${process.argv[2]}`);
 await page.waitForTimeout(12000);
 await page.screenshot({path:'../.local/screenshots/pg-shape.png'});
 console.log(errors.length?'ERRORS '+errors.join(' | '):'PASS');
}finally{await b.close();}
