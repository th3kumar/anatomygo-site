// Applies the saved appearance before the first paint, so a dark page never flashes light. Kept in step with
// app/theme.ts, which owns the choice afterwards. "only light" stops browsers that darken pages on their own
// (Samsung Internet, Chrome's auto-darken) from inverting the light theme, which they do to everything but
// the 3D canvas.
(function(){
 var saved;try{saved=localStorage.getItem('anatomygo.appearance');}catch(e){}
 var dark=saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
 var root=document.documentElement;root.classList.toggle('dark',dark);root.style.colorScheme=dark?'dark':'only light';
 var meta=document.querySelector('meta[name=theme-color]');if(meta)meta.content=dark?'#131b1f':'#f3f4f4';
})();
