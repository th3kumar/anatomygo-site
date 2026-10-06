import { ArrowLeft, HelpCircle, LogIn, LogOut, MoreHorizontal, PenLine, Search, Shield, UserRound } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Menu, type MenuEntry } from './ui/Menu'
import { sentence, systemColor, systemName } from './ui/systems'

interface Props {
  structure: { name: string; system: string } | null
  features: number
  published: number
  phone: boolean
  backHref: string
  onBack(e: MouseEvent): void
  onFind(): void
  onTour(): void
  account: { name: string; admin: boolean } | null
  onSignIn(): void
  onSignOut(): void
  onRename(): void
  onAdmin(): void
}

export const featureCount = (n: number) => (n === 1 ? '1 part or feature' : `${n} parts & features`)

/**
 * Title and actions. Appearance and usage statistics are set once, on the homepage (About and the theme menu); the
 * Playground follows those choices rather than asking again.
 */
export function Header(p: Props) {
  const accountItems: MenuEntry[] = p.account ? [
    { label: p.account.name ? 'Change public name' : 'Choose a public name', icon: <PenLine size={15} />, onSelect: p.onRename },
    ...(p.account.admin ? [{ label: 'Review queue', icon: <Shield size={15} />, onSelect: p.onAdmin }] : []),
    'divider',
    { label: 'Sign out', icon: <LogOut size={15} />, onSelect: p.onSignOut },
  ] : [{ label: 'Sign in', icon: <LogIn size={15} />, onSelect: p.onSignIn }]
  const initial = p.account?.name.trim()[0]?.toUpperCase()
  const accountTrigger = initial ? <span aria-hidden>{initial}</span> : <UserRound size={17} />

  return (
    <>
      <header className="identity pg-identity">
        <nav className="eyebrow" aria-label="Breadcrumb">
          <a href={p.backHref} onClick={p.onBack}><ArrowLeft size={12} />AnatomyGo</a>
          <span aria-hidden>/</span>
          <span>Playground</span>
        </nav>
        <h1 title={p.structure ? sentence(p.structure.name) : undefined}>{p.structure ? sentence(p.structure.name) : 'Playground'}</h1>
        {p.structure && (
          <p className="identity-meta">
            <i className="system-dot" style={{ background: systemColor(p.structure.system) }} />
            {systemName(p.structure.system)}
            <span>·</span>{featureCount(p.features)}
            {p.published > 0 && <><span>·</span>{p.published} published</>}
          </p>
        )}
      </header>
      {p.phone ? (
        // Phones: search plus one menu, so the title keeps its room.
        <div className="top-actions">
          <button className="square" aria-label="Find a structure" onClick={p.onFind}><Search size={17} /></button>
          <Menu label={p.account ? 'Your account and settings' : 'Menu'} className={`square ${initial ? 'avatar' : ''}`} heading={p.account?.name || undefined}
                trigger={p.account ? accountTrigger : <MoreHorizontal size={18} />}
                items={[{ label: 'How it works', icon: <HelpCircle size={15} />, onSelect: p.onTour }, 'divider', ...accountItems]} />
        </div>
      ) : (
        <div className="top-actions">
          <button onClick={p.onFind} aria-keyshortcuts="/"><Search size={15} />Find a structure<kbd>/</kbd></button>
          <button className="square" aria-label="How it works" title="How it works" onClick={p.onTour}><HelpCircle size={17} /></button>
          {p.account
            ? <Menu label="Your account" className={`square ${initial ? 'avatar' : ''}`} heading={p.account.name || 'Signed in'} trigger={accountTrigger} items={accountItems} />
            : <button onClick={p.onSignIn}>Sign in</button>}
        </div>
      )}
    </>
  )
}
