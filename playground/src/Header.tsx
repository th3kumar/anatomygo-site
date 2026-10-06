import { ArrowLeft, HelpCircle, LogOut, Monitor, Moon, PenLine, Search, Shield, Sun, UserRound } from 'lucide-react'
import type { MouseEvent } from 'react'
import { setAppearance, useAppearance, type Appearance } from './theme'
import { Menu } from './ui/Menu'
import { sentence, systemColor, systemName } from './ui/systems'

interface Props {
  structure: { name: string; system: string } | null
  landmarks: number
  published: number
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

const appearances: { id: Appearance; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Match my device', icon: Monitor }, { id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon },
]

export function Header(p: Props) {
  const { choice, dark } = useAppearance()
  const Current = choice === 'system' ? Monitor : dark ? Moon : Sun
  return (
    <>
      <header className="identity pg-identity">
        <nav className="eyebrow" aria-label="Breadcrumb">
          <a href={p.backHref} onClick={p.onBack}><ArrowLeft size={12} />AnatomyGo</a>
          <span aria-hidden>/</span>
          <span>Playground</span>
        </nav>
        <h1>{p.structure ? sentence(p.structure.name) : 'Playground'}</h1>
        {p.structure && (
          <p className="identity-meta">
            <i className="system-dot" style={{ background: systemColor(p.structure.system) }} />
            {systemName(p.structure.system)}
            <span>·</span>{p.landmarks === 1 ? '1 landmark' : `${p.landmarks} landmarks`}
            {p.published > 0 && <><span>·</span>{p.published} published</>}
          </p>
        )}
      </header>
      <div className="top-actions">
        <button onClick={p.onFind} aria-keyshortcuts="/"><Search size={15} />Find a structure<kbd>/</kbd></button>
        <button className="square" aria-label="How it works" title="How it works" onClick={p.onTour}><HelpCircle size={17} /></button>
        <Menu label="Appearance" heading="Appearance" trigger={<Current size={17} />}
              items={appearances.map((a) => ({ label: a.label, icon: <a.icon size={15} />, checked: choice === a.id, onSelect: () => setAppearance(a.id) }))} />
        {p.account ? (
          <Menu label="Your account" className="square avatar" heading={p.account.name || 'Signed in'}
                trigger={p.account.name ? <span aria-hidden>{p.account.name.trim()[0]?.toUpperCase()}</span> : <UserRound size={17} />}
                items={[
                  { label: p.account.name ? 'Change public name' : 'Choose a public name', icon: <PenLine size={15} />, onSelect: p.onRename },
                  ...(p.account.admin ? [{ label: 'Review queue', icon: <Shield size={15} />, onSelect: p.onAdmin }] : []),
                  'divider',
                  { label: 'Sign out', icon: <LogOut size={15} />, onSelect: p.onSignOut },
                ]} />
        ) : (
          <button onClick={p.onSignIn}>Sign in</button>
        )}
      </div>
    </>
  )
}
