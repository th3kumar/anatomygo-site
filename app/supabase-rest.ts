/** Reads from the public Supabase API with a time limit and one retry, so a stalled phone connection ends in an error
 * the card can show instead of loading for ever. Only network failures and server errors (5xx) are retried, once,
 * after a short pause; a cancel from the caller is never retried. */
export class RestError extends Error {constructor(message:string,readonly status:number){super(message);}}
const TIMEOUT=8000,PAUSE=600;
// RPCs this visit found missing (a migration not applied yet): asked once, then the caller goes straight to its older reads.
const missing=new Set<string>();

export function supabaseConfig(){
 const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 return url&&key?{url,key}:null;
}

/** GET `path` (a table query), or POST `body` to it (an `rpc/…` call). */
export async function rest<R>(path:string,{body,signal}:{body?:unknown;signal?:AbortSignal}={}):Promise<R>{
 const config=supabaseConfig();if(!config)throw new RestError('Supabase is not set up on this copy of the site.',0);
 if(missing.has(path))throw new RestError('HTTP 404',404);
 for(let attempt=0;;attempt++){
  const timer=new AbortController(),stop=()=>timer.abort();
  signal?.addEventListener('abort',stop,{once:true});
  const timeout=setTimeout(stop,TIMEOUT);
  try{
   const r=await fetch(`${config.url}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:timer.signal});
   if(r.ok)return await r.json() as R;
   if(r.status===404&&path.startsWith('rpc/'))missing.add(path);
   if(r.status<500||attempt)throw new RestError(`HTTP ${r.status}`,r.status);
  }catch(e){
   if(signal?.aborted)throw e;
   if(e instanceof RestError||attempt)throw e instanceof RestError?e:new RestError('Network error',0);
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',stop);}
  await new Promise(r=>setTimeout(r,PAUSE));
 }
}

/** True when the API doesn't know an RPC yet (a migration not applied), so the caller can use its older reads. */
export const missingRpc=(e:unknown)=>e instanceof RestError&&e.status===404;
