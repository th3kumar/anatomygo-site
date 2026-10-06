import { useState } from 'react'
import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react'
import type { Landmark } from './cloud'

interface Props {
  items: Landmark[]
  pins: Record<string, number>
  selected: string | null
  loading: boolean
  disabled: boolean
  open: boolean
  phone: boolean
  /** The practice feature's id: listed like the others, marked as practice. */
  practice?: string
  onOpen(open: boolean): void
  onSelect(id: string): void
  onAdd(): void
}

const status = (l: Landmark, pins: number) =>
  l.published_proposal ? { dot: 'reviewed', text: 'Published' } : pins ? { dot: 'placed', text: pins === 1 ? '1 pin' : `${pins} pins` } : { dot: '', text: 'No pin yet' }

/** The named parts and features of one structure. On a phone it is a bottom sheet that starts as a single bar. */
export function Checklist(p: Props) {
  const [filter, setFilter] = useState('')
  if (!p.open) {
    return (
      <div className="pg-list-tab glass" data-coach="list">
        <button className="pg-tab-open" onClick={() => p.onOpen(true)} aria-label="Show parts and features" aria-expanded={false}>
          {p.phone ? <ChevronUp size={16} /> : <PanelLeftOpen size={16} />}Parts & features<span className="count">{p.items.length}</span>
        </button>
        <button className="icon" data-coach="add" disabled={p.disabled} onClick={p.onAdd} aria-label="Add a feature" title="Add a feature"><Plus size={17} /></button>
      </div>
    )
  }
  const term = filter.trim().toLowerCase()
  const visible = term ? p.items.filter((l) => l.label.toLowerCase().includes(term)) : p.items
  return (
    <aside className="checklist-panel glass pg-checklist" aria-label="Parts and features">
      <div className="panel-heading">
        <h2>Parts & features</h2>
        <span className="count">{p.items.length}</span>
        <button className="icon" onClick={() => p.onOpen(false)} aria-label="Hide parts and features" aria-expanded title="Hide">
          {p.phone ? <ChevronDown size={17} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      {p.items.length > 8 && (
        <label className="pg-filter">
          <Search size={14} />
          <input aria-label="Filter parts and features" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      )}
      {p.loading ? (
        <div className="pg-list-loading" aria-label="Loading">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>
      ) : p.items.length === 0 ? (
        <div className="pg-empty">
          <p>Nothing pinned here yet.</p>
          <span>Be the first to add a part or feature.</span>
          <button className="primary" data-coach="add" disabled={p.disabled} onClick={p.onAdd}><Plus size={15} />Add the first feature</button>
        </div>
      ) : (
        <>
          <ol className="checklist pg-list" data-coach="list">
            {visible.map((l) => {
              const s = l.id === p.practice ? { dot: 'placed', text: 'Practice · only you see this' } : status(l, p.pins[l.id] ?? 0)
              return (
                <li key={l.id}>
                  <button className={`item ${l.id === p.selected ? 'selected' : ''}`} aria-current={l.id === p.selected || undefined} onClick={() => p.onSelect(l.id)}>
                    <span className={`dot ${s.dot}`} />
                    <span className="name">{l.label}<small className={l.id === p.practice ? 'practice' : undefined}>{s.text}</small></span>
                  </button>
                </li>
              )
            })}
            {visible.length === 0 && <li className="empty">Nothing matches “{filter.trim()}”.</li>}
          </ol>
          <div className="panel-foot">
            <button data-coach="add" disabled={p.disabled} onClick={p.onAdd}><Plus size={14} />Add a feature</button>
          </div>
        </>
      )}
    </aside>
  )
}
