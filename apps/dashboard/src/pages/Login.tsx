import { useNavigate } from '@tanstack/react-router'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, PasswordField, StrengthMeter } from '../components/auth/fields'
import { Logo } from '../components/Logo'
import { authClient } from '../lib/auth-client'
import { fetchMe, resetSessionCache } from '../lib/session'

type Mode = 'signin' | 'signup'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirm?: string
}

function BrandMark() {
  return (
    <div className="flex items-center justify-center">
      <Logo className="h-7 w-auto text-foreground" />
    </div>
  )
}

function CheckingSession() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="m-auto w-full max-w-[340px] px-6">
        <BrandMark />
        <div className="mt-10 space-y-3">
          <div className="skeleton h-9 rounded-md" />
          <div className="skeleton h-9 rounded-md" />
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">
        Self-hosted · your data stays yours
      </p>
    </div>
  )
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function LoginPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [hasUsers, setHasUsers] = useState(true)
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchMe(),
      fetch('/api/auth/bootstrap').then(async (res) =>
        res.ok ? ((await res.json()) as { hasUsers: boolean }) : null,
      ),
    ])
      .then(([me, bootstrap]) => {
        if (cancelled) return
        if (me) {
          navigate({ to: '/' })
          return
        }
        if (bootstrap) setHasUsers(bootstrap.hasUsers)
        setMode(bootstrap?.hasUsers === false ? 'signup' : 'signin')
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (mode === 'signup' && !name.trim()) next.name = 'Enter your name'
    if (!email.trim()) next.email = 'Enter your email'
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address'
    if (!password) next.password = 'Enter a password'
    else if (password.length < 10) next.password = 'Use at least 10 characters'
    if (mode === 'signup') {
      if (!confirm) next.confirm = 'Confirm your password'
      else if (confirm !== password) next.confirm = 'Passwords do not match'
    }
    return next
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'signin') {
        const result = await authClient.signIn.email({ email: email.trim(), password })
        if (result.error) setError(result.error.message ?? 'Sign-in failed')
        else {
          resetSessionCache()
          navigate({ to: '/' })
        }
      } else {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.split('@')[0] || 'New user',
        })
        if (result.error) setError(result.error.message ?? 'Sign-up failed')
        else {
          resetSessionCache()
          navigate({ to: '/' })
        }
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setErrors({})
    setError('')
  }

  const setField = (field: keyof FieldErrors) => (value: string) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
    if (field === 'name') setName(value)
    else if (field === 'email') setEmail(value)
    else if (field === 'password') setPassword(value)
    else setConfirm(value)
  }

  if (checking) return <CheckingSession />

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="m-auto w-full max-w-[340px] px-6 py-12">
        <BrandMark />

        <div className="mt-10">
          {hasUsers ? (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    mode === m
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                This account owns the install.
              </p>
            </>
          )}

          {hasUsers && mode === 'signup' && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              You'll see the chatbots your agency assigns you.
            </p>
          )}

          <form
            onSubmit={submit}
            noValidate
            aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}
            className="mt-5 space-y-4"
          >
            {mode === 'signup' && (
              <Field
                id="name"
                label="Name"
                value={name}
                onChange={setField('name')}
                error={errors.name}
                placeholder="Acme Web Studio"
                autoComplete="organization"
              />
            )}

            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setField('email')}
              error={errors.email}
              placeholder="you@agency.com"
              autoComplete="email"
            />

            <div>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setField('password')}
                error={errors.password}
                placeholder={mode === 'signup' ? 'At least 10 characters' : '••••••••••'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              {mode === 'signup' && !errors.password && <StrengthMeter password={password} />}
            </div>

            {mode === 'signup' && (
              <PasswordField
                id="confirm"
                label="Confirm password"
                value={confirm}
                onChange={setField('confirm')}
                error={errors.confirm}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </main>

      <p className="pb-8 text-center text-xs text-muted-foreground">
        Self-hosted · your data stays yours
      </p>
    </div>
  )
}
