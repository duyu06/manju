import { describe, expect, it } from 'vitest'
import {
  getAddableModelTypesForProvider,
  getVisibleModelTypesForProvider,
} from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'

describe('provider card official model form behavior', () => {
  it('offers model categories without exposing a compatibility-provider branch', () => {
    expect(getAddableModelTypesForProvider('ark')).toEqual(['llm', 'image', 'video', 'audio'])
    expect(getAddableModelTypesForProvider('google')).toEqual(['llm', 'image', 'video', 'audio'])
  })

  it('shows only categories that have configured models', () => {
    const visible = getVisibleModelTypesForProvider(
      'google',
      {
        llm: [
          {
            modelId: 'gemini-3.1-pro-preview',
            modelKey: 'google::gemini-3.1-pro-preview',
            name: 'Gemini 3.1 Pro',
            type: 'llm',
            provider: 'google',
            price: 0,
            enabled: true,
          },
        ],
        image: [
          {
            modelId: 'gemini-3-pro-image-preview',
            modelKey: 'google::gemini-3-pro-image-preview',
            name: 'Gemini Image',
            type: 'image',
            provider: 'google',
            price: 0,
            enabled: true,
          },
        ],
      },
    )

    expect(visible).toEqual(['llm', 'image'])
  })
})
