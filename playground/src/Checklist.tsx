import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react'
import type { Landmark } from './cloud'

interface Props {
  items: Landmark[]
  pins: Record<string, number>
  selected: string | null
  loading: boolean
  disabled: boolean
  open: boolean
  onOpen(open: boolean): void
  onSelect(id: string): void
  onAdd(): void
}

const status = (l: Landmark, pins: number) =>
  l.published_proposal ? { dot: 'reviewed', text: 'Published' } : pins ? { dot: 'placed', text: pins === 1 ? '1 pin' : `${pins} pins` } : { dot: '', text: 'No pin yet' }

/** The landmarks of one structure. Names come first; the dot and the small line say how far each one is. */
export function Checklist(p: Props) {
  const [filter, setFilter] = useState('')
  if (!p.open) {
    return (
      <button className="pg-list-tab glass" onClick={() => p.onOpen(true)} aria-label="Show landmarks">
        <PanelLeftOpen size={16} />Landmarks<span className="count">{p.items.length}</span>
      </button>
    )
  }
  const term = filter.trim().toLowerCase()
  const visible = term ? p.items.filter((l) => l.label.toLowerCase().includes(term)) : p.items
  return (
    <aside className="checklist-panel glass pg-checklist" aria-label="Landmarks">
      <div className="panel-heading">
        <h2>Landmarks</h2>
        <span className="count">{p.items.length}</span>
        <button className="icon" onClick={() => p.onOpen(false)} aria-label="Hide landmarks" title="Hide landmarks"><PanelLeftClose size={16} /></button>
      </div>
      {p.items.length > 8 && (
        <label className="pg-filter">
          <Search size={14} />
          <input aria-label="Filter landmarks" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      )}
      {p.loading ? (
        <div className="pg-list-loading" aria-label="Loading landmarks">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>
      ) : p.items.length === 0 ? (
        <div className="pg-empty">
          <p>No landmarks here yet.</p>
          <span>Be the first to pin one.</span>
          <button className="primary" data-coach="add" disabled={p.disabled} onClick={p.onAdd}><Plus size={15} />Add the first landmark</button>
        </div>
      ) : (
        <>
          <ol className="checklist pg-list" data-coach="list">
            {visible.map((l) => {
              const s = status(l, p.pins[l.id] ?? 0)
              return (
                <li key={l.id}>
                  <button className={`item ${l.id === p.selected ? 'selected' : ''}`} aria-current={l.id === p.selected || undefined} onClick={() => p.onSelect(l.id)}>
                    <span className={`dot ${s.dot}`} />
                    <span className="name">{l.label}<small>{s.text}</small></span>
                  </button>
                </li>
              )
            })}
            {visible.length === 0 && <li className="empty">Nothing matches “{filter.trim()}”.</li>}
          </ol>
          <div className="panel-foot">
            <button data-coach="add" disabled={p.disabled} onClick={p.onAdd}><Plus size={14} />Add a landmark</button>
          </div>
        </>
      )}
    </aside>
  )
}
