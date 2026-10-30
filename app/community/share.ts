/** A pin's link: it opens the structure on its own, on that feature. Older Playground links name the placement
 * instead of the feature; the page accepts both. */
export const pinLink=(structure:string,feature:string)=>`${location.origin}/?structure=${encodeURIComponent(structure)}&pin=${encodeURIComponent(feature)}`;

/** Copies text to the clipboard; false if the browser refused. */
export async function copy(text:string){
 try{await navigator.clipboard.writeText(text);return true;}catch{/* older or locked-down browsers */}
 try{const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();return ok;}catch{return false;}
}
