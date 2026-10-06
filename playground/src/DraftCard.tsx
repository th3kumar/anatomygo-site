import { Check, Pin, X } from 'lucide-react'
import type { Draft } from './cloud'
import { touch } from './ui/Spotlight'

interface Props {
  draft: Draft
  placing: boolean
  busy: boolean
  signedIn: boolean
  duplicate: boolean
  stale: boolean
  onChange(change: Partial<Draft>): void
  onPlace(): void
  onSave(): void
  onCancel(): void
}

/** Adding or correcting a feature: first the pin, then the words. Save stays out of reach until both are there. */
export function DraftCard(p: Props) {
  const d = p.draft
  const tap = touch ? 'tap' : 'click', Tap = touch ? 'Tap' : 'Click'
  const placed = !!d.anchor
  const heading = d.supersedes ? 'Suggest a better spot' : d.landmarkId ? 'Pin this feature' : 'New feature'
  const missing = !placed ? 'Place the pin to save.' : !d.label.trim() ? 'Give it a name to save.' : p.stale ? 'The model changed. Reload the page to save.' : ''
  return (
    <aside className={`landmark-card glass pg-card pg-draft ${p.placing ? 'placing' : ''}`} aria-label={heading}>
      <header className="pg-card-head">
        <span className="pg-state">{heading}</span>
        <button className="icon" aria-label="Cancel" title="Cancel" disabled={p.busy} onClick={p.onCancel}><X size={17} /></button>
      </header>
      <div className="card-scroll">
        <section className={`pg-step ${placed && !p.placing ? 'done' : 'current'}`}>
          <span className="pg-step-n">{placed && !p.placing ? <Check size={13} /> : 1}</span>
          <div>
            <h3>{p.placing ? (placed ? 'Move the pin' : 'Place the pin') : placed ? 'Pin placed' : 'Place the pin'}</h3>
            <p>{p.placing
              ? (placed ? `Drag the pin, or ${tap} a new spot on the model.` : `${Tap} the model where this feature sits.`)
              : placed ? 'Turn the model to check it from another side.' : `Start, then ${tap} the model where it sits.`}</p>
            <button className={placed || p.placing ? 'outline' : 'primary'} disabled={p.busy} onClick={p.onPlace}>
              <Pin size={15} />{p.placing ? (placed ? 'Done' : 'Stop') : placed ? 'Move pin' : 'Place pin'}
            </button>
          </div>
        </section>
        <section className={`pg-step ${placed && !p.placing ? 'current' : 'later'}`}>
          <span className="pg-step-n">2</span>
          <div>
            <h3>Describe it</h3>
            <label className="field">Name
              <input disabled={p.busy} maxLength={160} value={d.label} placeholder="e.g. Head of fibula" onChange={(e) => p.onChange({ label: e.target.value })} />
            </label>
            {p.duplicate && <p className="pg-warn">This name is already in the list. Open it there instead, if it’s the same feature.</p>}
            <label className="field"><span>Latin name <em>optional</em></span>
              <input disabled={p.busy} maxLength={200} value={d.latin} placeholder="e.g. Caput fibulae" onChange={(e) => p.onChange({ latin: e.target.value })} />
            </label>
            <label className="field">What should students know?
              <textarea disabled={p.busy} rows={4} maxLength={4000} value={d.description} placeholder="Where it is, what attaches to it, why it matters."
                        onChange={(e) => p.onChange({ description: e.target.value })} />
            </label>
          </div>
        </section>
      </div>
      <footer className="card-actions">
        <button className="primary wide" data-hint="save" disabled={p.busy || !!missing} onClick={p.onSave}>{p.busy ? 'Saving…' : 'Save pin'}</button>
        <p className="note">{missing || (p.signedIn ? 'Others can vote on it. An editor checks it before it’s published.' : 'You’ll sign in with Google to save. Your pin stays here.')}</p>
      </footer>
    </aside>
  )
}
