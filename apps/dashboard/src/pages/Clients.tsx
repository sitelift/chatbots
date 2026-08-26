import type { ChatbotAdminView } from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  Eye,
  Link2,
  LoaderCircle,
  Mail,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'

interface ClientView {
  id: string
  email: string
  name: string | null
  role: 'agency' | 'client'
  chatbotIds: string[]
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function setupUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.PROD ? '/admin' : ''}/accept/${token}`
}

type LinkDialog = { email: string; setupToken: string } | null
type AssignDialog = { client: ClientView } | null

export function ClientsPage() {
  const navigate = useNavigate()

  const [clients, setClients] = useState<ClientView[] | null>(null)
  const [bots, setBots] = useState<ChatbotAdminView[] | null>(null)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [linkDialog, setLinkDialog] = useState<LinkDialog>(null)
  const [assignDialog, setAssignDialog] = useState<AssignDialog>(null)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [clientsResult, botsResult] = await Promise.all([
        apiFetch<{ clients: ClientView[] }>('/api/admin/clients'),
        apiFetch<{ chatbots: ChatbotAdminView[] }>('/api/admin/chatbots'),
      ])
      setClients(clientsResult.clients)
      setBots(botsResult.chatbots)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to load clients')
      setClients([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function removeClient(id: string) {
    try {
      await apiFetch(`/api/admin/clients/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to remove client')
    }
    setArmedDeleteId(null)
  }

  function previewAsOwner(client: ClientView) {
    const botId = client.chatbotIds[0]
    navigate({ to: '/chatbots/$botId', params: { botId }, search: { as: 'owner' } })
  }

  const botNameById = new Map((bots ?? []).map((b) => [b.id, b.name]))

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Invite business owners, hand them their chatbot, and peek at exactly what they see.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Plus className="size-3.5" />
          Add client
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 rounded-lg border bg-card">
        {clients === null ? (
          <div className="space-y-3 px-5 py-5">
            {['one', 'two', 'three'].map((id) => (
              <div key={id} className="flex items-center gap-6">
                <div className="skeleton size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-44 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-[15px] font-medium">No clients yet</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Invite a business owner with their email — they get a private setup link, choose a
              password, and manage their own chatbot.
            </p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-3.5" />
              Invite your first client
            </button>
          </div>
        ) : (
          <ul className="divide-y">
            {clients.map((client) => {
              const firstBotId = client.chatbotIds[0]
              return (
                <li key={client.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                      {initials(client.name, client.email)}
                    </div>

                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium">{client.name || '—'}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="size-3" />
                        {client.email}
                      </p>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {client.chatbotIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground/70">
                          No chatbot assigned
                        </span>
                      ) : (
                        client.chatbotIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              navigate({ to: '/chatbots/$botId', params: { botId: id } })
                            }
                            title="Open in editor"
                            className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {botNameById.get(id) ?? id}
                          </button>
                        ))
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <RowButton
                        disabled={!firstBotId}
                        title={firstBotId ? 'Preview the owner portal' : 'Assign a chatbot first'}
                        onClick={() => previewAsOwner(client)}
                      >
                        <Eye className="size-3.5" />
                        Preview
                      </RowButton>
                      <RowButton onClick={() => setAssignDialog({ client })}>Assign bots</RowButton>
                      <RowButton
                        onClick={() => {
                          const clientEmail = client.email
                          void apiFetch<{ setupToken: string }>(
                            `/api/admin/clients/${client.id}/reset`,
                            { method: 'POST' },
                          )
                            .then((res) =>
                              setLinkDialog({ email: clientEmail, setupToken: res.setupToken }),
                            )
                            .catch((err: unknown) => {
                              const api = (err as Error & { api?: AdminApiError }).api
                              setError(api?.message ?? 'Failed to create a setup link')
                            })
                        }}
                      >
                        <Link2 className="size-3.5" />
                        New link
                      </RowButton>
                      <button
                        type="button"
                        onClick={() => {
                          if (armedDeleteId !== client.id) {
                            setArmedDeleteId(client.id)
                            setTimeout(
                              () => setArmedDeleteId((id) => (id === client.id ? null : id)),
                              3000,
                            )
                            return
                          }
                          void removeClient(client.id)
                        }}
                        aria-label={
                          armedDeleteId === client.id
                            ? `Confirm remove ${client.email}`
                            : `Remove ${client.email}`
                        }
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                          armedDeleteId === client.id
                            ? 'bg-destructive text-white'
                            : 'text-muted-foreground hover:bg-muted hover:text-destructive'
                        }`}
                      >
                        <Trash2 className="size-3.5" />
                        {armedDeleteId === client.id ? 'Confirm?' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AddClientDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(email, token) => {
          setAddOpen(false)
          setLinkDialog({ email, setupToken: token })
          void load()
        }}
      />

      {assignDialog && (
        <AssignBotsDialog
          key={assignDialog.client.id}
          client={assignDialog.client}
          bots={bots ?? []}
          onClose={() => setAssignDialog(null)}
          onSaved={() => {
            setAssignDialog(null)
            void load()
          }}
        />
      )}

      {linkDialog && <SetupLinkDialog link={linkDialog} onClose={() => setLinkDialog(null)} />}
    </div>
  )
}

function RowButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function AddClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (email: string, setupToken: string) => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const res = await apiFetch<{ client: ClientView; setupToken: string }>('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      })
      onCreated(res.client.email, res.setupToken)
      setEmail('')
      setName('')
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setFormError(api?.message ?? 'Could not create the client')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a client"
      description="They receive no email yet — you'll copy a private setup link for them."
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label htmlFor="cl-name" className={labelClass}>
            Name <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            id="cl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="cl-email" className={labelClass}>
            Email
          </label>
          <input
            id="cl-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acmecafe.com"
            className={`${inputClass} mt-1.5`}
          />
        </div>

        {formError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
          >
            {busy && <LoaderCircle className="size-3.5 animate-spin" />}
            Create invite
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function SetupLinkDialog({
  link,
  onClose,
}: {
  link: { email: string; setupToken: string }
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const url = setupUrl(link.setupToken)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Setup link for ${link.email}`}
      description="Anyone with this one-time link chooses their own password. It expires in 7 days."
    >
      <div className="rounded-lg border bg-muted/40 p-3">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label="Setup link URL"
          className="w-full cursor-text rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Open link
          <ArrowRight className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <CircleAlert className="mt-0.5 size-3 shrink-0" />
        Copy it before closing — this dialog cannot show the same link twice.
      </p>
    </Dialog>
  )
}

function AssignBotsDialog({
  client,
  bots,
  onClose,
  onSaved,
}: {
  client: ClientView
  bots: ChatbotAdminView[]
  onClose: () => void
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<string[]>(client.chatbotIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/admin/clients/${client.id}/chatbots`, {
        method: 'PUT',
        body: JSON.stringify({ chatbotIds: selected }),
      })
      onSaved()
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Could not save assignments')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Chatbots for ${client.name || client.email}`}
      description="A chatbot can be assigned to several people — everyone assigned can edit its knowledge and look."
    >
      {bots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no chatbots yet. Create one first, then assign it here.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {bots.map((bot) => (
            <li key={bot.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors duration-150 hover:bg-muted/60">
                <input
                  type="checkbox"
                  checked={selected.includes(bot.id)}
                  onChange={() => toggle(bot.id)}
                  className="size-4 accent-current"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{bot.name}</span>
                {selected.includes(bot.id) && <Check className="size-4 shrink-0 text-primary" />}
              </label>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || bots.length === 0}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          {busy && <LoaderCircle className="size-3.5 animate-spin" />}
          Save assignments
        </button>
      </div>
    </Dialog>
  )
}
