import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { getProviderConfig, getProviderKey } from '../api-config'
import { getInternalLLMStreamCallbacks } from '../llm-observe/internal-stream-context'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { arkResponsesCompletion } from './providers/ark'
import { extractGoogleText, extractGoogleUsage } from './providers/google'
import { buildChatCompletionResult } from './completion-result'
import { emitChunkedText } from './stream-helpers'
import { getCompletionParts } from './completion-parts'
import { isRetryableError, recordCompletionUsage, resolveLlmRuntimeModel } from './runtime-shared'

type GooglePart = { inlineData: { mimeType: string; data: string } } | { text: string }
type ArkPart = { type: 'input_image'; image_url: string } | { type: 'input_text'; text: string }
type OpenAIPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')
  return await normalizeToBase64ForGeneration(url)
}

export async function chatCompletionWithVision(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    return await chatCompletionWithVisionStream(userId, model, textPrompt, imageUrls, { ...options, __skipAutoStream: true }, internalCallbacks)
  }
  if (!model) throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')

  const selection = await resolveLlmRuntimeModel(userId, model)
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()
  if (!['google', 'ark', 'openai'].includes(providerKey)) {
    throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: vision provider ${provider}`)
  }
  const config = await getProviderConfig(userId, provider)
  const temperature = options.temperature ?? 0.7
  const maxRetries = options.maxRetries ?? 2
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      if (providerKey === 'google') {
        const ai = new GoogleGenAI({ apiKey: config.apiKey })
        const parts: GooglePart[] = []
        for (const url of imageUrls) {
          const dataUrl = await toDataUrl(url)
          const marker = dataUrl.indexOf(';base64,')
          if (marker !== -1) parts.push({ inlineData: { mimeType: dataUrl.substring(5, marker), data: dataUrl.substring(marker + 8) } })
        }
        if (textPrompt) parts.push({ text: textPrompt })
        const response = await ai.models.generateContent({ model: selection.modelId, contents: [{ role: 'user', parts }], config: { temperature } })
        const completion = buildChatCompletionResult(selection.modelId, extractGoogleText(response), extractGoogleUsage(response))
        recordCompletionUsage(selection.modelId, completion)
        return completion
      }

      if (providerKey === 'ark') {
        const content: ArkPart[] = []
        for (const url of imageUrls) content.push({ type: 'input_image', image_url: url.startsWith('http') || url.startsWith('data:') ? url : await toDataUrl(url) })
        if (textPrompt) content.push({ type: 'input_text', text: textPrompt })
        const result = await arkResponsesCompletion({
          apiKey: config.apiKey,
          model: selection.modelId,
          input: [{ role: 'user', content }],
          thinking: { type: (options.reasoning ?? true) ? 'enabled' : 'disabled' },
        })
        const completion = buildChatCompletionResult(selection.modelId, result.text, result.usage)
        recordCompletionUsage(selection.modelId, completion)
        return completion
      }

      const client = new OpenAI({ apiKey: config.apiKey, baseURL: 'https://api.openai.com/v1' })
      const content: OpenAIPart[] = []
      if (textPrompt) content.push({ type: 'text', text: textPrompt })
      for (const url of imageUrls) content.push({ type: 'image_url', image_url: { url: url.startsWith('http') || url.startsWith('data:') ? url : await toDataUrl(url) } })
      const completion = await client.chat.completions.create({
        model: selection.modelId,
        messages: [{ role: 'user', content }],
        temperature,
      })
      recordCompletionUsage(selection.modelId, completion)
      return completion
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (!isRetryableError(error) || attempt > maxRetries) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 5000)))
    }
  }
  throw lastError || new Error('LLM Vision 调用失败')
}

export async function chatCompletionWithVisionStream(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  callbacks?.onStage?.({ stage: 'submit' })
  try {
    const completion = await chatCompletionWithVision(userId, model, textPrompt, imageUrls, { ...options, __skipAutoStream: true })
    const parts = getCompletionParts(completion)
    let seq = 1
    if (parts.reasoning) seq = emitChunkedText(parts.reasoning, callbacks, 'reasoning', seq)
    emitChunkedText(parts.text, callbacks, 'text', seq)
    callbacks?.onStage?.({ stage: 'completed' })
    callbacks?.onComplete?.(parts.text)
    return completion
  } catch (error) {
    callbacks?.onError?.(error, undefined)
    throw error
  }
}
