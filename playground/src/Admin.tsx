import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import type { Atlas } from './api'
import { rpc } from './cloud'
import { Dialog } from './Dialog'
import { ask } from './ui/ask'
import { sentence } from './ui/systems'

interface QueueItem { id: string; landmark_id: string; mesh_id: string; label: string; description: string; structure: string; published: boolean; upvotes: number; downvotes: number; reports: number }
interface Unmapped { bucket_label: string; remaining: number }

const SORTS = [{ id: 'new', label: 'Newest' }, { id: 'supported', label: 'Most liked' }, { id: 'reported', label: 'Reported' }]

/** The review queue: publish, hide or move community pins, and map imported checklist names to structures. */
export function Admin({ atlas, onClose, onOpen }: { atlas: Atlas; onClose(): void; onOpen(mesh: string, landmark: string, proposal: string): void }) {
  const [rows, setRows] = useState<QueueItem[]>([])
  const [sort, setSort] = useState('new')
  const [offset, setOffset] = useState(0)
  const [unmapped, setUnmapped] = useState<Unmapped[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([rpc<QueueItem[]>('pg_admin_queue', { p_sort: sort, p_offset: offset }), rpc<Unmapped[]>('pg_unmapped')])
      .then(([q, u]) => { if (live) { setRows(q); setUnmapped(u) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [sort, offset, revision])

  async function act(question: Parameters<typeof ask>[0], task: () => Promise<unknown>) {
    if (!(await ask(question))) return
    setBusy(true)
    setError('')
    try { await task(); setRevision((n) => n + 1) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const targetPart = atlas.parts.find((p) => p.id === target)

  return (
    <Dialog title="Review queue" wide onClose={onClose}>
      <p className="muted">Open each pin on the model before publishing it. Votes are a hint, not a decision.</p>
      {error && <p role="alert" className="pg-warn">{error}</p>}
      <div className="segmented pg-sort" role="group" aria-label="Sort">
        {SORTS.map((s) => <button key={s.id} aria-pressed={sort === s.id} onClick={() => { setSort(s.id); setOffset(0) }}>{s.label}</button>)}
      </div>
      <div className="admin-queue">
        {rows.length === 0 && <p className="faint">Nothing waiting.</p>}
        {rows.map((p) => (
          <article key={p.id}>
            <div>
              <strong>{p.label}</strong>{p.published && <span className="badge">Published</span>}
              <p className="note">{sentence(p.structure)} · 👍 {p.upvotes} · 👎 {p.downvotes}{p.reports > 0 && <span className="pg-warn"> · {p.reports} report{p.reports === 1 ? '' : 's'}</span>}</p>
            </div>
            <div className="row">
              <button className="outline" onClick={() => onOpen(p.mesh_id, p.landmark_id, p.id)}><Eye size={14} />Open</button>
              <button className="outline" disabled={busy || !p.description.trim()} title={p.description.trim() ? undefined : 'Needs a description first'}
                      onClick={() => void act(p.published
                        ? { title: 'Unpublish this pin?', body: 'It leaves the main atlas but stays in the Playground.', confirm: 'Unpublish' }
                        : { title: 'Publish this pin?', body: 'This exact spot and text appear in the main atlas for everyone.', confirm: 'Publish' },
                      () => rpc('pg_moderate', { p_proposal: p.id, p_action: p.published ? 'unpublish' : 'approve' }))}>
                {p.published ? 'Unpublish' : 'Publish'}
              </button>
              <button className="ghost" disabled={busy}
                      onClick={() => void act({ title: 'Hide this pin?', body: 'It disappears from the Playground and is unpublished if needed.', confirm: 'Hide', danger: true },
                        () => rpc('pg_moderate', { p_proposal: p.id, p_action: 'hide' }))}>Hide</button>
              <button className="ghost" disabled={busy || !targetPart || target === p.mesh_id} title={targetPart ? `Move to ${targetPart.name}` : 'Choose a target structure below first'}
                      onClick={() => void act({ title: `Move to ${targetPart?.name}?`, body: 'Every pin for this feature is hidden and unpublished. Someone has to place it again on the new structure.', confirm: 'Move', danger: true },
                        () => rpc('pg_move_landmark', { p_landmark: p.landmark_id, p_mesh: target }))}>Move</button>
            </div>
          </article>
        ))}
      </div>
      <div className="row spread">
        <button disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
        <button disabled={rows.length < 50 || busy} onClick={() => setOffset(offset + 50)}>Next</button>
      </div>
      <hr />
      <h3 className="pg-subhead">Target structure</h3>
      <p className="note">Used by Move and by mapping below. Mapping copies checklist names only, never pin positions.</p>
      <label className="field">Structure
        <input list="admin-structures" placeholder="Type a name or ID" value={target} onChange={(e) => setTarget(e.target.value)} />
        <datalist id="admin-structures">{atlas.parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</datalist>
      </label>
      {targetPart && <p className="note">{sentence(targetPart.name)}</p>}
      <div className="admin-unmapped">
        {unmapped.map((u) => (
          <div className="row spread" key={u.bucket_label}>
            <span>{u.bucket_label} <span className="faint">· {u.remaining}</span></span>
            <button className="outline" disabled={!targetPart || busy}
                    onClick={() => void act({ title: 'Map these names?', body: `${u.remaining} names from “${u.bucket_label}” join the list for ${targetPart?.name}.`, confirm: 'Map names' },
                      () => rpc('pg_map_import', { p_bucket: u.bucket_label, p_mesh: target }))}>Map here</button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
