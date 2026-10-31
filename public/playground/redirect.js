// The Playground moved into the main app. Every old link keeps its query (?structure=, ?pin= naming a placement,
// ?code= from a sign-in) and lands on the same structure and pin there.
(function(){
 // A pin left unsaved in the old Playground (this tab) is kept as a draft on this device, where the new card finds it.
 try{
  var d=JSON.parse(sessionStorage.getItem('anatomygo.playground.draft')||'null');
  if(d&&!d.practice&&d.anchor&&d.meshId&&d.requestId&&(d.label||'').trim()){
   var list=JSON.parse(localStorage.getItem('anatomygo.drafts')||'[]');
   if(!list.some(function(x){return x.request===d.requestId;})){
    list.push({request:d.requestId,mesh:d.meshId,kind:d.supersedes?'correction':d.landmarkId?'first_pin':'new',landmark:d.landmarkId||null,supersedes:d.supersedes||null,
     label:d.label,latin:d.latin||'',description:d.description||'',geometry:d.geometry,anchor:d.anchor,at:new Date().toISOString(),note:'',base:d.description||''});
    localStorage.setItem('anatomygo.drafts',JSON.stringify(list));
   }
  }
  sessionStorage.removeItem('anatomygo.playground.draft');
 }catch(e){/* private mode: the link still opens */}
 location.replace('/'+location.search+location.hash);
})();
