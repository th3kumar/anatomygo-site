/** Signed-in Supabase, loaded only when it is needed: on a vote, Contribute or Account, or straight away when this
 * browser already holds a session (from here or the Playground, which share it). The first load never pays for it. */
import type {Session,SupabaseClient} from '@supabase/supabase-js';
import {supabaseConfig} from '../supabase-rest';

/** Pages of this origin tell each other about a finished sign-in on this channel (the Playground's popup uses it too). */
export const AUTH_CHANNEL='anatomygo-auth';
let client:Promise<SupabaseClient>|null=null;

export function cloud():Promise<SupabaseClient>{
 const config=supabaseConfig();if(!config)return Promise.reject(Error('Contributing is not set up on this copy of the site.'));
 return client??=import('@supabase/supabase-js').then(({createClient})=>createClient(config.url,config.key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}))
  .catch(e=>{client=null;throw e;});
}

/** Whether this browser kept a session (Supabase stores it as sb-<project>-auth-token), read without loading anything. */
export function storedSession(){
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('sb-')&&k.endsWith('-auth-token'))return true;}}catch{/* private mode */}
 return false;
}

/** Follows the signed-in state: `onChange` gets the session (or null) now and on every change, here or in another tab. */
export function watchSession(onChange:(s:Session|null)=>void){
 let live=true,stop=()=>{};
 cloud().then(c=>{if(!live)return;
  const {data:{subscription}}=c.auth.onAuthStateChange((_e,s)=>onChange(s));
  const reread=()=>{void c.auth.getSession().then(({data})=>onChange(data.session));};
  let channel:BroadcastChannel|null=null;try{channel=new BroadcastChannel(AUTH_CHANNEL);channel.onmessage=reread;}catch{/* older browsers: the storage event still updates */}
  stop=()=>{subscription.unsubscribe();channel?.close();};reread();
 }).catch(()=>onChange(null));
 return()=>{live=false;stop();};
}

/** A database function, as the signed-in visitor. */
export async function rpc<T=unknown>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await (await cloud()).rpc(name,args);if(error)throw Error(error.message);return data as T;
}
