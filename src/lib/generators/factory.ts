/**
 * Media generator factory.
 *
 * Security invariant: only first-party model-vendor adapters are reachable here.
 * Aggregators/relays and arbitrary compatible gateways must never be registered.
 */

import { ImageGenerator, VideoGenerator, AudioGenerator } from './base'
import { ArkSeedreamGenerator, ArkSeedanceVideoGenerator } from './ark'
import {
  GoogleGeminiImageGenerator,
  GoogleImagenGenerator,
  GoogleGeminiBatchImageGenerator,
} from './image'
import { GoogleVeoVideoGenerator } from './video/google'
import { MinimaxVideoGenerator } from './minimax'
import { ViduVideoGenerator } from './vidu'
import { getProviderKey } from '@/lib/api-config'
import {
  BailianAudioGenerator,
  BailianImageGenerator,
  BailianVideoGenerator,
} from './official'

function directProviderKey(provider: string): string {
  return getProviderKey(provider).toLowerCase()
}

/** Create an image generator backed by the model vendor's official API. */
export function createImageGenerator(provider: string, modelId?: string): ImageGenerator {
  const normalizeModelId = (rawModelId?: string): string | undefined => {
    if (!rawModelId) return rawModelId
    const delimiterIndex = rawModelId.indexOf('::')
    return delimiterIndex === -1 ? rawModelId : rawModelId.slice(delimiterIndex + 2)
  }

  const actualModelId = normalizeModelId(modelId)
  switch (directProviderKey(provider)) {
    case 'google':
      if (actualModelId === 'gemini-3-pro-image-preview-batch') {
        return new GoogleGeminiBatchImageGenerator()
      }
      if (actualModelId && actualModelId.startsWith('imagen-')) {
        return new GoogleImagenGenerator(actualModelId)
      }
      return new GoogleGeminiImageGenerator(actualModelId)
    case 'google-batch':
      return new GoogleGeminiBatchImageGenerator()
    case 'imagen':
      return new GoogleImagenGenerator(actualModelId)
    case 'ark':
      return new ArkSeedreamGenerator()
    case 'bailian':
      return new BailianImageGenerator()
    default:
      throw new Error(`DIRECT_OFFICIAL_PROVIDER_REQUIRED: unsupported image provider ${provider}`)
  }
}

/** Create a video generator backed by the model vendor's official API. */
export function createVideoGenerator(provider: string): VideoGenerator {
  switch (directProviderKey(provider)) {
    case 'ark':
      return new ArkSeedanceVideoGenerator()
    case 'google':
      return new GoogleVeoVideoGenerator()
    case 'minimax':
      return new MinimaxVideoGenerator()
    case 'vidu':
      return new ViduVideoGenerator()
    case 'bailian':
      return new BailianVideoGenerator()
    default:
      throw new Error(`DIRECT_OFFICIAL_PROVIDER_REQUIRED: unsupported video provider ${provider}`)
  }
}

/** Create an audio generator backed by the model vendor's official API. */
export function createAudioGenerator(provider: string): AudioGenerator {
  switch (directProviderKey(provider)) {
    case 'bailian':
      return new BailianAudioGenerator()
    default:
      throw new Error(`DIRECT_OFFICIAL_PROVIDER_REQUIRED: unsupported audio provider ${provider}`)
  }
}
