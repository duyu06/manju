/**
 * Runtime policy for model-provider outbound traffic.
 *
 * Only first-party model vendor APIs are allowed. Aggregators, relays,
 * arbitrary OpenAI-compatible gateways and user-supplied proxy endpoints
 * are intentionally rejected before any outbound request is created.
 */

export const OFFICIAL_PROVIDER_KEYS = [
  'openai',
  'google',
  'ark',
  'bailian',
  'minimax',
  'vidu',
] as const

export type OfficialProviderKey = (typeof OFFICIAL_PROVIDER_KEYS)[number]

const OFFICIAL_PROVIDER_SET = new Set<string>(OFFICIAL_PROVIDER_KEYS)

const BLOCKED_RELAY_PROVIDER_KEYS = new Set([
  'evolink',
  'fal',
  'siliconflow',
  'openrouter',
  'openai-compatible',
  'gemini-compatible',
  'litellm',
  'relay',
  'proxy',
  'gateway',
])

export function normalizeProviderKey(providerId: string): string {
  const trimmed = providerId.trim().toLowerCase()
  const delimiter = trimmed.indexOf(':')
  return delimiter === -1 ? trimmed : trimmed.slice(0, delimiter)
}

export function isOfficialProvider(providerId: string): boolean {
  return OFFICIAL_PROVIDER_SET.has(normalizeProviderKey(providerId))
}

export function assertOfficialProvider(providerId: string): OfficialProviderKey {
  const providerKey = normalizeProviderKey(providerId)
  if (BLOCKED_RELAY_PROVIDER_KEYS.has(providerKey)) {
    throw new Error(`MODEL_RELAY_FORBIDDEN: ${providerKey}`)
  }
  if (!OFFICIAL_PROVIDER_SET.has(providerKey)) {
    throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${providerKey || providerId}`)
  }
  return providerKey as OfficialProviderKey
}

export const OFFICIAL_PROVIDER_BASE_URLS: Record<OfficialProviderKey, string> = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  ark: 'https://ark.cn-beijing.volces.com/api/v3',
  bailian: 'https://dashscope.aliyuncs.com',
  minimax: 'https://api.minimaxi.com/v1',
  vidu: 'https://api.vidu.cn',
}

export function assertOfficialBaseUrl(providerId: string, rawBaseUrl?: string): string {
  const providerKey = assertOfficialProvider(providerId)
  const expected = new URL(OFFICIAL_PROVIDER_BASE_URLS[providerKey])
  if (!rawBaseUrl?.trim()) return expected.toString().replace(/\/$/, '')

  let actual: URL
  try {
    actual = new URL(rawBaseUrl.trim())
  } catch {
    throw new Error(`OFFICIAL_PROVIDER_BASE_URL_INVALID: ${providerKey}`)
  }

  if (actual.protocol !== 'https:' || actual.hostname !== expected.hostname) {
    throw new Error(`OFFICIAL_PROVIDER_BASE_URL_FORBIDDEN: ${providerKey}/${actual.hostname}`)
  }

  return expected.toString().replace(/\/$/, '')
}
