// Checks that each text colour in app/tokens.css reads clearly (WCAG AA, 4.5:1) on the surfaces it sits on.
// Glass is translucent, so each surface is the panel colour composited over the stage ground behind it.
// Keep the values in step with app/tokens.css.
const hex=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const over=(top,alpha,under)=>top.map((c,i)=>Math.round(c*alpha+under[i]*(1-alpha)));
const lum=rgb=>{const [r,g,b]=rgb.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};

const themes={
 light:{
  text:{text:'#1f2124','text-2':'#4a4e54','text-3':'#62676d','accent-text':'#236b4b'},
  // Darkest point of the ground under a panel, and the panel's glass over it (about 55% white at its thinnest).
  surfaces:{ground:hex('#e6e5e0'),panel:over([255,255,255],.55,hex('#e6e5e0')),sheet:over([250,250,248],.62,hex('#e6e5e0'))},
 },
 dark:{
  text:{text:'#eceef0','text-2':'#b9bdc2','text-3':'#8f949a','accent-text':'#7fd8b0'},
  surfaces:{ground:hex('#25272c'),panel:over([39,41,46],.62,hex('#25272c')),sheet:over([36,38,43],.86,hex('#25272c'))},
 },
};
let failed=0;
for(const [name,t] of Object.entries(themes))for(const [tk,c] of Object.entries(t.text))for(const [sk,s] of Object.entries(t.surfaces)){
 const r=ratio(hex(c),s);if(r<4.5){failed++;console.error(`${name}: --${tk} on ${sk} is ${r.toFixed(2)}:1 (needs 4.5)`);}
}
if(failed)process.exit(1);
console.log('Contrast: every text token passes AA on its surfaces, in both themes.');
