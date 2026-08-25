import type { ModelOption } from '@sitelift/shared'
import { Check, ChevronDown, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AdminApiError, apiFetch } from '../../lib/api'

function fmtPrice(perMillion: number): string {
  if (perMillion === 0) return '0'
  if (perMillion < 0.01) return String(Number.parseFloat(perMillion.toPrecision(3)))
  return perMillion.toFixed(2)
}

export function ModelPicker({
  model,
  onSelect,
  emptyLabel = 'Use global default',
  clearLabel = 'Use global default instead',
}: {
  model: string
  onSelect: (id: string) => void
  emptyLabel?: string
  clearLabel?: string
}) {
  const [modelOptions, setModelOptions] = useState<ModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [globalBaseUrl, setGlobalBaseUrl] = useState('')
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError('')
    try {
      let settingsBaseUrl = globalBaseUrl
      if (settingsBaseUrl === '') {
        const settings = await apiFetch<{ baseUrl: string }>('/api/admin/settings')
        settingsBaseUrl = settings.baseUrl ?? ''
        setGlobalBaseUrl(settingsBaseUrl)
      }
      const effectiveBaseUrl = settingsBaseUrl || 'https://api.openai.com/v1'
      const data = await apiFetch<{ models: ModelOption[] }>(
        `/api/admin/models?baseUrl=${encodeURIComponent(effectiveBaseUrl)}`,
      )
      setModelOptions(
        [...data.models].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      )
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setModelsError(api?.message ?? 'Could not load models')
    } finally {
      setModelsLoading(false)
    }
  }, [globalBaseUrl])

  const filteredModels = useMemo(() => {
    if (!modelOptions) return []
    const q = modelFilter.toLowerCase()
    return modelOptions.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q))
  }, [modelOptions, modelFilter])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${model || 'none selected'}`}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && !modelOptions) void loadModels()
        }}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      >
        <span className="min-w-0">
          {(() => {
            const selected = modelOptions?.find((m) => m.id === model)
            return (
              <>
                <span className={`block truncate text-sm ${model ? '' : 'text-muted-foreground'}`}>
                  {selected?.name ?? (model || emptyLabel)}
                </span>
                {selected ? (
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {selected.id}
                  </span>
                ) : (
                  !model && (
                    <span className="block truncate text-xs text-muted-foreground/60">
                      Set in Settings · each bot can override
                    </span>
                  )
                )}
              </>
            )
          })()}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b bg-muted/40 p-2">
            <input
              ref={searchRef}
              type="text"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && filteredModels.length > 0) {
                  const first = filteredModels[0]
                  if (!first) return
                  onSelect(first.id)
                  setOpen(false)
                }
              }}
              placeholder={
                modelsLoading ? 'Loading models…' : `Search ${modelOptions?.length ?? 0} models…`
              }
              aria-label="Search models"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
            />
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto">
            {model && (
              <li className="border-b">
                <button
                  type="button"
                  onClick={() => {
                    onSelect('')
                    setOpen(false)
                    setModelFilter('')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <RotateCcw className="size-3.5 shrink-0" />
                  {clearLabel}
                </button>
              </li>
            )}
            {modelsError && <li className="px-3 py-3 text-sm text-destructive">{modelsError}</li>}
            {modelsLoading &&
              ['a', 'b', 'c', 'd', 'e'].map((id) => (
                <li key={id} className="px-3 py-2.5">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-muted" />
                </li>
              ))}
            {!modelsLoading &&
              filteredModels.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === model}
                    onClick={() => {
                      onSelect(m.id)
                      setOpen(false)
                      setModelFilter('')
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{m.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {m.id}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                      {m.promptPricePerM !== null && (
                        <span className="block">in ${fmtPrice(m.promptPricePerM)} / M</span>
                      )}
                      {m.completionPricePerM !== null && (
                        <span className="block">out ${fmtPrice(m.completionPricePerM)} / M</span>
                      )}
                    </span>
                    {m.id === model && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              ))}
            {!modelsLoading && !modelsError && filteredModels.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No models match “{modelFilter}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
