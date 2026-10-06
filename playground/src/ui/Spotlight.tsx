import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type Side = 'left' | 'right' | 'top' | 'bottom'
export interface GuideStep { target: string | null; title: string; body: string; side: Side; inside?: boolean; action?: { label: string; onClick(): void } }

const PAD = 6      // space between the target and the lit window around it
const GAP = 16     // space between the lit window and the card (room for the arrow)
const EDGE = 12    // closest the card may come to the window edge
const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
const across: Record<Side, Side[]> = { left: ['bottom', 'top'], right: ['bottom', 'top'], top: ['right', 'left'], bottom: ['right', 'left'] }

/** True on touch screens, where the copy says "tap" and "pinch" rather than "click" and "scroll". */
export const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** Follows an element's position every frame, so the spotlight keeps up with panels that move or resize. */
function useRect(selector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    let frame = 0, last = ''
    const tick = () => {
      const el = selector ? document.querySelector(selector) : null
      let r = el?.getBoundingClientRect()
      // A target scrolled out of its panel is treated as absent, so nothing points at empty space.
      const clip = el?.closest('.card-scroll, .checklist')?.getBoundingClientRect()
      if (r && clip && (r.bottom < clip.top + 8 || r.top > clip.bottom - 8)) r = undefined
      const key = r && r.width ? `${r.left}|${r.top}|${r.width}|${r.height}` : ''
      if (key !== last) { last = key; setRect(key ? r! : null) }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [selector])
  return rect
}

/**
 * Puts the card beside the target: on the preferred side, else the opposite one, else above or below. If nothing
 * fits (a phone, a target filling the screen) it uses the roomiest side and stays fully inside the window.
 */
function position(rect: DOMRect, size: { width: number; height: number }, preferred: Side) {
  const room: Record<Side, number> = { right: innerWidth - rect.right, left: rect.left, bottom: innerHeight - rect.bottom, top: rect.top }
  const need = (s: Side) => (s === 'left' || s === 'right' ? size.width : size.height) + PAD + GAP + EDGE
  const order = [preferred, opposite[preferred], ...across[preferred]]
  const side = order.find((s) => room[s] >= need(s)) ?? (room.bottom >= room.top ? 'bottom' : 'top')
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), v))
  if (side === 'left' || side === 'right') {
    // Tall targets (a whole list) are pointed at near their top, where the eye starts.
    const anchor = rect.top + Math.min(rect.height / 2, 64)
    const top = clamp(anchor - 32, EDGE, innerHeight - size.height - EDGE)
    const left = clamp(side === 'right' ? rect.right + PAD + GAP : rect.left - PAD - GAP - size.width, EDGE, innerWidth - size.width - EDGE)
    return { side, left, top, arrow: Math.max(18, Math.min(size.height - 18, anchor - top)) }
  }
  const anchor = rect.left + rect.width / 2
  const left = clamp(anchor - size.width / 2, EDGE, innerWidth - size.width - EDGE)
  const top = clamp(side === 'bottom' ? rect.bottom + PAD + GAP : rect.top - PAD - GAP - size.height, EDGE, innerHeight - size.height - EDGE)
  return { side, left, top, arrow: Math.max(18, Math.min(size.width - 18, anchor - left)) }
}

function Card({ rect, side, label, inside = false, children }: { rect: DOMRect; side: Side; label: string; inside?: boolean; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const r = card.current!.getBoundingClientRect()
    if (!size || size.width !== r.width || size.height !== r.height) setSize({ width: r.width, height: r.height })
  })
  // A target that fills most of the window (the model) gets the card along its top edge, inside it, with no arrow.
  const p = !size ? null : inside
    ? { side: 'inside' as const, arrow: 0, left: Math.max(EDGE, Math.min(innerWidth - size.width - EDGE, rect.left + rect.width / 2 - size.width / 2)), top: rect.top + 16 }
    : position(rect, size, side)
  const style = (p ? { left: p.left, top: p.top, '--arrow': `${p.arrow}px` } : { left: 0, top: 0, visibility: 'hidden' }) as CSSProperties
  return (
    <div ref={card} className={`coach-card from-${p?.side ?? side}`} style={style} role="dialog" aria-label={label} aria-live="polite">
      {children}
    </div>
  )
}

/**
 * Hands-on practice. The page is dimmed except one control, and only that control takes clicks: the visitor moves on
 * by doing the thing, not by pressing Next. A small "Skip tutorial" is always there.
 */
export function Guide({ step, index, total, onSkip }: { step: GuideStep; index: number; total: number; onSkip(): void }) {
  const rect = useRect(step.target ?? '')
  const action = useRef<HTMLButtonElement>(null)
  useEffect(() => { action.current?.focus({ preventScroll: true }) }, [step.title])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onSkip() } }
    addEventListener('keydown', keys, true)
    return () => removeEventListener('keydown', keys, true)
  }, [onSkip])
  const body = (
    <>
      <p className="coach-count">Practice · {index} of {total}</p>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      <footer>
        {step.action
          ? <button ref={action} className="coach-next" onClick={step.action.onClick}>{step.action.label}</button>
          : <button className="coach-skip" onClick={onSkip}>Skip tutorial</button>}
      </footer>
    </>
  )
  // Blocks around the lit control: presses elsewhere go nowhere (and do not close open panels).
  const stop = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onClick: (e: { stopPropagation(): void }) => e.stopPropagation() }
  if (!step.target) {
    return <div className="coach-layer guide"><div className="coach-block dim" {...stop} /><div className="coach-card center" role="dialog" aria-label="Practice">{body}</div></div>
  }
  if (!rect) return null
  const hole = { left: rect.left - PAD, top: rect.top - PAD, right: rect.right + PAD, bottom: rect.bottom + PAD }
  return (
    <div className="coach-layer guide">
      <div className="coach-block" {...stop} style={{ left: 0, top: 0, right: 0, height: Math.max(0, hole.top) }} />
      <div className="coach-block" {...stop} style={{ left: 0, top: hole.bottom, right: 0, bottom: 0 }} />
      <div className="coach-block" {...stop} style={{ left: 0, top: hole.top, width: Math.max(0, hole.left), height: hole.bottom - hole.top }} />
      <div className="coach-block" {...stop} style={{ left: hole.right, top: hole.top, right: 0, height: hole.bottom - hole.top }} />
      <div className="coach-hole" style={{ left: hole.left, top: hole.top, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
      <Card rect={rect} side={step.side} label="Practice" inside={step.inside}>{body}</Card>
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
