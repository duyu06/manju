import { describe, expect, it } from 'vitest'
import { PRESET_MODELS, PRESET_PROVIDERS } from '@/app/[locale]/profile/components/api-config/types'

describe('api-config minimax preset', () => {
  it('does not expose a mutable Base URL on the MiniMax provider', () => {
    const minimaxProvider = PRESET_PROVIDERS.find((provider) => provider.id === 'minimax')
    expect(minimaxProvider).toBeDefined()
    expect('baseUrl' in (minimaxProvider ?? {})).toBe(false)
  })

  it('includes all required minimax official llm preset models', () => {
    const minimaxLlmModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'llm')
      .map((model) => model.modelId)

    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2')
  })
})
