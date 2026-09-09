import OpenAI from 'openai'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { chatCompletion } from './chat-completion'
import { getCompletionParts } from './completion-parts'
import {
  emitChunkedText,
  emitStreamStage,
  resolveStreamStepMeta,
} from './stream-helpers'
import { resolveLlmRuntimeModel } from './runtime-shared'

/**
 * Streaming facade for the official-provider-only LLM client.
 *
 * The legacy implementation maintained separate OpenAI-compatible/OpenRouter
 * gateway branches. Those branches are removed. We intentionally execute via
 * the same direct official client as non-streaming calls, then emit normalized
 * chunks so the task UI keeps its streaming contract without a second outbound
 * routing stack.
 */
export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const step = resolveStreamStepMeta(options)
  emitStreamStage(callbacks, step, 'submit')

  if (!model) {
    const error = new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
    callbacks?.onError?.(error, step)
    throw error
  }

  try {
    const selection = await resolveLlmRuntimeModel(userId, model)
    emitStreamStage(callbacks, step, 'streaming', selection.provider)

    const completion = await chatCompletion(
      userId,
      model,
      messages,
      { ...options, __skipAutoStream: true },
    )

    const parts = getCompletionParts(completion)
    let seq = 1
    seq = emitChunkedText(parts.reasoning, callbacks, 'reasoning', seq, step)
    emitChunkedText(parts.text, callbacks, 'text', seq, step)
    callbacks?.onComplete?.(parts.text, step)
    emitStreamStage(callbacks, step, 'completed', selection.provider)
    return completion
  } catch (error) {
    callbacks?.onError?.(error, step)
    throw error
  }
}
