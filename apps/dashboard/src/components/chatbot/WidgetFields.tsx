import { Image as ImageIcon, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormSetter, FormState } from './state'

const LOGO_MAX_EDGE = 256

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Not a valid image'))
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Could not process the image'))
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function WidgetFields({
  form,
  set,
  forOwner = false,
}: {
  form: FormState
  set: FormSetter
  forOwner?: boolean
}) {
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoBusy(true)
    setLogoError('')
    try {
      const dataUrl = await readLogoFile(file)
      set('avatarUrl', dataUrl)
    } catch (err) {
      setLogoError((err as Error).message)
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-medium">Widget Settings</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {forOwner
          ? 'What visitors see in the chat widget on your website.'
          : "What visitors see in the chat widget on your client's site."}
      </p>

      <div className="mt-5 flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        {form.showLogo ? (
          <div
            className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-background text-sm font-semibold ring-1 ring-border"
            style={{ color: form.brandColor }}
          >
            {form.avatarUrl.trim() ? (
              <img src={form.avatarUrl.trim()} alt="" className="size-full object-contain p-1" />
            ) : (
              form.name.trim().slice(0, 1).toUpperCase() || '?'
            )}
          </div>
        ) : (
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background ring-1 ring-border">
            <ImageIcon className="size-4 text-muted-foreground/50" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {form.showName ? (
            <p className="truncate text-sm font-medium">{form.name.trim() || 'Business name'}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Name hidden</p>
          )}
          {form.showOnlineStatus ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-[#34c759]" /> Online now
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/70">Status hidden</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-5">
        <div className="border-b border-border/60 pb-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showLogo}
              onChange={(e) => set('showLogo', e.target.checked)}
              className="size-4 accent-current"
            />
            Show logo
          </label>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {form.showLogo
              ? 'Show a logo or image in the header. Falls back to the bot’s initial if none set.'
              : 'Hide the logo from the widget header.'}
          </p>
          {form.showLogo && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoBusy}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {logoBusy ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {form.avatarUrl.trim() ? 'Replace logo' : 'Upload logo'}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Upload logo image"
                onChange={(e) => void onLogoFile(e)}
              />
              {form.avatarUrl.trim() && (
                <button
                  type="button"
                  onClick={() => set('avatarUrl', '')}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Trash2 className="size-3" /> Remove
                </button>
              )}
              {logoError && <p className="w-full text-[13px] text-destructive">{logoError}</p>}
            </div>
          )}
        </div>

        <div className="border-b border-border/60 pb-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showName}
              onChange={(e) => set('showName', e.target.checked)}
              className="size-4 accent-current"
            />
            Show business name
          </label>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {form.showName
              ? 'Displays the business name in the header.'
              : 'Hide the business name from the widget header.'}
          </p>
        </div>

        <div className="border-b border-border/60 pb-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showOnlineStatus}
              onChange={(e) => set('showOnlineStatus', e.target.checked)}
              className="size-4 accent-current"
            />
            Show “Online now” status
          </label>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {form.showOnlineStatus
              ? 'Displays a green dot and “Online now” under the name.'
              : 'Hide the online status from the widget header.'}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.poweredBy}
              onChange={(e) => set('poweredBy', e.target.checked)}
              className="size-4 accent-current"
            />
            Show “Powered by SiteLift” badge
          </label>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Adds a small link back to SiteLift under the chat.
          </p>
        </div>
      </div>
    </section>
  )
}
