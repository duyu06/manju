import { getProviderKey } from '@/lib/api-config'
import type { ModelGatewayRoute } from './types'

const BLOCKED_COMPAT_PROVIDER_KEYS = new Set([
  'evolink',
  'fal',
  'siliconflow',
  'openrouter',
  'openai-compatible',
  'gemini-compatible',
])

/**
 * Official-only mode never treats protocol-compatible endpoints as approved providers.
 */
export function isCompatibleProvider(_providerId: string): boolean {
  return false
}

export function resolveModelGatewayRoute(providerId: string): ModelGatewayRoute {
  const providerKey = getProviderKey(providerId).toLowerCase()
  if (BLOCKED_COMPAT_PROVIDER_KEYS.has(providerKey)) {
    throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${providerId} cannot use the compatibility gateway`)
  }
  return 'official'
}
