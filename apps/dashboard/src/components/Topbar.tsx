import { Moon, Sun } from 'lucide-react'

interface TopbarProps {
  dark: boolean
  onToggleTheme: () => void
}

export function Topbar({ dark, onToggleTheme }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b px-6">
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </header>
  )
}
