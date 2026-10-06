import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import type { Atlas, Part } from './api'
import { sentence, systemColor, systemName } from './ui/systems'

interface Props {
  atlas: Atlas
  counts: Record<string, { landmarks: number; published: number }> | null
  current: string
  initialQuery?: string
  note?: string
  onChoose(id: string): void
  onClose(): void
}

/** Finds any of the model's structures. With nothing typed it lists the ones that already have landmarks. */
export function StructureFinder(p: Props) {
  const [query, setQuery] = useState(p.initialQuery ?? '')
  const [active, setActive] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const term = query.trim().toLowerCase()

  const results = useMemo((): Part[] => {
    if (!term) {
      const counted = Object.entries(p.counts ?? {}).sort((a, b) => b[1].landmarks - a[1].landmarks).map(([id]) => id)
      return counted.map((id) => p.atlas.parts.find((x) => x.id === id)).filter((x): x is Part => !!x)
    }
    const group = p.atlas.concepts.find((c) => c.name.toLowerCase() === term)
    const rank = (x: Part) => {
      const name = x.name.toLowerCase()
      if (group?.elements.includes(x.id) || name === term) return 0
      if (name.startsWith(term)) return 1
      if (name.split(/[\s,()-]+/).some((w) => w.startsWith(term))) return 2
      if (name.includes(term) || x.id.toLowerCase() === term) return 3
      return 9
    }
    return p.atlas.parts.map((x) => ({ x, r: rank(x) })).filter((e) => e.r < 9)
      .sort((a, b) => a.r - b.r || a.x.name.length - b.x.name.length).slice(0, 60).map((e) => e.x)
  }, [p.atlas, p.counts, term])

  useEffect(() => setActive(0), [term])
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }) }, [active])
  const close = useRef(p.onClose)
  close.current = p.onClose
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.top-actions')) close.current() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  function keys(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && results[active]) p.onChoose(results[active].id)
    if (e.key === 'Escape') { e.preventDefault(); p.onClose() }
  }

  return (
    <div ref={panel} className="floating-card glass search-panel pg-finder" role="dialog" aria-label="Find a structure">
      <label className="pg-search">
        <Search size={16} />
        <input autoFocus aria-label="Search structures" placeholder={`Search ${p.atlas.parts.length.toLocaleString()} structures`} value={query}
               role="combobox" aria-expanded aria-controls="finder-results" aria-activedescendant={results[active] ? `finder-${results[active].id}` : undefined}
               onChange={(e) => setQuery(e.target.value)} onKeyDown={keys} />
      </label>
      {p.note && <p className="pg-finder-note">{p.note}</p>}
      <p className="pg-finder-label">{term ? (results.length ? 'Structures' : '') : p.counts ? 'Structures with landmarks' : 'Loading…'}</p>
      <ul className="search-results" id="finder-results" role="listbox" ref={list}>
        {results.map((x, i) => {
          const c = p.counts?.[x.id]
          return (
            <li key={x.id} role="presentation">
              <button id={`finder-${x.id}`} role="option" aria-selected={i === active} className={i === active ? 'selected' : ''}
                      onMouseMove={() => setActive(i)} onClick={() => p.onChoose(x.id)}>
                <span className="r1">
                  <span>{sentence(x.name)}</span>
                  {x.id === p.current && <span className="badge">Open</span>}
                  {c && <span className="count" title={`${c.landmarks} landmarks`}>{c.landmarks}</span>}
                </span>
                <span className="r2"><i className="system-dot" style={{ background: systemColor(x.system) }} />{systemName(x.system)}</span>
              </button>
            </li>
          )
        })}
        {term && results.length === 0 && <li className="pg-finder-empty">No structure called “{query.trim()}”. Try a shorter word.</li>}
      </ul>
      {!term && <p className="search-foot"><span>Type to search every structure</span><span><kbd>↑</kbd> <kbd>↓</kbd> <kbd>↵</kbd></span></p>}
    </div>
  )
}
