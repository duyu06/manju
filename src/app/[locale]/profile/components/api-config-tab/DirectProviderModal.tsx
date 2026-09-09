'use client'

import { useEffect, useState } from 'react'
import type { Provider } from '../api-config'
import { AppIcon } from '@/components/ui/icons'

type DirectApiType = 'openai-compatible' | 'gemini-compatible'

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

const DEFAULT_BASE_URLS: Record<DirectApiType, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  'gemini-compatible': 'https://generativelanguage.googleapis.com',
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function DirectProviderModal({
  open,
  onClose,
  onAdd,
  labels,
}: DirectProviderModalProps) {
  const [apiType, setApiType] = useState<DirectApiType>('openai-compatible')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS['openai-compatible'])
  const [apiKey, setApiKey] = useState('')
  const [urlError, setUrlError] = useState(false)

  useEffect(() => {
    if (!open) return
    setApiType('openai-compatible')
    setName('')
    setBaseUrl(DEFAULT_BASE_URLS['openai-compatible'])
    setApiKey('')
    setUrlError(false)
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

  const handleTypeChange = (nextType: DirectApiType) => {
    setApiType(nextType)
    setBaseUrl(DEFAULT_BASE_URLS[nextType])
    setUrlError(false)
  }

  const handleSubmit = () => {
    const normalizedName = name.trim()
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
    if (!normalizedName) return
    if (!isValidHttpUrl(normalizedBaseUrl)) {
      setUrlError(true)
      return
    }

    const instanceId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    onAdd({
      id: `${apiType}:${instanceId}`,
      name: normalizedName,
      baseUrl: normalizedBaseUrl,
      apiKey: apiKey.trim(),
      apiMode: apiType === 'gemini-compatible' ? 'gemini-sdk' : undefined,
      gatewayRoute: apiType === 'openai-compatible' ? 'openai-compat' : 'official',
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
            <h3 id="direct-provider-title" className="text-base font-semibold text-[#171717]">
              {labels.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#737373]">{labels.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#f5f5f5] hover:text-[#171717]"
            aria-label={labels.cancel}
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#525252]">{labels.apiType}</label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f5f5f5] p-1">
              {([
                ['openai-compatible', labels.openaiCompatible],
                ['gemini-compatible', labels.geminiCompatible],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTypeChange(value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    apiType === value
                      ? 'bg-white text-[#171717] shadow-sm'
                      : 'text-[#737373] hover:text-[#171717]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="direct-provider-name" className="mb-1.5 block text-xs font-medium text-[#525252]">
              {labels.providerName}
            </label>
            <input
              id="direct-provider-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={labels.providerNamePlaceholder}
              className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm text-[#171717] outline-none transition-colors focus:border-[#171717]"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="direct-provider-url" className="mb-1.5 block text-xs font-medium text-[#525252]">
              {labels.baseUrl}
            </label>
            <input
              id="direct-provider-url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setUrlError(false)
              }}
              className={`w-full rounded-lg border px-3 py-2 font-mono text-sm text-[#171717] outline-none transition-colors ${
                urlError ? 'border-[#dc2626]' : 'border-[#e5e5e5] focus:border-[#171717]'
              }`}
            />
            <p className={`mt-1 text-[11px] ${urlError ? 'text-[#dc2626]' : 'text-[#8a8a8a]'}`}>
              {urlError ? labels.invalidUrl : labels.baseUrlHint}
            </p>
          </div>

          <div>
            <label htmlFor="direct-provider-key" className="mb-1.5 block text-xs font-medium text-[#525252]">
              {labels.apiKey}
            </label>
            <input
              id="direct-provider-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={labels.apiKeyPlaceholder}
              className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 font-mono text-sm text-[#171717] outline-none transition-colors focus:border-[#171717]"
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3 py-2.5 text-xs leading-relaxed text-[#1e40af]">
            <AppIcon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{labels.directNotice}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#525252] transition-colors hover:border-[#d4d4d4]"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || !baseUrl.trim()}
            className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {labels.add}
          </button>
        </div>
      </div>
    </div>
  )
}
