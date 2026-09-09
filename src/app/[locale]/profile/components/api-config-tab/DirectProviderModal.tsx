'use client'

import { useEffect, useState } from 'react'
import type { Provider } from '../api-config'
import { AppIcon } from '@/components/ui/icons'

type DirectApiType = 'openai' | 'google'

interface DirectProviderModalProps {
  open: boolean
  onClose: () => void
  onAdd: (provider: Omit<Provider, 'hasApiKey'>) => void
  labels: {
    title: string
    description: string
    apiType: string
    openaiCompatible: string
    geminiCompatible: string
    providerName: string
    providerNamePlaceholder: string
    baseUrl: string
    baseUrlHint: string
    apiKey: string
    apiKeyPlaceholder: string
    directNotice: string
    invalidUrl: string
    cancel: string
    add: string
  }
}

const OFFICIAL_PROVIDERS: Record<DirectApiType, { name: string; baseUrl: string; apiMode?: 'openai-official' | 'gemini-sdk' }> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiMode: 'openai-official',
  },
  google: {
    name: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiMode: 'gemini-sdk',
  },
}

export function DirectProviderModal({ open, onClose, onAdd, labels }: DirectProviderModalProps) {
  const [apiType, setApiType] = useState<DirectApiType>('openai')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (!open) return
    setApiType('openai')
    setApiKey('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const selected = OFFICIAL_PROVIDERS[apiType]

  const handleSubmit = () => {
    if (!apiKey.trim()) return
    onAdd({
      id: apiType,
      name: selected.name,
      baseUrl: selected.baseUrl,
      apiKey: apiKey.trim(),
      apiMode: selected.apiMode,
      gatewayRoute: 'official',
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-provider-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#e5e5e5] px-5 py-4">
          <div>
            <h3 id="direct-provider-title" className="text-base font-semibold text-[#171717]">{labels.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#737373]">
              Only official first-party endpoints are supported. Custom gateways, relays and compatible proxy URLs are disabled.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#737373] hover:bg-[#f5f5f5]" aria-label={labels.cancel}>
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#525252]">{labels.apiType}</label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f5f5f5] p-1">
              {([
                ['openai', 'OpenAI Official'],
                ['google', 'Google AI Studio'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setApiType(value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${apiType === value ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#525252]">Official endpoint</label>
            <div className="w-full rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 font-mono text-sm text-[#525252]">
              {selected.baseUrl}
            </div>
            <p className="mt-1 text-[11px] text-[#8a8a8a]">Endpoint is fixed by the application and cannot be edited.</p>
          </div>

          <div>
            <label htmlFor="direct-provider-key" className="mb-1.5 block text-xs font-medium text-[#525252]">{labels.apiKey}</label>
            <input
              id="direct-provider-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={labels.apiKeyPlaceholder}
              className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 font-mono text-sm text-[#171717] outline-none focus:border-[#171717]"
              autoFocus
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3 py-2.5 text-xs leading-relaxed text-[#1e40af]">
            <AppIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The application server sends requests directly to {selected.baseUrl}; no relay or compatibility gateway is used.</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#525252]">
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {labels.add}
          </button>
        </div>
      </div>
    </div>
  )
}
