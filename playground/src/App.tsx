import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MousePointerClick, Search, X } from 'lucide-react'
import { loadAtlas, loadMesh, neighbours, type Atlas, type LoadedMesh } from './api'
import { checklist, cloud, placements, restoreDraft, rpc, saveDraft, structureCounts, submit, votes, type Draft, type Landmark, type Proposal, type Vote } from './cloud'
import { Viewer, type ViewerHandle } from './Viewer'
import type { PickFailure, PickResult } from './picking'
import { SceneController, type ScenePin, type ViewName } from './scene'
import { useAppearance } from './theme'
import { Controls, views, type Toggles } from './Controls'
import { Dialog } from './Dialog'
import { Admin } from './Admin'
import { Header } from './Header'
import { Checklist } from './Checklist'
import { LandmarkCard } from './LandmarkCard'
import { DraftCard } from './DraftCard'
import { StructureFinder } from './StructureFinder'
import { AskHost, ask } from './ui/ask'
import { Hint, Tour, touch, type CoachStep } from './ui/Spotlight'
import { isPhone, usePhone } from './ui/media'
import { markSeen, seen } from './ui/hints'
import { sentence } from './ui/systems'

const INTRO = 'anatomygo.playground.intro'
const REFUSED: Record<PickFailure, string> = {
  miss: 'That spot isn’t on this structure.',
  occluded: 'Something is in front. Turn the model, or hide the neighbours.',
  back_face: 'That’s the inside of the surface. Turn the model to face it.',
  degenerate: 'Can’t pin exactly there. Try a little to one side.',
}
type Counts = Record<string, { landmarks: number; published: number }>
const snapshot = (d: Draft) => JSON.stringify([d.label, d.latin, d.description, d.anchor])

