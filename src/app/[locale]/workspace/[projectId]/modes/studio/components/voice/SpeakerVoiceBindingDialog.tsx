
'use client'

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import VoicePickerDialog from '@/app/[locale]/workspace/asset-hub/components/VoicePickerDialog'
import VoiceCreationModal from '@/app/[locale]/workspace/asset-hub/components/VoiceCreationModal'
import { AppIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { InlineSpeakerVoiceBinding } from '@/lib/studio/stages/voice-stage-runtime/types'

type BindingTab = 'select' | 'design'

interface SpeakerVoiceBindingDialogProps {
  isOpen: boolean
  speaker: string
  projectId: string
  episodeId: string
  onClose: () => void
  onBound: (speaker: string, binding: InlineSpeakerVoiceBinding) => void
}

export default function SpeakerVoiceBindingDialog({ isOpen, speaker, onClose, onBound }: SpeakerVoiceBindingDialogProps) {
  const t = useTranslations('voice.inlineBinding')
  const [activeTab, setActiveTab] = useState<BindingTab>('select')
  const [subDialogOpen, setSubDialogOpen] = useState(false)

  const handleClose = useCallback(() => {
    setActiveTab('select')
    setSubDialogOpen(false)
    onClose()
  }, [onClose])

  const handleVoiceSelected = useCallback((voice: {
    id: string
    customVoiceUrl: string | null
    voiceId: string | null
    voiceType: string
  }) => {
    if (!voice.voiceId) {
      alert('当前音色没有官方百炼 Voice ID，请先使用 AI 音色设计创建可用音色。')
      return
    }
    onBound(speaker, {
      provider: 'bailian',
      voiceType: voice.voiceType,
      voiceId: voice.voiceId,
      ...(voice.customVoiceUrl ? { previewAudioUrl: voice.customVoiceUrl } : {}),
    })
    setSubDialogOpen(false)
    onClose()
  }, [speaker, onBound, onClose])

  const handleCreationSuccess = useCallback(() => {
    setActiveTab('select')
    setSubDialogOpen(true)
  }, [])

  if (!isOpen || typeof document === 'undefined') return null

  if (activeTab === 'select' && subDialogOpen) {
    return <VoicePickerDialog isOpen onClose={handleClose} onSelect={handleVoiceSelected} />
  }

  if (activeTab === 'design' && subDialogOpen) {
    return (
      <VoiceCreationModal
        isOpen
        folderId={null}
        initialVoiceName={speaker}
        onClose={handleClose}
        onSuccess={handleCreationSuccess}
      />
    )
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] glass-overlay" onClick={handleClose} />
      <div className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
          <div className="flex items-center gap-2 min-w-0">
            <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)] shrink-0" />
            <h2 className="font-semibold text-[var(--glass-text-primary)] truncate">{t('title', { speaker })}</h2>
          </div>
          <button onClick={handleClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)] shrink-0">
            <AppIcon name="close" className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <p className="text-sm text-[var(--glass-text-secondary)]">仅支持模型厂商官方音色：选择已有百炼音色，或使用官方 AI 音色设计。</p>
        </div>
        <div className="px-5 py-3">
          <SegmentedControl
            options={[
              { value: 'select' as const, label: t('selectFromLibrary') },
              { value: 'design' as const, label: t('aiDesign') },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as BindingTab)}
          />
        </div>
        <div className="p-5 text-center py-8">
          <AppIcon name={activeTab === 'select' ? 'mic' : 'idea'} className="w-7 h-7 mx-auto mb-3 text-[var(--glass-tone-info-fg)]" />
          <button onClick={() => setSubDialogOpen(true)} className="glass-btn-base glass-btn-primary px-8 py-2.5 rounded-lg text-sm font-medium">
            {activeTab === 'select' ? t('selectFromLibrary') : t('aiDesign')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
