
export async function queryArkVideoStatus(taskId: string, apiKey: string): Promise<{
  status: string
  completed: boolean
  failed: boolean
  resultUrl?: string
  error?: string
}> {
  if (!apiKey) throw new Error('请配置火山引擎 API Key')
  const response = await fetch(
    `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } },
  )
  if (!response.ok) return { status: 'unknown', completed: false, failed: false }
  const data = await response.json()
  if (data.status === 'succeeded') {
    return { status: 'succeeded', completed: true, failed: false, resultUrl: data.content?.video_url }
  }
  if (data.status === 'failed') {
    const error = data.error || {}
    let message = error.message || '任务失败'
    if (error.code === 'OutputVideoSensitiveContentDetected') message = '视频生成失败：内容审核未通过'
    if (error.code === 'InputImageSensitiveContentDetected') message = '视频生成失败：输入图片审核未通过'
    return { status: 'failed', completed: false, failed: true, error: message }
  }
  return { status: data.status || 'unknown', completed: false, failed: false }
}

export type AsyncTaskProvider = 'ark'
export type AsyncTaskType = 'video' | 'image' | 'tts' | 'lipsync'

export async function queryAsyncTaskStatus(
  provider: AsyncTaskProvider,
  taskId: string,
  apiKey: string,
  _endpoint?: string,
) {
  if (provider !== 'ark') throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: ${provider}`)
  return await queryArkVideoStatus(taskId, apiKey)
}