export function App() {
  const viewer = useRef<ViewerHandle>(null)
  const { dark } = useAppearance()
  const webgl = useMemo(() => SceneController.webglAvailable(), [])

  // What is on screen
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [meshId, setMeshId] = useState(() => restoreDraft()?.meshId ?? '')
  const [host, setHost] = useState<LoadedMesh | null>(null)
  const [context, setContext] = useState<LoadedMesh[]>([])
  const [items, setItems] = useState<Landmark[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [scores, setScores] = useState<Record<string, Vote>>({})
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)

  // What the visitor is doing
  const [selected, setSelected] = useState<string | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(restoreDraft)
  const original = useRef('')
  const leaving = useRef(false)
  const [placing, setPlacing] = useState(false)
  const [refused, setRefused] = useState('')
  const [placedNow, setPlacedNow] = useState(false)

  // Account
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profile, setProfile] = useState('')

  // Surfaces
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [finder, setFinder] = useState<{ query?: string; note?: string; group?: string[] } | null>(null)
  const [dialog, setDialog] = useState<'auth' | 'name' | 'admin' | null>(null)
  const [touring, setTouring] = useState(false)
  const [, setHintRevision] = useState(0)
  const phone = usePhone()
  // On a phone the list starts as a bar under the model; on a desktop it is open beside it.
  const [listOpen, setListOpen] = useState(() => !isPhone())
  const [toggles, setToggles] = useState<Toggles>({ neighbours: false, labels: false, hidden: false, reverse: false })
  const [insets, setInsets] = useState({ left: 330, right: 100, top: 120, bottom: 72 })

  const active = items.find((x) => x.id === selected) ?? null
  const pinsFor = useMemo(() => {
    const score = (id: string) => (scores[id]?.upvotes ?? 0) - (scores[id]?.downvotes ?? 0)
    return proposals.filter((p) => p.landmark_id === selected).sort((a, b) => score(b.id) - score(a.id))
  }, [proposals, selected, scores])
  const chosen = pinsFor.find((p) => p.id === proposalId) ?? pinsFor.find((p) => p.id === active?.published_proposal) ?? pinsFor[0] ?? null
  const pinCounts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const p of proposals) result[p.landmark_id] = (result[p.landmark_id] ?? 0) + 1
    return result
  }, [proposals])
  const part = host?.meta ?? atlas?.parts.find((p) => p.id === meshId) ?? null
  const me = session?.user.id ?? null

  const tell = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  async function run(task: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await task() } catch (e) { tell(e) } finally { setBusy(false) }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true
    loadAtlas().then((a) => {
      if (!live) return
      setAtlas(a)
      const requested = new URLSearchParams(location.search).get('structure')
      if (restoreDraft()?.meshId && a.parts.some((p) => p.id === restoreDraft()?.meshId)) return
      const direct = a.parts.find((p) => p.id === requested)
      const group = a.concepts.find((c) => c.id === requested)
      if (direct) setMeshId(direct.id)
      else setFinder(group ? { query: group.name, note: 'This comes in more than one piece. Pick one.', group: group.elements } : {})
    }).catch(tell)
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (finder === null && counts) return
    structureCounts().then(setCounts).catch(() => setCounts((c) => c ?? {}))
  }, [finder === null, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cloud) return
    const { data: { subscription } } = cloud.auth.onAuthStateChange((_event, s) => setSession(s))
    cloud.auth.getSession().then(({ data, error }) => { if (error) tell(error); else setSession(data.session) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let live = true
    setProfile('')
    setIsAdmin(false)
    if (!session || !cloud) return
    Promise.all([cloud.from('pg_profiles').select('display_name').eq('id', session.user.id).maybeSingle(), rpc<boolean>('pg_is_admin')])
      .then(([p, a]) => { if (!live) return; if (p.error) throw p.error; setProfile(p.data?.display_name ?? ''); setIsAdmin(a) })
      .catch(tell)
    return () => { live = false }
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!meshId) return
    let live = true
    setHost(null); setLoading(true); setError(''); setContext([]); setItems([]); setProposals([])
    Promise.all([loadMesh(meshId), checklist(meshId), placements(meshId)]).then(async ([h, l, p]) => {
      if (!live) return
      setHost(h); setItems(l); setProposals(p)
      const updated = await votes(p.map((x) => x.id))
      if (!live) return
      setScores(updated)
      setLoading(false)
    }).catch((e) => { if (live) { setLoading(false); tell(e) } })
    return () => { live = false }
  }, [meshId, refresh, session?.user.id])

  useEffect(() => {
    let live = true
    if (!atlas || !host || !toggles.neighbours) { setContext([]); return }
    Promise.all(neighbours(atlas, host.meta).map((p) => loadMesh(p.id))).then((c) => { if (live) setContext(c) }).catch((e) => { if (live) tell(e) })
    return () => { live = false }
  }, [atlas, host, toggles.neighbours])

  // The first visit starts the short tour once the structure is on screen.
  useEffect(() => {
    if (!host || loading || draft) return
    try { if (!localStorage.getItem(INTRO)) startTour() } catch { /* private mode: no tour */ }
  }, [host?.meta.id, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft safety ───────────────────────────────────────────────────────────
  const untouched = (d: Draft | null) => !d || snapshot(d) === original.current
  useEffect(() => {
    saveDraft(draft)
    const guard = (e: BeforeUnloadEvent) => { if (!untouched(draft) && !leaving.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', guard)
    return () => removeEventListener('beforeunload', guard)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  async function leaveDraft() {
    if (busy) return false
    if (untouched(draft)) return true
    return ask({ title: 'Discard your pin?', body: 'The pin and anything you wrote will be lost.', confirm: 'Discard', cancel: 'Keep editing', danger: true })
  }
  const updateDraft = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change, requestId: crypto.randomUUID() } : null))

  // ── Actions ────────────────────────────────────────────────────────────────
  async function chooseStructure(id: string) {
    if (!(await leaveDraft())) return
    setDraft(null); setSelected(null); setProposalId(null); setPlacing(false); setFinder(null)
    if (id !== meshId) setMeshId(id)
    history.replaceState(null, '', `/playground/?structure=${encodeURIComponent(id)}`)
  }

  async function selectLandmark(id: string, proposal: string | null = null) {
    if (draft && !(await leaveDraft())) return
    setDraft(null); setPlacing(false); setSelected(id); setProposalId(proposal)
    if (phone) setListOpen(false)
  }

  async function startDraft(fresh = false) {
    if (!host || !(await leaveDraft())) return
    const source = fresh ? null : chosen
    const next: Draft = {
      meshId: host.meta.id, landmarkId: fresh ? null : active?.id ?? null, supersedes: source?.id ?? null,
      label: source?.label ?? (fresh ? '' : active?.label ?? ''), latin: source?.latin_name ?? (fresh ? '' : active?.latin_name ?? ''),
      description: source?.description ?? (fresh ? '' : active?.description ?? ''),
      anchor: source ? { triangle: source.triangle, u: source.u, v: source.v } : null, requestId: crypto.randomUUID(), geometry: host.meta.geometry,
    }
    original.current = snapshot(next)
    setPlacedNow(false)
    setDraft(next)
    setPlacing(!next.anchor)
    if (fresh) { setSelected(null); setProposalId(null) }
    if (phone) setListOpen(false)
  }

  async function cancelDraft() {
    if (!(await leaveDraft())) return
    setDraft(null); setPlacing(false)
  }

  function place(p: PickResult & { ok: true }) {
    if (busy) return
    updateDraft({ anchor: { triangle: p.triangle, u: p.u, v: p.v } })
    setPlacedNow(true)
    // On a phone the sheet grows once the pin is down, so bring the pin into the space left above it.
    if (phone) setTimeout(() => viewer.current?.focusPin('draft'), 120)
    setPlacing(false)
    setRefused('')
  }

  function requireUser() {
    if (!session) { setDialog('auth'); return false }
    if (!profile) { setDialog('name'); return false }
    return true
  }

  function save() {
    if (!draft) return
    markSeen('save')
    if (!requireUser()) return
    const pending = draft
    void run(async () => {
      const id = await submit(pending)
      setDraft(null); saveDraft(null); setPlacing(false)
      const p = await placements(meshId)
      setProposals(p)
      setItems(await checklist(meshId))
      setScores(await votes(p.map((x) => x.id)))
      setSelected(p.find((x) => x.id === id)?.landmark_id ?? null)
      setProposalId(id)
      setToast('Pin saved. Everyone can see it and vote on it now.')
    })
  }

  function vote(value: number) {
    if (!chosen) return
    markSeen('vote')
    if (!requireUser()) return
    void run(async () => {
      await rpc('pg_vote', { p_proposal: chosen.id, p_value: scores[chosen.id]?.mine === value ? 0 : value })
      setScores(await votes(proposals.map((p) => p.id)))
    })
  }

  function back(e: MouseEvent) {
    if (untouched(draft)) return
    e.preventDefault()
    const href = (e.currentTarget as HTMLAnchorElement).href
    void leaveDraft().then((ok) => { if (ok) { leaving.current = true; saveDraft(null); location.href = href } })
  }

  const fit = useCallback((v: ViewName) => viewer.current?.fit(v), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('dialog[open]') || touring) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); setFinder({}); return }
      if (e.key === 'Escape') { setPlacing(false); setRefused(''); return }
      if (e.key.toLowerCase() === 'f') fit('oblique')
      const i = Number(e.key) - 1
      if (i >= 0 && i < views.length) fit(views[i].view)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [fit, touring])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Scene ──────────────────────────────────────────────────────────────────
  const pins = useMemo(() => {
    const result: ScenePin[] = []
    for (const l of items) {
      const p = (l.id === selected ? chosen : null) ?? proposals.find((x) => x.id === l.published_proposal) ?? proposals.find((x) => x.landmark_id === l.id)
      if (p && (!draft || draft.landmarkId !== l.id)) result.push({ id: p.id, label: p.label, triangle: p.triangle, u: p.u, v: p.v, reviewed: p.id === l.published_proposal })
    }
    const visible = result.slice(0, 100)
    if (chosen && !draft && !visible.some((p) => p.id === chosen.id)) visible.push({ id: chosen.id, label: chosen.label, triangle: chosen.triangle, u: chosen.u, v: chosen.v })
    if (draft?.anchor) visible.push({ id: 'draft', label: draft.label || 'Your pin', ...draft.anchor })
    return visible
  }, [items, proposals, chosen, draft, selected])

  const cardOpen = !!(draft || active)
  // The model is framed in the space the panels leave free.
  useLayoutEffect(() => {
    const measure = () => {
      let next
      if (innerWidth < 800) {
        // Phone: the model sits between the header and whichever sheet is up, left of the rail.
        const head = document.querySelector('.pg-identity')?.getBoundingClientRect()
        const rail = document.querySelector('.view-rail')?.getBoundingClientRect()
        const sheet = document.querySelector('.pg-card, .pg-checklist, .pg-list-tab')?.getBoundingClientRect()
        next = { left: 8, right: rail ? Math.round(innerWidth - rail.left) + 4 : 56, top: Math.round(head?.bottom ?? 90) + 8, bottom: sheet ? Math.round(innerHeight - sheet.top) + 8 : 24 }
      } else {
        const list = document.querySelector('.pg-checklist')?.getBoundingClientRect()
        const card = document.querySelector('.pg-card')?.getBoundingClientRect()
        const rail = document.querySelector('.view-rail')?.getBoundingClientRect()
        const right = innerWidth - Math.min(card?.left ?? innerWidth, rail?.left ?? innerWidth)
        next = { left: Math.round(list ? list.right : 0) + 24, right: Math.round(right) + 24, top: 120, bottom: 72 }
      }
      setInsets((prev) => (prev.left === next.left && prev.right === next.right && prev.top === next.top && prev.bottom === next.bottom ? prev : next))
    }
    measure()
    // Sheets change height as they fill, so watch them as well as the window.
    const watch = new ResizeObserver(measure)
    document.querySelectorAll('.pg-card, .pg-checklist, .pg-list-tab, .pg-identity').forEach((el) => watch.observe(el))
    addEventListener('resize', measure)
    return () => { watch.disconnect(); removeEventListener('resize', measure) }
  }, [listOpen, cardOpen, phone, placing, !!host, items.length === 0, loading, !!chosen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guidance ───────────────────────────────────────────────────────────────
  const quiet = !!finder || !!dialog || !host || loading
  const tap = touch ? 'Tap' : 'Click'
  const steps: CoachStep[] = [
    ...(items.length ? [phone
      ? { target: '[data-coach="list"] .pg-tab-open', side: 'top' as const, title: 'Parts & features', body: 'Tap here for the list. Each one has a pin on the model.' }
      : { target: '[data-coach="list"]', side: 'right' as const, title: 'Pick a feature', body: `${tap} a name to see its pin on the model.` }] : []),
    { target: '[data-coach="rail"]', side: 'left', title: 'Turn the model', body: touch ? 'Drag to turn it, pinch to zoom. Or tap a view here.' : 'Drag to turn it and scroll to zoom. These buttons jump to a view.' },
    { target: '[data-coach="add"]', side: phone ? 'top' : 'right', title: items.length ? 'Add what’s missing' : 'Add the first one',
      body: phone ? 'Tap + to pin a part or feature that isn’t listed. Others can vote on it.' : 'Pin a part or feature that isn’t listed. Others can vote on it.' },
  ]
  function startTour() {
    setListOpen(!phone)
    if (phone && !draft) { setSelected(null); setProposalId(null) }
    setTouring(true)
  }
  const endTour = useCallback(() => { setTouring(false); try { localStorage.setItem(INTRO, '1') } catch { /* private mode */ } }, [])
  const hint = touring || quiet || placing ? null
    : draft?.anchor && placedNow && !busy && !phone && !seen('save') ? 'save'
    : !draft && chosen && chosen.author_id !== me && !seen('vote') ? 'vote' : null
  const doneHint = (id: string) => { markSeen(id); setHintRevision((n) => n + 1) }

  const published = items.filter((l) => l.published_proposal).length
  const backHref = meshId ? `/?structure=${encodeURIComponent(meshId)}&isolate=1` : '/'

  return (
    <main className={`studio public-studio ${cardOpen ? 'has-inspector' : ''} ${placing ? 'is-placing' : ''}`} style={{ '--sheet': `${insets.bottom}px` } as CSSProperties}>
      <div className="stage">
        {host && webgl && (
          <Viewer key={host.meta.id} ref={viewer} host={host} context={context} pins={pins}
                  selected={draft?.anchor ? 'draft' : chosen?.id ?? null}
                  mode={placing ? (draft?.anchor ? 'reposition' : 'place') : 'orbit'}
                  allowReverse={toggles.reverse} showHidden={toggles.hidden} showOtherLabels={toggles.labels} dark={dark} insets={insets}
                  onPlace={place} onRepositionCommit={place} onPickRefused={(r) => setRefused(REFUSED[r.reason])}
                  onHover={(r) => setRefused(r && !r.ok && r.reason !== 'miss' ? REFUSED[r.reason] : '')}
                  onPinClick={(id) => { const p = proposals.find((x) => x.id === id); if (p && !draft) void selectLandmark(p.landmark_id, p.id) }} />
        )}
      </div>

      <Header structure={part} features={items.length} published={published} phone={phone} backHref={backHref} onBack={back}
              onFind={() => setFinder({})} onTour={startTour}
              account={session ? { name: profile, admin: isAdmin } : null}
              onSignIn={() => setDialog('auth')} onRename={() => setDialog('name')} onAdmin={() => setDialog('admin')}
              onSignOut={() => void run(async () => { await cloud!.auth.signOut(); setToast('Signed out.') })} />

      {meshId && !(phone && cardOpen) && (
        <Checklist items={items} pins={pinCounts} selected={selected} loading={loading} disabled={!host || busy} phone={phone}
                   open={listOpen} onOpen={setListOpen} onSelect={(id) => void selectLandmark(id)} onAdd={() => void startDraft(true)} />
      )}
      {host && <Controls compact={phone} onFit={fit} toggles={toggles} onToggle={(k) => setToggles((t) => ({ ...t, [k]: !t[k] }))} />}

      {draft ? (
        <DraftCard draft={draft} placing={placing} busy={busy} signedIn={!!session}
                   duplicate={!draft.landmarkId && items.some((l) => l.label.trim().toLowerCase() === draft.label.trim().toLowerCase())}
                   stale={!!host && draft.geometry !== host.meta.geometry}
                   onChange={updateDraft} onPlace={() => { setPlacing(!placing); setRefused('') }} onSave={save} onCancel={() => void cancelDraft()} />
      ) : active && (
        <LandmarkCard key={active.id} landmark={active} pins={pinsFor} chosen={chosen} scores={scores} me={me} admin={isAdmin} busy={busy}
                      onChoose={setProposalId} onVote={vote} onSuggest={() => void startDraft()} onClose={() => { setSelected(null); setProposalId(null) }}
                      onWithdraw={() => void run(async () => { await rpc('pg_withdraw', { p_proposal: chosen!.id }); setProposalId(null); setRefresh((x) => x + 1); setToast('Your pin was deleted.') })}
                      onReport={(reason) => void run(async () => { await rpc('pg_report', { p_proposal: chosen!.id, p_reason: reason }); setToast('Thanks. We’ll take a look.') })}
                      run={run} requireUser={requireUser} />
      )}

      {placing && (
        <div className={`pg-caption glass ${refused ? 'refused' : ''}`} role="status" style={{ left: phone ? '50%' : (insets.left + innerWidth - insets.right) / 2 }}>
          <MousePointerClick size={15} />
          <span>{refused || (draft?.anchor ? `Drag the pin, or ${tap.toLowerCase()} a new spot` : `${tap} the model where it sits`)}</span>
          {!touch && <kbd>Esc</kbd>}
        </div>
      )}

      {!webgl && <div className="centre-card glass"><h2>3D isn’t available</h2><p>This browser can’t show the model. Try a current Chrome, Edge, Firefox or Safari.</p></div>}
      {webgl && (loading || (!atlas && !error)) && (
        <div className="stage-loading glass" role="status">{part ? `Loading ${sentence(part.name).toLowerCase()}…` : 'Loading the model…'}<div className="loading-track"><i /></div></div>
      )}
      {atlas && !meshId && !finder && (
        <div className="centre-card glass pg-start">
          <h2>Pick a structure</h2>
          <p>Choose a bone, muscle or organ to see its parts & features, or add your own.</p>
          <button className="primary" onClick={() => setFinder({})}><Search size={15} />Find a structure</button>
        </div>
      )}

      {error && (
        <div className="toast glass error" role="alert">
          <span>{error}</span>
          <button onClick={() => { setError(''); setRefresh((x) => x + 1) }}>Try again</button>
          <button className="icon" aria-label="Dismiss" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {toast && !error && <div className="toast glass" role="status">{toast}</div>}

      {finder && atlas && (
        <StructureFinder atlas={atlas} counts={counts} current={meshId} initialQuery={finder.query} note={finder.note} group={finder.group}
                         onChoose={(id) => void chooseStructure(id)} onClose={() => setFinder(null)} />
      )}
      {dialog === 'auth' && (
        <Dialog title="Sign in to save" onClose={() => setDialog(null)}>
          <p>Sign in to save pins, vote and comment.{draft ? ' Your pin stays right here.' : ''}</p>
          {cloud ? (
            <button className="primary wide" disabled={busy} onClick={() => void run(async () => {
              saveDraft(draft)
              const { error } = await cloud!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + `/playground/?structure=${encodeURIComponent(meshId)}` } })
              if (error) throw error
            })}>Continue with Google</button>
          ) : <p className="pg-warn">Saving is switched off in this preview.</p>}
          <p className="note">We use Google only to sign you in. Your email is never shown.</p>
        </Dialog>
      )}
      {dialog === 'name' && (
        <NameDialog current={profile} busy={busy} onClose={() => setDialog(null)}
                    onSave={(name) => void run(async () => {
                      await rpc('pg_set_profile', { p_name: name })
                      setProfile(name)
                      setDialog(null)
                      setToast(draft ? 'Name saved. Now press Save pin.' : 'Name saved.')
                    })} />
      )}
      {dialog === 'admin' && isAdmin && atlas && (
        <Admin atlas={atlas} onClose={() => { setDialog(null); setRefresh((x) => x + 1) }}
               onOpen={(mesh, id, proposal) => void (async () => {
                 if (!(await leaveDraft())) return
                 setDialog(null); setDraft(null); setPlacing(false); setMeshId(mesh); setSelected(id); setProposalId(proposal); setRefresh((x) => x + 1)
                 history.replaceState(null, '', `/playground/?structure=${encodeURIComponent(mesh)}`)
               })()} />
      )}

      {touring && !quiet && <Tour steps={steps} onDone={endTour} />}
      {hint === 'vote' && <Hint target='[data-hint="vote"]' side={phone ? 'top' : 'left'} onDone={() => doneHint('vote')}>Is the pin in the right spot? Your vote helps decide what gets published.</Hint>}
      {hint === 'save' && <Hint target='[data-hint="save"]' side={phone ? 'top' : 'left'} onDone={() => doneHint('save')}>{draft?.label.trim() ? 'Looks right? Save it.' : 'Looks right? Give it a name, then save.'}</Hint>}
      <AskHost />
    </main>
  )
}

function NameDialog({ current, busy, onClose, onSave }: { current: string; busy: boolean; onClose(): void; onSave(name: string): void }) {
  const [name, setName] = useState(current)
  return (
    <Dialog title={current ? 'Change your public name' : 'Choose a public name'} onClose={onClose}>
      <p>People see this name next to your pins and comments. Your email stays private.</p>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name.trim()) }}>
        <label className="field">Public name<input autoFocus minLength={2} maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <footer className="pg-dialog-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || name.trim().length < 2}>Save name</button></footer>
      </form>
    </Dialog>
  )
}
