import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MousePointerClick, Search, X } from 'lucide-react'
import { loadAtlas, loadMesh, neighbours, type Atlas, type LoadedMesh } from './api'
import { AUTH_CHANNEL, checklist, cloud, placements, restoreDraft, rpc, saveDraft, structureCounts, submit, votes, type Draft, type Landmark, type Proposal, type Vote } from './cloud'
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
import { SignInDialog } from './SignInDialog'
import { AskHost, ask } from './ui/ask'
import { Guide, Hint, touch, type GuideStep } from './ui/Spotlight'
import { isPhone, usePhone } from './ui/media'
import { bucket, errorKind, queryKind, signInFinished, track } from './telemetry'
import { markSeen, seen } from './ui/hints'
import { sentence } from './ui/systems'

// Set once the practice run is finished or skipped. (The old click-through tour used '…intro'; the practice is new, so it has its own key.)
const INTRO = 'anatomygo.playground.practice'
// First-timers practise once: open a feature, add one, place, save, vote and delete it. The practice pin never leaves the tab.
type Practice = 'structure' | 'add' | 'place' | 'save' | 'vote' | 'delete' | 'done'
const PRACTICE_PIN = 'practice-pin', PRACTICE_FEATURE = 'practice-feature'
const PRACTICE_STRUCTURE = 'FJ3387'  // Right tibia: large, familiar and well covered, so the first pin is easy
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
  const [finder, setFinder] = useState<{ query?: string; note?: string; group?: string[]; locked?: boolean } | null>(null)
  const [dialog, setDialog] = useState<'auth' | 'name' | 'admin' | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [practicePlan, setPracticePlan] = useState<Practice[]>([])
  const [practicePin, setPracticePin] = useState<{ feature: Landmark; pin: Proposal } | null>(null)
  const [practiceVote, setPracticeVote] = useState(0)
  const [, setHintRevision] = useState(0)
  const phone = usePhone()
  // On a phone the list starts as a bar under the model; on a desktop it is open beside it.
  const [listOpen, setListOpen] = useState(() => !isPhone())
  const [toggles, setToggles] = useState<Toggles>({ neighbours: false, labels: true, hidden: false, reverse: false })
  const [insets, setInsets] = useState({ left: 330, right: 100, top: 120, bottom: 72 })

  // The practice pin joins the real ones on screen only.
  const allItems = useMemo(() => (practicePin ? [...items, practicePin.feature] : items), [items, practicePin])
  const allProposals = useMemo(() => (practicePin ? [...proposals, practicePin.pin] : proposals), [proposals, practicePin])
  const allScores = useMemo(() => (practicePin
    ? { ...scores, [PRACTICE_PIN]: { upvotes: practiceVote === 1 ? 1 : 0, downvotes: practiceVote === -1 ? 1 : 0, mine: practiceVote } }
    : scores), [scores, practicePin, practiceVote])
  const active = allItems.find((x) => x.id === selected) ?? null
  const pinsFor = useMemo(() => {
    const score = (id: string) => (allScores[id]?.upvotes ?? 0) - (allScores[id]?.downvotes ?? 0)
    return allProposals.filter((p) => p.landmark_id === selected).sort((a, b) => score(b.id) - score(a.id))
  }, [allProposals, selected, allScores])
  const chosen = pinsFor.find((p) => p.id === proposalId) ?? pinsFor.find((p) => p.id === active?.published_proposal) ?? pinsFor[0] ?? null
  const pinCounts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const p of allProposals) result[p.landmark_id] = (result[p.landmark_id] ?? 0) + 1
    return result
  }, [allProposals])
  const part = host?.meta ?? atlas?.parts.find((p) => p.id === meshId) ?? null
  const me = session?.user.id ?? null

  const tell = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    track('playground_error', { kind: errorKind(message) })
    setError(message)
  }
  async function run(task: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await task() } catch (e) { tell(e) } finally { setBusy(false) }
  }

  // ── Statistics ─────────────────────────────────────────────────────────────
  // How the visitor arrived (the homepage links add ?from=, removed here), and how each structure was opened.
  const structureSource = useRef('link')
  useEffect(() => {
    const q = new URLSearchParams(location.search), from = q.get('from')
    let first = false
    try { first = !localStorage.getItem(INTRO) } catch { /* private mode */ }
    track('playground_view', { entry: from ?? (q.has('code') ? 'sign_in_return' : 'direct'), structure: q.has('structure') ? 1 : 0, first_visit: first ? 1 : 0, device: isPhone() ? 'phone' : 'desktop' })
    if (from) { q.delete('from'); history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`) }
    if (!webgl) track('webgl_unavailable')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!host || loading) return
    track('structure_opened', { structure_id: host.meta.id, system_id: host.meta.system, features: bucket(items.length), source: structureSource.current })
  }, [host?.meta.id, loading]) // eslint-disable-line react-hooks/exhaustive-deps
  function openFinder(source: string, state: NonNullable<typeof finder> = {}) {
    track('finder_opened', { source })
    setFinder(state)
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
      else openFinder(group ? 'group_link' : 'no_structure', group ? { query: group.name, note: 'This comes in more than one piece. Pick one.', group: group.elements } : {})
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
    // The Google window signs in on its own page; it says so here, and coming back to this tab re-reads the session too.
    const reread = () => { void cloud!.auth.getSession().then(({ data }) => { if (data.session) setSession(data.session) }) }
    let channel: BroadcastChannel | null = null
    try { channel = new BroadcastChannel(AUTH_CHANNEL); channel.onmessage = reread } catch { /* older browsers: focus still works */ }
    addEventListener('focus', reread)
    return () => { subscription.unsubscribe(); channel?.close(); removeEventListener('focus', reread) }
  }, [])

  // Once signed in, the sign-in dialog has done its job.
  useEffect(() => {
    if (!session) return
    const method = signInFinished()
    if (method) track('sign_in_completed', { method })
    if (dialog !== 'auth') return
    setDialog(null)
    setToast(draft ? 'Signed in. Now press Save pin.' : 'Signed in.')
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // A first visit starts the practice run: on the structure once it is on screen, or at the structure picker.
  useEffect(() => {
    if (practice || draft) return
    let first = false
    try { first = !localStorage.getItem(INTRO) } catch { /* private mode: no practice run */ }
    if (first && (meshId ? host && !loading : atlas && finder)) startPractice('auto')
  }, [host?.meta.id, loading, !!atlas, !!finder]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft safety ───────────────────────────────────────────────────────────
  const untouched = (d: Draft | null) => !d || snapshot(d) === original.current
  useEffect(() => {
    saveDraft(draft?.practice ? null : draft)
    const guard = (e: BeforeUnloadEvent) => { if (!untouched(draft) && !draft?.practice && !leaving.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', guard)
    return () => removeEventListener('beforeunload', guard)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  async function leaveDraft() {
    if (busy) return false
    if (untouched(draft) || draft?.practice) return true
    return ask({ title: 'Discard your pin?', body: 'The pin and anything you wrote will be lost.', confirm: 'Discard', cancel: 'Keep editing', danger: true })
  }
  const updateDraft = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change, requestId: crypto.randomUUID() } : null))

  // ── Actions ────────────────────────────────────────────────────────────────
  async function chooseStructure(id: string, source = 'finder') {
    if (!(await leaveDraft())) return
    structureSource.current = source
    setDraft(null); setSelected(null); setProposalId(null); setPlacing(false); setFinder(null)
    if (id !== meshId) setMeshId(id)
    history.replaceState(null, '', `/playground/?structure=${encodeURIComponent(id)}`)
  }

  async function selectLandmark(id: string, proposal: string | null = null, source = 'list') {
    if (draft && !(await leaveDraft())) return
    const pins = allProposals.filter((x) => x.landmark_id === id)
    track('feature_opened', { source, pins: bucket(pins.length), published: allItems.find((x) => x.id === id)?.published_proposal ? 1 : 0 })
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
      ...(practice ? { practice: true } : {}),
    }
    original.current = snapshot(next)
    track('draft_started', { kind: fresh ? 'new' : source ? 'correction' : 'first_pin', practice: practice ? 1 : 0 })
    setPlacedNow(false)
    setDraft(next)
    setPlacing(!next.anchor)
    if (fresh) { setSelected(null); setProposalId(null) }
    if (phone) setListOpen(false)
  }

  async function cancelDraft() {
    if (!(await leaveDraft())) return
    if (draft) track('draft_cancelled', { stage: !draft.anchor ? 'placing' : draft.label.trim() || draft.description.trim() ? 'described' : 'placed', practice: draft.practice ? 1 : 0 })
    setDraft(null); setPlacing(false)
  }

  function place(p: PickResult & { ok: true }) {
    if (busy) return
    track('pin_placed', { kind: draft?.anchor ? 'moved' : 'placed', practice: draft?.practice ? 1 : 0 })
    updateDraft({ anchor: { triangle: p.triangle, u: p.u, v: p.v } })
    setPlacedNow(true)
    // On a phone the sheet grows once the pin is down, so bring the pin into the space left above it.
    if (phone) setTimeout(() => viewer.current?.focusPin('draft'), 120)
    setPlacing(false)
    setRefused('')
  }

  function requireUser(reason = 'save') {
    if (!session) { track('sign_in_prompted', { reason }); setDialog('auth'); return false }
    if (!profile) { track('public_name_prompted', { reason }); setDialog('name'); return false }
    return true
  }

  function save() {
    if (!draft) return
    if (draft.practice) {
      // Practice: the pin becomes a local one, shown like a real pin, and no sign-in is asked for.
      const a = draft.anchor!, label = draft.label.trim() || 'My practice pin'
      setPracticePin({
        feature: { id: PRACTICE_FEATURE, mesh_id: draft.meshId, label, latin_name: draft.latin, description: draft.description, published_proposal: null },
        pin: { id: PRACTICE_PIN, landmark_id: PRACTICE_FEATURE, mesh_id: draft.meshId, label, latin_name: draft.latin, description: draft.description, geometry: draft.geometry,
               triangle: a.triangle, u: a.u, v: a.v, author_id: 'practice', supersedes: null, status: 'community', created_at: new Date().toISOString(), pg_profiles: { display_name: 'You' } },
      })
      setDraft(null); setPlacing(false); setSelected(PRACTICE_FEATURE); setProposalId(PRACTICE_PIN)
      return
    }
    markSeen('save')
    if (!requireUser()) return
    const pending = draft
    void run(async () => {
      const id = await submit(pending)
      track('pin_saved', { kind: pending.supersedes ? 'correction' : pending.landmarkId ? 'first_pin' : 'new', has_latin: pending.latin.trim() ? 1 : 0, description: bucket(pending.description.trim().length) })
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
    const next = allScores[chosen.id]?.mine === value ? 0 : value
    track('vote_cast', { value: next === 1 ? 'up' : next === -1 ? 'down' : 'clear', practice: chosen.id === PRACTICE_PIN ? 1 : 0 })
    if (chosen.id === PRACTICE_PIN) { setPracticeVote(next); return }
    markSeen('vote')
    if (!requireUser('vote')) return
    void run(async () => {
      await rpc('pg_vote', { p_proposal: chosen.id, p_value: next })
      setScores(await votes(proposals.map((p) => p.id)))
    })
  }

  function back(e: MouseEvent) {
    track('playground_exit', { to: 'atlas' })
    if (untouched(draft)) return
    e.preventDefault()
    const href = (e.currentTarget as HTMLAnchorElement).href
    void leaveDraft().then((ok) => { if (ok) { leaving.current = true; saveDraft(null); location.href = href } })
  }

  const fit = useCallback((v: ViewName, source = 'rail') => { track('camera_view', { view: v, source, area: 'playground' }); viewer.current?.fit(v) }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('dialog[open]') || practice) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); openFinder('keyboard'); return }
      if (e.key === 'Escape') { setPlacing(false); setRefused(''); return }
      if (e.key.toLowerCase() === 'f') fit('oblique', 'keyboard')
      const i = Number(e.key) - 1
      if (i >= 0 && i < views.length) fit(views[i].view, 'keyboard')
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [fit, practice])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Scene ──────────────────────────────────────────────────────────────────
  const pins = useMemo(() => {
    const result: ScenePin[] = []
    for (const l of allItems) {
      const p = (l.id === selected ? chosen : null) ?? allProposals.find((x) => x.id === l.published_proposal) ?? allProposals.find((x) => x.landmark_id === l.id)
      if (p && (!draft || draft.landmarkId !== l.id)) result.push({ id: p.id, label: p.label, triangle: p.triangle, u: p.u, v: p.v, reviewed: p.id === l.published_proposal })
    }
    const visible = result.slice(0, 100)
    if (chosen && !draft && !visible.some((p) => p.id === chosen.id)) visible.push({ id: chosen.id, label: chosen.label, triangle: chosen.triangle, u: chosen.u, v: chosen.v })
    if (draft?.anchor) visible.push({ id: 'draft', label: draft.label || 'Your pin', ...draft.anchor })
    return visible
  }, [allItems, allProposals, chosen, draft, selected])

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
  const practiceRef = useRef<{ step: Practice | null; at: number }>({ step: null, at: 0 })
  practiceRef.current.step = practice
  function startPractice(source: 'auto' | 'help') {
    track('practice_started', { source, start: !meshId ? 'picker' : 'structure' })
    practiceRef.current.at = Date.now()
    setDraft(null); setPlacing(false); setSelected(null); setProposalId(null); setPracticePin(null); setPracticeVote(0)
    setListOpen(!phone)
    // Context helps a first pin: neighbouring structures and pins behind the surface are shown (and stay on afterwards).
    setToggles((t) => ({ ...t, neighbours: true, hidden: true }))
    const rest: Practice[] = ['add', 'place', 'save', 'vote', 'delete', 'done']
    const choose = !meshId && !!atlas?.parts.some((x) => x.id === PRACTICE_STRUCTURE)
    setPracticePlan(choose ? ['structure', ...rest] : rest)
    setPractice(choose ? 'structure' : 'add')
    // One choice only: the picker offers just the practice structure.
    if (choose) openFinder('practice', { note: 'For this practice, open the right tibia.', group: [PRACTICE_STRUCTURE], locked: true })
  }
  const endPractice = useCallback((outcome: 'completed' | 'skipped') => {
    const seconds = Math.round((Date.now() - practiceRef.current.at) / 1000)
    track(outcome === 'completed' ? 'practice_completed' : 'practice_skipped', { step: practiceRef.current.step ?? 'none', seconds: bucket(seconds) })
    setPractice(null); setPracticePin(null); setPracticeVote(0); setPlacing(false)
    setDraft((d) => (d?.practice ? null : d))
    setSelected((x) => (x === PRACTICE_FEATURE ? null : x))
    setFinder((f) => (f?.locked ? {} : f))
    try { localStorage.setItem(INTRO, '1') } catch { /* private mode */ }
  }, [])
  useEffect(() => { if (practice) track('practice_step', { step: practice, index: practicePlan.indexOf(practice) + 1 }) }, [practice]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each step moves on when the visitor has done it.
  useEffect(() => {
    if (!practice) return
    const after = (ms: number, then: () => void) => { const t = setTimeout(then, ms); return () => clearTimeout(t) }
    switch (practice) {
      case 'structure':
        if (meshId && host && !loading) return after(400, () => setPractice('add'))
        break
      case 'add': if (draft?.practice) setPractice('place'); break
      case 'place':
        if (!draft) setPractice('add')
        else if (draft.anchor && !placing) {
          updateDraft({ label: draft.label || 'My practice pin', description: draft.description || 'Practice only: this pin is not saved anywhere.' })
          setPractice('save')
        }
        break
      case 'save': if (practicePin) setPractice('vote'); else if (!draft) setPractice('add'); break
      case 'vote': if (practiceVote !== 0) return after(900, () => setPractice('delete')); break
      case 'delete': if (!practicePin) setPractice('done'); break
    }
    // The practice card stays open while it is being voted on and deleted.
    if ((practice === 'vote' || practice === 'delete') && practicePin && selected !== PRACTICE_FEATURE) { setSelected(PRACTICE_FEATURE); setProposalId(PRACTICE_PIN) }
  }, [practice, meshId, host, loading, selected, draft, placing, practicePin, practiceVote]) // eslint-disable-line react-hooks/exhaustive-deps
  const guide: GuideStep | null =
    practice === 'structure' ? { target: '.pg-finder [role=option]', side: phone ? 'bottom' : 'left', title: 'Open the right tibia', body: `${tap} Right tibia to practise on it. Nothing you do here is saved.` }
    : practice === 'add' ? { target: '[data-coach="add"]', side: phone ? 'top' : 'right', title: 'Add your own', body: phone ? 'Tap + to pin something new.' : 'Click “Add a feature” to pin something new.' }
    : practice === 'place' ? { target: '.pg-stage-free', side: 'top', inside: true, title: 'Place the pin', body: `${tap} anywhere on the model. It’s only practice.` }
    : practice === 'save' ? { target: '[data-hint="save"]', side: phone ? 'top' : 'left', title: 'Save it', body: 'We filled in a name and a note for you. Save it: practice needs no sign-in.' }
    : practice === 'vote' ? { target: '[data-hint="vote"]', side: phone ? 'top' : 'left', title: 'Vote', body: 'People vote on whether a pin sits in the right spot. Give yours a thumbs up.' }
    : practice === 'delete' ? { target: '.pg-card', side: phone ? 'top' : 'left', title: 'Delete it', body: 'Done practising? Open the ⋯ menu on the card and delete your pin.' }
    : practice === 'done' ? { target: null, side: 'top', title: 'You’re ready', body: 'Real pins work just the same. When you save one, you’ll sign in with Google.', action: { label: 'Start exploring', onClick: () => endPractice('completed') } }
    : null
  const hint = practice || quiet || placing ? null
    : draft?.anchor && placedNow && !busy && !phone && !seen('save') ? 'save'
    : !draft && chosen && chosen.author_id !== me && !seen('vote') ? 'vote' : null
  const doneHint = (id: string) => { track('hint_dismissed', { hint: id }); markSeen(id); setHintRevision((n) => n + 1) }
  useEffect(() => { if (hint) track('hint_shown', { hint }) }, [hint])

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
                  contextBlocks={!practice}  // practice: taps reach the structure even where a neighbour is in front
                  onPlace={place} onRepositionCommit={place} onPickRefused={(r) => { track('pin_refused', { reason: r.reason, practice: practice ? 1 : 0 }); setRefused(REFUSED[r.reason]) }}
                  onHover={(r) => setRefused(r && !r.ok && r.reason !== 'miss' ? REFUSED[r.reason] : '')}
                  onPinClick={(id) => { const p = allProposals.find((x) => x.id === id); if (p && !draft && !practice) void selectLandmark(p.landmark_id, p.id, 'model') }} />
        )}
      </div>

      <Header structure={part} features={items.length} published={published} phone={phone} backHref={backHref} onBack={back}
              onFind={() => openFinder('header')} onTour={() => startPractice('help')}
              account={session ? { name: profile, admin: isAdmin } : null}
              onSignIn={() => { track('sign_in_prompted', { reason: 'header' }); setDialog('auth') }} onRename={() => setDialog('name')} onAdmin={() => setDialog('admin')}
              onSignOut={() => void run(async () => { await cloud!.auth.signOut(); track('signed_out'); setToast('Signed out.') })} />

      {meshId && !(phone && cardOpen) && (
        <Checklist items={allItems} pins={pinCounts} practice={PRACTICE_FEATURE} selected={selected} loading={loading} disabled={!host || busy} phone={phone}
                   open={listOpen} onOpen={(o) => { track('list_toggled', { open: o ? 1 : 0 }); setListOpen(o) }} onSelect={(id) => { if (!practice || id === PRACTICE_FEATURE) void selectLandmark(id) }} onAdd={() => void startDraft(true)} />
      )}
      {host && <Controls compact={phone} onFit={fit} toggles={toggles} onToggle={(k) => { track('display_toggled', { setting: k, on: toggles[k] ? 0 : 1 }); setToggles((t) => ({ ...t, [k]: !t[k] })) }} />}

      {draft ? (
        <DraftCard draft={draft} placing={placing} busy={busy} signedIn={!!session}
                   duplicate={!draft.landmarkId && items.some((l) => l.label.trim().toLowerCase() === draft.label.trim().toLowerCase())}
                   stale={!!host && draft.geometry !== host.meta.geometry}
                   onChange={updateDraft} onPlace={() => { setPlacing(!placing); setRefused('') }} onSave={save} onCancel={() => void cancelDraft()} />
      ) : active && (
        <LandmarkCard key={active.id} landmark={active} pins={pinsFor} chosen={chosen} scores={allScores} practice={chosen?.id === PRACTICE_PIN} me={me} admin={isAdmin} busy={busy}
                      onChoose={(id) => { track('pin_alternative_viewed'); setProposalId(id) }} onVote={vote} onSuggest={() => void startDraft()} onClose={() => { setSelected(null); setProposalId(null) }}
                      onWithdraw={() => {
                        track('pin_deleted', { practice: chosen?.id === PRACTICE_PIN ? 1 : 0 })
                        if (chosen?.id === PRACTICE_PIN) { setPracticePin(null); setSelected(null); setProposalId(null); return }
                        void run(async () => { await rpc('pg_withdraw', { p_proposal: chosen!.id }); setProposalId(null); setRefresh((x) => x + 1); setToast('Your pin was deleted.') })
                      }}
                      onReport={(reason) => void run(async () => { await rpc('pg_report', { p_proposal: chosen!.id, p_reason: reason }); track('report_sent'); setToast('Thanks. We’ll take a look.') })}
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
          <button className="primary" onClick={() => openFinder('start')}><Search size={15} />Find a structure</button>
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
        <StructureFinder atlas={atlas} counts={counts} current={meshId} initialQuery={finder.query} note={finder.note} group={finder.group} locked={finder.locked}
                         onChoose={(id, how) => { track('finder_choice', { kind: how.kind, query_kind: queryKind(how.query), rank: bucket(how.rank + 1) }); void chooseStructure(id, practice ? 'practice' : 'finder') }}
                         onClose={() => { if (!finder.locked) setFinder(null) }} />
      )}
      {dialog === 'auth' && <SignInDialog draft={draft} structure={meshId} onClose={() => setDialog(null)} />}
      {dialog === 'name' && (
        <NameDialog current={profile} busy={busy} onClose={() => setDialog(null)}
                    onSave={(name) => void run(async () => {
                      await rpc('pg_set_profile', { p_name: name })
                      track('public_name_set', { first: profile ? 0 : 1 })
                      setProfile(name)
                      setDialog(null)
                      setToast(draft ? 'Name saved. Now press Save pin.' : 'Name saved.')
                    })} />
      )}
      {dialog === 'admin' && isAdmin && atlas && (
        <Admin atlas={atlas} onClose={() => { setDialog(null); setRefresh((x) => x + 1) }}
               onOpen={(mesh, id, proposal) => void (async () => {
                 if (!(await leaveDraft())) return
                 structureSource.current = 'admin'
                 setDialog(null); setDraft(null); setPlacing(false); setMeshId(mesh); setSelected(id); setProposalId(proposal); setRefresh((x) => x + 1)
                 history.replaceState(null, '', `/playground/?structure=${encodeURIComponent(mesh)}`)
               })()} />
      )}

      {practice && <div className="pg-stage-free" style={{ left: insets.left, top: insets.top, right: insets.right, bottom: insets.bottom }} />}
      <Guide step={guide} index={Math.max(1, practice ? practicePlan.indexOf(practice) + 1 : practicePlan.length)} total={practicePlan.length} onSkip={() => endPractice('skipped')} />
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
