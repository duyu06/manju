
import type { Job } from 'bullmq'
import {
  createVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
} from '@/lib/providers/bailian/voice-design'
import { getProviderConfig } from '@/lib/api-config'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

export async function handleVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const explicitProvider = typeof payload.provider === 'string' ? payload.provider.trim().toLowerCase() : 'bailian'
  if (explicitProvider !== 'bailian') throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: ${explicitProvider}`)
  const voicePrompt = required(payload.voicePrompt, 'voicePrompt')
  const previewText = required(payload.previewText, 'previewText')
  const preferredName = typeof payload.preferredName === 'string' && payload.preferredName.trim() ? payload.preferredName.trim() : 'custom_voice'
  const language: 'zh' | 'en' = typeof payload.language === 'string' && payload.language.trim().toLowerCase() === 'en' ? 'en' : 'zh'

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) throw new Error(promptValidation.error || 'invalid voicePrompt')
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) throw new Error(textValidation.error || 'invalid previewText')

  await reportTaskProgress(job, 25, { stage: 'voice_design_submit', stageLabel: '提交声音设计任务', displayMode: 'detail' })
  await assertTaskActive(job, 'voice_design_submit')
  const { apiKey } = await getProviderConfig(job.data.userId, 'bailian')
  const input: VoiceDesignInput = { voicePrompt, previewText, preferredName, language }
  const designed = await createVoiceDesign(input, apiKey)
  if (!designed.success) throw new Error(designed.error || '声音设计失败')

  await reportTaskProgress(job, 96, { stage: 'voice_design_done', stageLabel: '声音设计完成', displayMode: 'detail' })
  return {
    success: true,
    voiceId: designed.voiceId,
    targetModel: designed.targetModel,
    audioBase64: designed.audioBase64,
    sampleRate: designed.sampleRate,
    responseFormat: designed.responseFormat,
    usageCount: designed.usageCount,
    requestId: designed.requestId,
    taskType: job.data.type === TASK_TYPE.ASSET_HUB_VOICE_DESIGN ? TASK_TYPE.ASSET_HUB_VOICE_DESIGN : TASK_TYPE.VOICE_DESIGN,
  }
}
