
import type OpenAI from 'openai'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { getCompletionParts } from './completion-parts'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from './stream-helpers'

export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const step = resolveStreamStepMeta(options)
  emitStreamStage(callbacks, step, 'submit')
  try {
    const { chatCompletion } = await import('./chat-completion')
    emitStreamStage(callbacks, step, 'streaming', 'official')
    const completion = await chatCompletion(userId, model, messages, { ...options, __skipAutoStream: true })
    const parts = getCompletionParts(completion)
    let seq = 1
    if (parts.reasoning) {
      emitStreamChunk(callbacks, step, { kind: 'reasoning', delta: parts.reasoning, seq, lane: 'reasoning' })
      seq += 1
    }
    if (parts.text) {
      emitStreamChunk(callbacks, step, { kind: 'text', delta: parts.text, seq, lane: 'main' })
    }
    emitStreamStage(callbacks, step, 'completed', 'official')
    callbacks?.onComplete?.(parts.text, step)
    return completion
  } catch (error) {
    callbacks?.onError?.(error, step)
    throw error
  }
}
