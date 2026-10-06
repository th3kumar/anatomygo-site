import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({ title, onClose, wide = false, children }: { title: string; onClose(): void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={ref} className={`pg-dialog ${wide ? 'wide' : ''}`} aria-label={title} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <header>
        <h2 className="dialog-title">{title}</h2>
        <button className="icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </header>
      {children}
    </dialog>
  )
}
