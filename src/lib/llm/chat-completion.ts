import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { getProviderConfig } from '../api-config'
import { getInternalLLMStreamCallbacks } from '../llm-observe/internal-stream-context'
import type { ChatCompletionOptions } from './types'
import { extractGoogleParts, extractGoogleUsage, GoogleEmptyResponseError } from './providers/google'
import { buildReasoningAwareContent } from './utils'
import {
  _ulogError,
  _ulogWarn,
  completionUsageSummary,
  isRetryableError,
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from './runtime-shared'
import { completeBailianLlm } from '@/lib/providers/bailian'
import {
  OFFICIAL_PROVIDER_BASE_URLS,
  assertOfficialProvider,
} from '@/lib/providers/official/provider-policy'

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = toRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'unknown error'
}

function buildNormalizedCompletion(
  modelId: string,
  text: string,
  usage?: { promptTokens?: number; completionTokens?: number },
): OpenAI.Chat.Completions.ChatCompletion {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `direct-${now}`,
    object: 'chat.completion',
    created: now,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: {
          role: 'assistant',
          content: text,
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: usage?.promptTokens ?? 0,
      completion_tokens: usage?.completionTokens ?? 0,
      total_tokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    },
  }
}

export async function chatCompletion(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    const { chatCompletionStream } = await import('./chat-stream')
    return await chatCompletionStream(
      userId,
      model,
      messages,
      { ...options, __skipAutoStream: true },
      internalCallbacks,
    )
  }

  if (!model) {
    _ulogError('[LLM] model not configured', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = assertOfficialProvider(provider)
  const providerConfig = await getProviderConfig(userId, provider)

  const {
    temperature = 0.7,
    reasoning = true,
    reasoningEffort = 'high',
    maxRetries = 2,
  } = options
  const projectId = typeof options.projectId === 'string' && options.projectId.trim()
    ? options.projectId.trim()
    : undefined

  logLlmRawInput({
    userId,
    projectId,
    provider: providerKey,
    modelId: resolvedModelId,
    modelKey: selection.modelKey,
    stream: false,
    reasoning,
    reasoningEffort,
    temperature,
    action: options.action,
    messages,
  })

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const attemptStartedAt = Date.now()
    try {
      let completion: OpenAI.Chat.Completions.ChatCompletion

      if (providerKey === 'google') {
        const ai = new GoogleGenAI({
          apiKey: providerConfig.apiKey,
          httpOptions: { baseUrl: OFFICIAL_PROVIDER_BASE_URLS.google },
        })
        const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content).filter(Boolean)
        const contents = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))
        const systemInstruction = systemParts.length > 0
          ? { parts: [{ text: systemParts.join('\n') }] }
          : undefined
        const supportsThinkingLevel = resolvedModelId.startsWith('gemini-3')
        const thinkingConfig = reasoning && supportsThinkingLevel
          ? { thinkingLevel: reasoningEffort, includeThoughts: true }
          : undefined
        const response = await ai.models.generateContent({
          model: resolvedModelId,
          contents,
          config: {
            temperature,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        } as unknown as Parameters<typeof ai.models.generateContent>[0])
        const parts = extractGoogleParts(response, true)
        const usage = extractGoogleUsage(response)
        completion = buildNormalizedCompletion(
          resolvedModelId,
          buildReasoningAwareContent(parts.text, parts.reasoning),
          usage,
        )
      } else if (providerKey === 'ark') {
        const { arkResponsesCompletion, convertChatMessagesToArkInput, buildArkThinkingParam } = await import('@/lib/ark-llm')
        const thinking = buildArkThinkingParam(resolvedModelId, reasoning)
        const result = await arkResponsesCompletion({
          apiKey: providerConfig.apiKey,
          model: resolvedModelId,
          input: convertChatMessagesToArkInput(messages),
          thinking: thinking.thinking,
        })
        completion = buildNormalizedCompletion(
          resolvedModelId,
          buildReasoningAwareContent(result.text, result.reasoning),
          result.usage,
        )
      } else if (providerKey === 'bailian') {
        completion = await completeBailianLlm({
          modelId: resolvedModelId,
          messages,
          apiKey: providerConfig.apiKey,
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          temperature,
        })
      } else if (providerKey === 'openai' || providerKey === 'minimax') {
        const client = new OpenAI({
          apiKey: providerConfig.apiKey,
          baseURL: OFFICIAL_PROVIDER_BASE_URLS[providerKey],
          timeout: 30_000,
        })
        completion = await client.chat.completions.create({
          model: resolvedModelId,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          ...(reasoning ? {} : { temperature }),
        }) as OpenAI.Chat.Completions.ChatCompletion
      } else {
        throw new Error(`OFFICIAL_LLM_PROVIDER_UNSUPPORTED: ${providerKey}`)
      }

      const text = completion.choices?.[0]?.message?.content || ''
      logLlmRawOutput({
        userId,
        projectId,
        provider: providerKey,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: false,
        action: options.action,
        text,
        reasoning: '',
        usage: completionUsageSummary(completion),
      })
      recordCompletionUsage(resolvedModelId, completion)
      llmLogger.info({
        action: 'llm.call.success',
        message: 'llm call succeeded',
        provider: providerKey,
        durationMs: Date.now() - attemptStartedAt,
        details: { model: resolvedModelId, attempt, maxRetries, engine: 'official_direct' },
      })
      return completion
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(errorMessage(error))
      lastError = normalizedError
      llmLogger.warn({
        action: 'llm.call.attempt_failed',
        message: errorMessage(error) || 'llm call attempt failed',
        provider: providerKey,
        durationMs: Date.now() - attemptStartedAt,
        details: { model: resolvedModelId, attempt, maxRetries },
      })

      const errorBody = toRecord(toRecord(error)?.error) || toRecord(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        throw new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      }
      if (error instanceof GoogleEmptyResponseError) {
        _ulogWarn(`[LLM] Google empty response, retrying (${attempt}/${maxRetries + 1})`)
      } else {
        _ulogWarn(`[LLM] request failed (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)
      }
      if (!isRetryableError(error) && !(error instanceof GoogleEmptyResponseError)) break
      if (attempt > maxRetries) break
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError || new Error('LLM 调用失败')
}
