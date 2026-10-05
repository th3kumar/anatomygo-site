import { useEffect,useRef,type ReactNode } from 'react'
export function Dialog({title,onClose,children}:{title:string;onClose():void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[])
 return <dialog ref={ref} className="public-dialog glass" onCancel={onClose} aria-label={title}><header><h2>{title}</h2><button className="icon" aria-label="Close dialog" onClick={onClose}>×</button></header>{children}</dialog>
}
