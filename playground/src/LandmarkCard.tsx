import { useEffect, useState } from 'react'
import { Flag, MoreHorizontal, Pin, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { comments as loadComments, rpc, type Comment, type Landmark, type Proposal, type Vote } from './cloud'
import { ask, askText } from './ui/ask'
import { Menu } from './ui/Menu'

interface Props {
  landmark: Landmark
  pins: Proposal[]
  chosen: Proposal | null
  scores: Record<string, Vote>
  me: string | null
  admin: boolean
  /** A practice pin: kept in this tab only, so it can be voted on and deleted without an account. */
  practice?: boolean
  busy: boolean
  onChoose(id: string): void
  onVote(value: number): void
  onSuggest(): void
  onClose(): void
  onWithdraw(): void
  onReport(reason: string): void
  run(task: () => Promise<void>): Promise<void>
  requireUser(): boolean
}

const author = (p: Proposal) => p.pg_profiles?.display_name ?? 'Starter pin'
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** A part or feature as students see it, with its pins, a quick vote and the conversation about the chosen pin. */
export function LandmarkCard(p: Props) {
  const pin = p.chosen
  const published = !!pin && pin.id === p.landmark.published_proposal
  const mine = !!pin && !!p.me && pin.author_id === p.me
  const score = pin ? p.scores[pin.id] : undefined
  const title = pin?.label ?? p.landmark.label
  const latin = pin?.latin_name || p.landmark.latin_name
  const description = pin?.description || p.landmark.description

  async function report() {
    if (!pin || !p.requireUser()) return
    const reason = await askText({
      title: 'Report this pin', body: 'Tell us what’s wrong. If it sits on the wrong part, say which part is right.',
      input: { label: 'What’s wrong?', maxLength: 1000 }, confirm: 'Send report',
    })
    if (reason) p.onReport(reason)
  }
  async function withdraw() {
    const body = p.practice ? 'It was only practice, so nothing else changes.' : 'It disappears for everyone. You can’t undo this.'
    if (await ask({ title: 'Delete your pin?', body, confirm: 'Delete pin', danger: true })) p.onWithdraw()
  }

  const actions = pin ? [
    ...(p.practice ? [] : [{ label: 'Report a problem', icon: <Flag size={15} />, onSelect: () => void report() }]),
    ...((mine || p.practice) && !published ? [{ label: 'Delete my pin', icon: <Trash2 size={15} />, danger: true, onSelect: () => void withdraw() }] : []),
  ] : []

  return (
    <aside className="landmark-card glass pg-card" aria-label={title}>
      <header className="pg-card-head">
        <span className={`pg-state ${p.practice ? 'practice' : published ? 'published' : pin ? 'pinned' : ''}`}>
          <i className={`dot ${published ? 'reviewed' : pin ? 'placed' : ''}`} />{p.practice ? 'Practice pin' : published ? 'Published' : pin ? 'Community pin' : 'No pin yet'}
        </span>
        <div className="row">
          {actions.length > 0 && <Menu label="More options" className="icon" trigger={<MoreHorizontal size={17} />} items={actions} />}
          <button className="icon" aria-label="Close" title="Close" onClick={p.onClose}><X size={17} /></button>
        </div>
      </header>
      <h2 className="pg-title">{title}</h2>
      {latin && <p className="latin">{latin}</p>}
      <div className="card-scroll">
        {description ? <p className="biology">{description}</p> : <p className="faint">No description yet.</p>}
        {pin && (
          <section className="pg-section">
            {p.pins.length > 1 ? (
              <>
                <h3>{p.pins.length} pins for this feature</h3>
                <p className="note">Pick one to see it on the model.</p>
                <ul className="pg-pins">
                  {p.pins.map((x) => (
                    <li key={x.id}>
                      <button aria-pressed={x.id === pin.id} disabled={p.busy} onClick={() => p.onChoose(x.id)}>
                        <span className="avatar-sm" aria-hidden>{author(x)[0]}</span>
                        <span className="who">{author(x)}<small>{day(x.created_at)}</small></span>
                        {x.id === p.landmark.published_proposal && <span className="badge">Published</span>}
                        <span className="score" title="Helpful votes"><ThumbsUp size={11} />{p.scores[x.id]?.upvotes ?? 0}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="pg-byline"><span className="avatar-sm" aria-hidden>{author(pin)[0]}</span>{p.practice ? 'Only you can see this. It goes when you finish.' : <>{pin.pg_profiles?.display_name ? `Pinned by ${author(pin)}` : author(pin)} · {day(pin.created_at)}</>}</p>
            )}
            <div className="pg-vote" data-hint="vote">
              <span>{mine ? 'This is your pin.' : 'Is this pin in the right spot?'}</span>
              <div className="row">
                <button aria-label="Yes, it’s right" title={mine ? 'You can’t vote on your own pin' : 'Yes, it’s right'} aria-pressed={score?.mine === 1} disabled={p.busy || mine} onClick={() => p.onVote(1)}>
                  <ThumbsUp size={15} />{score?.upvotes ?? 0}
                </button>
                <button aria-label="No, it’s off" title={mine ? 'You can’t vote on your own pin' : 'No, it’s off'} aria-pressed={score?.mine === -1} disabled={p.busy || mine} onClick={() => p.onVote(-1)}>
                  <ThumbsDown size={15} />{score?.downvotes ?? 0}
                </button>
              </div>
            </div>
          </section>
        )}
        {pin && !p.practice && <Comments key={pin.id} pin={pin} me={p.me} admin={p.admin} busy={p.busy} run={p.run} requireUser={p.requireUser} />}
      </div>
      {!p.practice && <footer className="card-actions">
        {pin
          ? <button className="outline wide" disabled={p.busy} onClick={p.onSuggest}><Pin size={15} />Suggest a better spot</button>
          : <button className="primary wide" data-coach="place" disabled={p.busy} onClick={p.onSuggest}><Pin size={15} />Pin this feature</button>}
      </footer>}
    </aside>
  )
}

function Comments({ pin, me, admin, busy, run, requireUser }: { pin: Proposal; me: string | null; admin: boolean; busy: boolean; run: Props['run']; requireUser(): boolean }) {
  const [list, setList] = useState<Comment[]>([])
  const [more, setMore] = useState(false)
  const [text, setText] = useState('')
  const [request, setRequest] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    loadComments(pin.id).then((c) => { if (live) { setList(c); setMore(c.length === 30) } }).catch(() => { /* comments stay hidden; the pin still works */ })
    return () => { live = false }
  }, [pin.id, revision])

  function post() {
    if (!requireUser()) return
    void run(async () => {
      await rpc('pg_comment', { p_proposal: pin.id, p_body: text, p_request: request })
      setText('')
      setRequest(crypto.randomUUID())
      setRevision((r) => r + 1)
    })
  }
  async function remove(c: Comment) {
    if (await ask({ title: 'Delete this comment?', confirm: 'Delete', danger: true })) void run(async () => { await rpc('pg_remove_comment', { p_comment: c.id }); setRevision((r) => r + 1) })
  }
  const older = () => void run(async () => {
    const next = await loadComments(pin.id, list.at(-1)?.created_at)
    setList((l) => [...l, ...next])
    setMore(next.length === 30)
  })

  return (
    <details className="fold pg-comments">
      <summary>Comments{list.length > 0 && <span className="count">{more ? `${list.length}+` : list.length}</span>}</summary>
      <div className="fold-body">
        {list.length === 0 && <p className="faint">No comments yet. Spotted something? Say what you see.</p>}
        {list.map((c) => (
          <article key={c.id}>
            <div className="row spread">
              <strong>{c.pg_profiles?.display_name ?? 'Someone'}</strong>
              {(c.author_id === me || admin) && <button className="link" onClick={() => void remove(c)}>Delete</button>}
            </div>
            <p>{c.body}</p>
          </article>
        ))}
        {more && <button className="link" disabled={busy} onClick={older}>Show older comments</button>}
        <textarea aria-label="Your comment" placeholder="Add a comment" rows={2} maxLength={2000} disabled={busy} value={text}
                  onChange={(e) => { setText(e.target.value); setRequest(crypto.randomUUID()) }} />
        {text.trim() && <button className="outline" disabled={busy} onClick={post}>Post comment</button>}
      </div>
    </details>
  )
}
