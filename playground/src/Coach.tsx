import { useEffect,useState } from 'react'
const steps=[
 {target:'[data-coach="add"]',title:'Start with a landmark',body:'Choose a name from this structure’s checklist, or add a new landmark if it is missing.'},
 {target:'[data-coach="stage"]',title:'Place it on the surface',body:'Choose Place pin, then click the structure. Drag to rotate and inspect it from another side.'},
 {target:'[data-coach="inspector"]',title:'Save a proposal',body:'Add a name and biology description, then save. Sign in when you are ready; your placement stays in this tab.'},
 {target:'[data-coach="checklist"]',title:'Compare and vote',body:'Open a landmark to compare proposed positions. Vote and comment on the position you inspected.'},
 {target:'[data-coach="inspector"]',title:'Stay in control',body:'You can delete your own unpublished proposal. For published pins, suggest a correction or report a problem.'},
]
export function Coach({onClose}:{onClose():void}) {
 const [step,setStep]=useState(0)
 useEffect(()=>{const target=document.querySelector(steps[step].target);target?.classList.add('coach-target');return()=>target?.classList.remove('coach-target')},[step])
 const finish=()=>{try{localStorage.setItem('anatomygo.playground.tour','1')}catch{}onClose()}
 return <aside className="coach glass" role="region" aria-label="Playground tutorial"><div className="row spread"><span className="eyebrow">{step+1} / {steps.length}</span><button className="ghost" onClick={finish}>Skip tutorial</button></div><h2>{steps[step].title}</h2><p>{steps[step].body}</p><div className="row spread"><button className="ghost" disabled={!step} onClick={()=>setStep(step-1)}>Back</button><button className="primary" onClick={()=>step===steps.length-1?finish():setStep(step+1)}>{step===steps.length-1?'Start exploring':'Next'}</button></div></aside>
}
