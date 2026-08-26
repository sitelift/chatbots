import { Moon, Sun } from 'lucide-react'
import { authClient } from '../lib/auth-client'
import { resetSessionCache, useSession } from '../lib/session'

interface TopbarProps {
  dark: boolean
  onToggleTheme: () => void
}

export function Topbar({ dark, onToggleTheme }: TopbarProps) {
  const { user } = useSession()

  async function signOut() {
    await authClient.signOut()
    resetSessionCache()
    window.location.reload()
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b px-6">
      {user && (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="max-w-48 truncate">{user.email}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              user.role === 'agency'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {user.role === 'agency' ? 'Agency' : 'Client'}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      {user && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign out
        </button>
      )}
    </header>
  )
}
