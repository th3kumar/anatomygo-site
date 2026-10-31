/** Google's own sign-in button (Google Identity Services), as in the Playground: Google names this site in its prompt
 * and opens its small window. The ID token it returns is exchanged with Supabase; the nonce ties it to this button.
 * It needs only this site's domain to be allowed in the Google client, so it works on / as it does on /playground/. */
import {cloud} from './cloud';
import {uuid} from './placing';

interface GoogleId {initialize(options:Record<string,unknown>):void;renderButton(parent:HTMLElement,options:Record<string,unknown>):void}
declare global {interface Window {google?:{accounts:{id:GoogleId}}}}
const client=(import.meta.env.VITE_GOOGLE_CLIENT_ID as string|undefined)?.trim();
export const googleAvailable=!!client;

let script:Promise<GoogleId>|null=null;
function load(){
 return script??=new Promise<GoogleId>((resolve,reject)=>{
  if(window.google?.accounts.id)return resolve(window.google.accounts.id);
  const tag=document.createElement('script');tag.src='https://accounts.google.com/gsi/client';tag.async=true;
  tag.onload=()=>window.google?.accounts.id?resolve(window.google.accounts.id):reject(Error('Google sign-in did not start.'));
  tag.onerror=()=>{script=null;tag.remove();reject(Error('Google sign-in could not load.'));};
  document.head.appendChild(tag);
 });
}
async function sha256(text:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

/** Draws Google's button into `parent`. A click there signs in; `onDone` gets null or the reason it failed. */
export async function showGoogleButton(parent:HTMLElement,look:{dark:boolean;width:number},onDone:(error:string|null)=>void,onChosen=()=>{}){
 const [id,c]=await Promise.all([load(),cloud()]),nonce=uuid();
 id.initialize({client_id:client,nonce:await sha256(nonce),ux_mode:'popup',use_fedcm_for_button:true,itp_support:true,context:'signin',
  callback:async({credential}:{credential:string})=>{onChosen();const {error}=await c.auth.signInWithIdToken({provider:'google',token:credential,nonce});onDone(error?error.message:null);}});
 parent.replaceChildren();
 id.renderButton(parent,{type:'standard',theme:look.dark?'filled_black':'outline',size:'large',text:'continue_with',shape:'pill',logo_alignment:'center',width:look.width});
}
