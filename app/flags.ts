/** Switches for optional parts of the page, turned on and off in the Supabase dashboard (table site_flags, migration
 * 202611120001_site_flags.sql) without a deploy. A switch is read when the page loads, once for all of them, so a
 * change shows on the next page load. Until the answer arrives, and whenever it can't be read (the table not there
 * yet, a failed request), a switch is off: a part behind one must be safe to leave out. */
import {useEffect,useState} from 'react';
import {rest} from './supabase-rest';

let asked:Promise<Record<string,boolean>>|null=null;
const flags=()=>asked??=rest<{name:string;enabled:boolean}[]>('site_flags?select=name,enabled').then(rows=>Object.fromEntries(rows.map(r=>[r.name,r.enabled===true])));

/** Whether the switch `name` is on. `wanted` false asks nothing: for a part only some visitors could see at all. */
export function useFlag(name:string,wanted=true):boolean{
 const [on,setOn]=useState(false);
 useEffect(()=>{if(!wanted)return;let live=true;flags().then(f=>{if(live)setOn(f[name]===true);}).catch(()=>{/* off */});return()=>{live=false;};},[name,wanted]);
 return on;
}
