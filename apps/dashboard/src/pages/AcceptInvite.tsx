import { useNavigate } from '@tanstack/react-router'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PasswordField, StrengthMeter } from '../components/auth/fields'
import { Logo } from '../components/Logo'
import { resetSessionCache } from '../lib/session'

interface FieldErrors {
  password?: string
  confirm?: string
}

export function AcceptInvitePage({ token }: { token: string }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.getElementById('inv-password')?.focus()
  }, [])

  function setField(field: keyof FieldErrors) {
    return (value: string) => {
      setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
      if (field === 'password') setPassword(value)
      else setConfirm(value)
    }
  }

  function validate(): boolean {
    const next: FieldErrors = {}
    if (password.length < 10) next.password = 'Use at least 10 characters'
    else if (!confirm) next.confirm = 'Confirm your password'
    else if (confirm !== password) next.confirm = 'Passwords do not match'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        setApiError(body.message ?? 'This setup link is invalid or expired')
        return
      }
      resetSessionCache()
      setDone(true)
    } catch {
      setApiError('Could not reach the server. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="m-auto w-full max-w-[340px] px-6 py-12">
        <div className="flex items-center justify-center">
          <Logo className="h-7 w-auto text-foreground" />
        </div>

        {done ? (
          <div className="mt-10 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-success/10">
              <Check className="size-5 text-success" />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">You're all set</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your password is saved. Sign in to manage your chatbot.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: '/login' })}
              className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="mt-10 text-center text-xl font-semibold tracking-tight">
              Set your password
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              Welcome! Choose a password to activate your account.
            </p>

            <form onSubmit={(e) => void submit(e)} noValidate className="mt-8 space-y-4">
              <div>
                <PasswordField
                  id="inv-password"
                  label="Password"
                  value={password}
                  onChange={setField('password')}
                  error={errors.password}
                  placeholder="At least 10 characters"
                  autoComplete="new-password"
                />
                {!errors.password && <StrengthMeter password={password} />}
              </div>

              <PasswordField
                id="inv-confirm"
                label="Confirm password"
                value={confirm}
                onChange={setField('confirm')}
                error={errors.confirm}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />

              {apiError && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {apiError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {submitting && <LoaderCircle className="size-3.5 animate-spin" />}
                Save password
              </button>
            </form>
          </>
        )}
      </main>

      <p className="pb-8 text-center text-xs text-muted-foreground">
        Self-hosted · your data stays yours
      </p>
    </div>
  )
}
