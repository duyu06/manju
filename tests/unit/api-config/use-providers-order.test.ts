import { describe, expect, it } from 'vitest'
import { mergeProvidersForDisplay } from '@/app/[locale]/profile/components/api-config/hooks'
import type { Provider } from '@/app/[locale]/profile/components/api-config/types'

describe('useProviders official provider merge', () => {
  it('keeps canonical preset order and filters legacy intermediary providers', () => {
    const presetProviders: Provider[] = [
      { id: 'ark', name: '火山引擎 Ark' },
      { id: 'google', name: 'Google AI Studio' },
      { id: 'bailian', name: '阿里云百炼' },
    ]
    const savedProviders = [
      { id: 'google', name: 'Google Legacy Name', apiKey: 'google-key', hidden: true },
      { id: 'openai-compatible:oa-2', name: 'OpenAI Proxy', apiKey: 'proxy-key', baseUrl: 'https://proxy.example/v1' },
      { id: 'evolink', name: 'EvoLink', apiKey: 'evolink-key' },
      { id: 'ark', name: 'Ark Legacy Name', apiKey: 'ark-key' },
    ] as unknown as Provider[]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)

    expect(merged.map((provider) => provider.id)).toEqual(['ark', 'google', 'bailian'])
    expect(merged.find((provider) => provider.id === 'google')).toMatchObject({
      name: 'Google AI Studio',
      apiKey: 'google-key',
      hasApiKey: true,
      hidden: true,
      gatewayRoute: 'official',
    })
    expect(merged.find((provider) => provider.id === 'ark')).toMatchObject({
      apiKey: 'ark-key',
      hasApiKey: true,
      gatewayRoute: 'official',
    })
  })

  it('does not copy a legacy Base URL into the official provider view', () => {
    const presetProviders: Provider[] = [
      { id: 'minimax', name: 'MiniMax Hailuo' },
    ]
    const savedProviders = [
      {
        id: 'minimax',
        name: 'MiniMax Legacy',
        apiKey: 'mm-key',
        baseUrl: 'https://custom.minimax.proxy/v1',
      },
    ] as unknown as Provider[]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'minimax',
      name: 'MiniMax Hailuo',
      apiKey: 'mm-key',
      hasApiKey: true,
      gatewayRoute: 'official',
    })
    expect('baseUrl' in (merged[0] ?? {})).toBe(false)
  })
})
