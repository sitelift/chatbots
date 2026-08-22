import { Bot, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { authClient } from '../lib/auth-client'
import { inputClass, labelClass } from '../lib/ui'

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signin') {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) setError(result.error.message ?? 'Sign-in failed')
      } else {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0] || 'New user',
        })
        if (result.error) setError(result.error.message ?? 'Sign-up failed')
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-4.5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">SiteLift</span>
        </div>

        <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'signin'
              ? 'Welcome back.'
              : 'The first account on a fresh install becomes the agency owner.'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className={labelClass}>
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Web Studio"
                  autoComplete="organization"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
                autoComplete="email"
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 10 characters' : '••••••••••'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className={`${inputClass} mt-1.5`}
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === 'signin' ? 'New to SiteLift?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
            }}
            className="font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
