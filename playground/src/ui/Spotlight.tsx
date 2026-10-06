import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type Side = 'left' | 'right' | 'top' | 'bottom'
export interface CoachStep { target: string; title: string; body: string; side: Side }

const PAD = 6      // space between the target and the lit window around it
const GAP = 16     // space between the lit window and the card (room for the arrow)
const EDGE = 12    // closest the card may come to the window edge
const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }

/** Follows an element's position every frame, so the spotlight keeps up with panels that move or resize. */
function useRect(selector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    let frame = 0, last = ''
    const tick = () => {
      const r = document.querySelector(selector)?.getBoundingClientRect()
      const key = r && r.width ? `${r.left}|${r.top}|${r.width}|${r.height}` : ''
      if (key !== last) { last = key; setRect(key ? r! : null) }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [selector])
  return rect
}

/** Puts the card beside the target on the preferred side (or the opposite one if there is no room). */
function position(rect: DOMRect, size: { width: number; height: number }, preferred: Side) {
  const room: Record<Side, number> = {
    right: innerWidth - rect.right, left: rect.left, bottom: innerHeight - rect.bottom, top: rect.top,
  }
  const need = (s: Side) => (s === 'left' || s === 'right' ? size.width : size.height) + PAD + GAP + EDGE
  const side = room[preferred] >= need(preferred) || room[opposite[preferred]] < need(opposite[preferred]) ? preferred : opposite[preferred]
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  if (side === 'left' || side === 'right') {
    // Tall targets (a whole list) are pointed at near their top, where the eye starts.
    const anchor = rect.top + Math.min(rect.height / 2, 64)
    const top = clamp(anchor - 32, EDGE, innerHeight - size.height - EDGE)
    const left = side === 'right' ? rect.right + PAD + GAP : rect.left - PAD - GAP - size.width
    return { side, left, top, arrow: clamp(anchor - top, 18, size.height - 18) }
  }
  const anchor = rect.left + rect.width / 2
  const left = clamp(anchor - size.width / 2, EDGE, innerWidth - size.width - EDGE)
  const top = side === 'bottom' ? rect.bottom + PAD + GAP : rect.top - PAD - GAP - size.height
  return { side, left, top, arrow: clamp(anchor - left, 18, size.width - 18) }
}

function Card({ rect, side, label, children }: { rect: DOMRect; side: Side; label: string; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const r = card.current!.getBoundingClientRect()
    if (!size || size.width !== r.width || size.height !== r.height) setSize({ width: r.width, height: r.height })
  })
  const p = size ? position(rect, size, side) : null
  const style = (p ? { left: p.left, top: p.top, '--arrow': `${p.arrow}px` } : { left: -9999, top: 0 }) as CSSProperties
  return (
    <div ref={card} className={`coach-card from-${p?.side ?? side}`} style={style} role="dialog" aria-label={label} aria-live="polite">
      {children}
    </div>
  )
}

/** A short guided tour: dims the page, lights one control at a time and explains it in a sentence. */
export function Tour({ steps, onDone }: { steps: CoachStep[]; onDone(): void }) {
  const [index, setIndex] = useState(0)
  const step = steps[Math.min(index, steps.length - 1)]
  const rect = useRect(step.target)
  const next = useRef<HTMLButtonElement>(null)
  const last = index >= steps.length - 1
  useEffect(() => { next.current?.focus() }, [index, rect === null])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDone() }
      if (e.key === 'ArrowRight') setIndex((i) => (i < steps.length - 1 ? i + 1 : i))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    addEventListener('keydown', keys, true)
    return () => removeEventListener('keydown', keys, true)
  }, [steps.length, onDone])
  if (!rect) return null
  return (
    <div className="coach-layer">
      <div className="coach-block" />
      <div className="coach-hole" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      <Card rect={rect} side={step.side} label="Playground tour">
        <p className="coach-count">{index + 1} of {steps.length}</p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <footer>
          {!last && <button className="coach-skip" onClick={onDone}>Skip</button>}
          <button ref={next} className="coach-next" onClick={() => (last ? onDone() : setIndex(index + 1))}>{last ? 'Got it' : 'Next'}</button>
        </footer>
      </Card>
    </div>
  )
}

/** A one-time tip next to a control, shown at the moment it becomes useful. It does not block the page. */
export function Hint({ target, side, children, onDone }: { target: string; side: Side; children: ReactNode; onDone(): void }) {
  const rect = useRect(target)
  if (!rect) return null
  return (
    <Card rect={rect} side={side} label="Tip">
      <p>{children}</p>
      <footer><button className="coach-next" onClick={onDone}>Got it</button></footer>
    </Card>
  )
}
