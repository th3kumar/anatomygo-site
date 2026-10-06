import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem { label: string; onSelect(): void; icon?: ReactNode; danger?: boolean; checked?: boolean }

/** Small popover menu in the studio style: opens on click, closes on a choice, Escape or a click elsewhere. */
export function Menu({ label, trigger, items, heading, up = false, className = 'square' }: {
  label: string; trigger: ReactNode; items: (MenuItem | 'divider')[]; heading?: string; up?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) }
  }, [open])
  return (
    <div className="menu" ref={box}>
      <button className={className} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{trigger}</button>
      {open && (
        <div className={`menu-list glass ${up ? '' : 'down'}`} role="menu" aria-label={label}>
          {heading && <div className="menu-label">{heading}</div>}
          {items.map((item, i) => item === 'divider' ? <hr key={i} /> : (
            <button key={i} role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked}
                    className={item.danger ? 'danger-item' : undefined} onClick={() => { setOpen(false); item.onSelect() }}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
