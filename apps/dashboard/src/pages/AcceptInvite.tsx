import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Logo'
import { inputClass, inputInvalidClass, labelClass } from '../lib/ui'

interface FieldErrors {
  password?: string
  confirm?: string
}

export function AcceptInvitePage({ token }: { token: string }) {
  const passwordRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  function validate(): boolean {
    const next: FieldErrors = {}
    if (password.length < 10) next.password = 'At least 10 characters'
    if (confirm !== password) next.confirm = 'Passwords do not match'
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
      setDone(true)
    } catch {
      setApiError('Could not reach the server. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="m-auto w-full max-w-[340px] px-6">
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
            <a
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Go to sign in
            </a>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-center text-xl font-semibold tracking-tight">
              Set your password
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              Welcome! Choose a password to activate your account.
            </p>

            <form onSubmit={(e) => void submit(e)} noValidate className="mt-8 space-y-4">
              <div>
                <label htmlFor="inv-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="inv-password"
                  ref={passwordRef}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  aria-invalid={Boolean(errors.password)}
                  className={`${errors.password ? inputInvalidClass : inputClass} mt-1.5`}
                />
                {errors.password && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="size-3" />
                    {errors.password}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="inv-confirm" className={labelClass}>
                  Confirm password
                </label>
                <input
                  id="inv-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={Boolean(errors.confirm)}
                  className={`${errors.confirm ? inputInvalidClass : inputClass} mt-1.5`}
                />
                {errors.confirm && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="size-3" />
                    {errors.confirm}
                  </p>
                )}
              </div>

              {apiError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {apiError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {submitting && <LoaderCircle className="size-3.5 animate-spin" />}
                Save password
              </button>
            </form>
          </>
        )}
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">
        Self-hosted · your data stays yours
      </p>
    </div>
  )
}
