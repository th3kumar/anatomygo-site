/** The part of the screen the 3D camera may use. Panels say which edge they cover with `data-inset="left|right|top|bottom"`,
 * and the camera frames what they leave free, so moving a panel in CSS never needs a matching number in the scene. */
export type Area={left:number,top:number,right:number,bottom:number};

export function freeArea(host:HTMLElement,margin=16):Area{
 const box=host.getBoundingClientRect();
 const area={left:0,top:0,right:box.width,bottom:box.height};
 document.querySelectorAll<HTMLElement>('[data-inset]').forEach(el=>{
  const r=el.getBoundingClientRect();
  // Panels that are fading in still count: the camera frames where they will be.
  if(!r.width||!r.height||getComputedStyle(el).visibility==='hidden')return;
  const left=r.left-box.left,right=r.right-box.left,top=r.top-box.top,bottom=r.bottom-box.top;
  switch(el.dataset.inset){
   case 'left':area.left=Math.max(area.left,right+margin);break;
   case 'right':area.right=Math.min(area.right,left-margin);break;
   case 'top':area.top=Math.max(area.top,bottom+margin);break;
   case 'bottom':area.bottom=Math.min(area.bottom,top-margin);break;
  }
 });
 // Never squeeze the model into a sliver: keep at least a third of each side.
 if(area.right-area.left<box.width/3){const c=(area.left+area.right)/2;area.left=Math.max(0,c-box.width/6);area.right=Math.min(box.width,c+box.width/6);}
 if(area.bottom-area.top<box.height/3){const c=(area.top+area.bottom)/2;area.top=Math.max(0,c-box.height/6);area.bottom=Math.min(box.height,c+box.height/6);}
 return area;
}
