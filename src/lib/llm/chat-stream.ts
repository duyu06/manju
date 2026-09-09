import OpenAI from 'openai'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { getCompletionParts } from './completion-parts'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from './stream-helpers'

/**
 * Streaming facade for direct-official mode.
 *
 * All network I/O is delegated to chatCompletion(), whose provider routing is
 * restricted to first-party model-vendor endpoints. We intentionally do not
 * keep a second streaming gateway/router implementation because that could
 * re-introduce a relay path independently of the non-streaming code.
 *
 * The current facade emits the completed reasoning/text as stream chunks. This
 * preserves the callback contract while keeping exactly one audited outbound
 * model path.
 */
export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const streamStep = resolveStreamStepMeta(options)
  emitStreamStage(callbacks, streamStep, 'submit')

  try {
    emitStreamStage(callbacks, streamStep, 'streaming', 'direct-official')
    const { chatCompletion } = await import('./chat-completion')
    const completion = await chatCompletion(
      userId,
      model,
      messages,
      { ...options, __skipAutoStream: true },
    )

    const parts = getCompletionParts(completion)
    let seq = 1
    if (parts.reasoning) {
      emitStreamChunk(callbacks, streamStep, {
        kind: 'reasoning',
        delta: parts.reasoning,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (parts.text) {
      emitStreamChunk(callbacks, streamStep, {
        kind: 'text',
        delta: parts.text,
        seq,
        lane: 'main',
      })
    }

    emitStreamStage(callbacks, streamStep, 'completed', 'direct-official')
    callbacks?.onComplete?.(parts.text, streamStep)
    return completion
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    callbacks?.onError?.(normalized, streamStep)
    throw normalized
  }
}
