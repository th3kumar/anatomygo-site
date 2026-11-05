// Search tests: bundles app/search/*.test.ts with esbuild (no test framework to install) and runs them with node:test,
// against the real atlas in models/atlas.json. Run: npm run test:search
import {build} from 'esbuild';
import {readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const dir='app/search',tests=readdirSync(dir).filter(f=>f.endsWith('.test.ts')).map(f=>join(dir,f));
const out=mkdtempSync(join(tmpdir(),'search-tests-'));
try{
 await build({entryPoints:tests,outdir:out,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'warning',
  alias:{'@':'.'},external:['node:*']});
 const files=readdirSync(out).map(f=>join(out,f));
 const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:{...process.env,ATLAS:'models/atlas.json'}});
 process.exitCode=r.status??1;
}finally{rmSync(out,{recursive:true,force:true});}
