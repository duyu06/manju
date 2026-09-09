import OpenAI from 'openai'
import { generateText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { GoogleGenAI } from '@google/genai'
import { getProviderConfig, getProviderKey } from '../api-config'
import { getInternalLLMStreamCallbacks } from '../llm-observe/internal-stream-context'
import type { ChatCompletionOptions } from './types'
import { extractGoogleParts, extractGoogleUsage, GoogleEmptyResponseError } from './providers/google'
import { buildOpenAIChatCompletion } from './providers/openai-compat'
import { getCompletionParts } from './completion-parts'
import {
  buildReasoningAwareContent,
  getConversationMessages,
  getSystemPrompt,
  mapReasoningEffort,
} from './utils'
import { shouldUseOpenAIReasoningProviderOptions } from './reasoning-capability'
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

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = toRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'unknown error'
}

/**
 * Run a chat completion using only a model vendor's official API.
 *
 * There is intentionally no relay/router fallback here. ProviderConfig has
 * already rejected non-official endpoints before this function is reached.
 */
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
    _ulogError('[LLM] 模型未配置，调用栈:', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()
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
      if (providerKey === 'google') {
        // No user-controlled base URL: Google SDK uses Google's official API.
        const ai = new GoogleGenAI({ apiKey: providerConfig.apiKey })
        const systemParts = messages
          .filter((m) => m.role === 'system')
          .map((m) => m.content)
          .filter(Boolean)
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

        const googleParts = extractGoogleParts(response, true)
        const usage = extractGoogleUsage(response)
        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(googleParts.text, googleParts.reasoning),
          usage,
        )
        logLlmRawOutput({
          userId,
          projectId,
          provider: 'google',
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: googleParts.text,
          reasoning: googleParts.reasoning,
          usage,
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: 'google',
          durationMs: Date.now() - attemptStartedAt,
          details: { model: resolvedModelId, attempt, maxRetries, transport: 'official' },
        })
        return completion
      }

      if (providerKey === 'bailian') {
        // The Bailian adapter owns the fixed DashScope official endpoint.
        const completion = await completeBailianLlm({
          modelId: resolvedModelId,
          messages,
          apiKey: providerConfig.apiKey,
          temperature,
        })
        const parts = getCompletionParts(completion)
        logLlmRawOutput({
          userId,
          projectId,
          provider: 'bailian',
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: parts.text,
          reasoning: parts.reasoning,
          usage: completionUsageSummary(completion),
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: 'bailian',
          durationMs: Date.now() - attemptStartedAt,
          details: { model: resolvedModelId, attempt, maxRetries, transport: 'official' },
        })
        return completion
      }

      if (providerKey === 'ark') {
        const { arkResponsesCompletion, convertChatMessagesToArkInput, buildArkThinkingParam } = await import('@/lib/ark-llm')
        const arkThinkingParams = buildArkThinkingParam(resolvedModelId, reasoning)
        const arkResult = await arkResponsesCompletion({
          apiKey: providerConfig.apiKey,
          model: resolvedModelId,
          input: convertChatMessagesToArkInput(messages),
          thinking: arkThinkingParams.thinking,
        })
        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(arkResult.text, arkResult.reasoning),
          arkResult.usage,
        )
        logLlmRawOutput({
          userId,
          projectId,
          provider: 'ark',
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: arkResult.text,
          reasoning: arkResult.reasoning,
          usage: arkResult.usage,
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: 'ark',
          durationMs: Date.now() - attemptStartedAt,
          details: { model: resolvedModelId, attempt, maxRetries, transport: 'official' },
        })
        return completion
      }

      if (providerKey === 'openai' || providerKey === 'openai-compatible') {
        if (!providerConfig.baseUrl) {
          throw new Error(`OFFICIAL_PROVIDER_URL_REQUIRED: ${provider}`)
        }
        // For openai-compatible, api-config.ts has already restricted baseUrl
        // to an explicit first-party vendor host allowlist.
        const aiOpenAI = createOpenAI({
          baseURL: providerConfig.baseUrl,
          apiKey: providerConfig.apiKey,
          name: providerKey === 'openai' ? 'openai' : 'official-openai-compatible',
        })
        const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
          providerKey,
          providerApiMode: providerConfig.apiMode,
          modelId: resolvedModelId,
        })
        const aiSdkProviderOptions = reasoning && isNativeOpenAIReasoning
          ? {
            openai: {
              reasoningEffort: mapReasoningEffort(reasoningEffort),
              forceReasoning: true,
            },
          }
          : undefined
        const result = await generateText({
          model: aiOpenAI.chat(resolvedModelId),
          system: getSystemPrompt(messages),
          messages: getConversationMessages(messages) as ModelMessage[],
          ...(reasoning ? {} : { temperature }),
          maxRetries,
          ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
        })
        const usage = result.usage || result.totalUsage
        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(result.text || '', result.reasoningText || ''),
          {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          },
        )
        logLlmRawOutput({
          userId,
          projectId,
          provider: providerKey,
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: result.text || '',
          reasoning: result.reasoningText || '',
          usage: {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          },
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: providerKey,
          durationMs: Date.now() - attemptStartedAt,
          details: { model: resolvedModelId, attempt, maxRetries, transport: 'official' },
        })
        return completion
      }

      throw new Error(`DIRECT_OFFICIAL_PROVIDER_REQUIRED: ${provider}`)
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(errorMessage(error))
      lastError = normalizedError
      llmLogger.warn({
        action: 'llm.call.attempt_failed',
        message: errorMessage(error) || 'llm call attempt failed',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: { model: resolvedModelId, attempt, maxRetries },
      })

      const errorBody = toRecord(toRecord(error)?.error) || toRecord(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        _ulogError('[LLM] ❌ 内容安全检测失败 - provider refused this content')
        throw new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      }

      if (error instanceof GoogleEmptyResponseError) {
        _ulogWarn(`[LLM] Google 返回空响应，将重试 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)
        if (attempt > maxRetries) break
        await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * attempt, 8000)))
        continue
      }

      _ulogWarn(`[LLM] 调用失败 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)
      if (!isRetryableError(error) || attempt > maxRetries) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)))
    }
  }

  throw lastError || new Error('LLM 调用失败')
}
