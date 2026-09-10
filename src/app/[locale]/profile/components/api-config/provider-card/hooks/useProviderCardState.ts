'use client'

import { useCallback, useState } from 'react'
import {
  encodeModelKey,
  PRESET_MODELS,
  PRESET_PROVIDERS,
  getProviderKey,
  getProviderTutorial,
  matchesModelKey,
} from '../../types'
import type {
  ModelFormState,
  ProviderCardGroupedModels,
  ProviderCardModelType,
  ProviderCardProps,
  ProviderCardTranslator,
} from '../types'
import type { CustomModel } from '../../types'
import { apiFetch } from '@/lib/api-fetch'

type KeyTestStepStatus = 'pass' | 'fail' | 'skip'

interface KeyTestStep {
  name: string
  status: KeyTestStepStatus
  message: string
  model?: string
  detail?: string
}

type KeyTestStatus = 'idle' | 'testing' | 'passed' | 'failed'

interface UseProviderCardStateParams {
  provider: ProviderCardProps['provider']
  models: ProviderCardProps['models']
  allModels?: ProviderCardProps['allModels']
  defaultModels: ProviderCardProps['defaultModels']
  onUpdateApiKey: ProviderCardProps['onUpdateApiKey']
  onUpdateModel: ProviderCardProps['onUpdateModel']
  onAddModel: ProviderCardProps['onAddModel']
  onFlushConfig: ProviderCardProps['onFlushConfig']
  t: ProviderCardTranslator
}

const EMPTY_MODEL_FORM: ModelFormState = {
  name: '',
  modelId: '',
  enableCustomPricing: false,
  priceInput: '',
  priceOutput: '',
  basePrice: '',
  optionPricesJson: '',
}

function toProviderCardModelType(type: CustomModel['type']): ProviderCardModelType | null {
  if (type === 'llm' || type === 'image' || type === 'video' || type === 'audio') return type
  if (type === 'lipsync') return 'audio'
  return null
}

function pickConfiguredLlmModel(params: {
  models: CustomModel[]
  providerId: string
  defaultAnalysisModel?: string
}): string | undefined {
  const providerModels = params.models.filter(
    (model) => model.provider === params.providerId && model.type === 'llm' && model.enabled,
  )
  if (providerModels.length === 0) return undefined
  const preferred = providerModels.find((model) => model.modelKey === params.defaultAnalysisModel)
  return (preferred ?? providerModels[0])?.modelId
}

export interface UseProviderCardStateResult {
  providerKey: string
  isPresetProvider: boolean
  tutorial: ReturnType<typeof getProviderTutorial>
  groupedModels: ProviderCardGroupedModels
  hasModels: boolean
  isEditing: boolean
  showKey: boolean
  tempKey: string
  showTutorial: boolean
  showAddForm: ProviderCardModelType | null
  newModel: ModelFormState
  batchMode: boolean
  editingModelId: string | null
  editModel: ModelFormState
  maskedKey: string
  isPresetModel: (modelKey: string) => boolean
  isDefaultModel: (model: CustomModel) => boolean
  setShowKey: (value: boolean) => void
  setShowTutorial: (value: boolean) => void
  setShowAddForm: (value: ProviderCardModelType | null) => void
  setBatchMode: (value: boolean) => void
  setNewModel: (value: ModelFormState) => void
  setEditModel: (value: ModelFormState) => void
  setTempKey: (value: string) => void
  startEditKey: () => void
  handleSaveKey: () => void
  handleCancelEdit: () => void
  handleEditModel: (model: CustomModel) => void
  handleCancelEditModel: () => void
  handleSaveModel: (originalModelKey: string) => Promise<void>
  handleAddModel: (type: ProviderCardModelType) => Promise<void>
  handleCancelAdd: () => void
  keyTestStatus: KeyTestStatus
  keyTestSteps: KeyTestStep[]
  handleTestOnly: () => void
  handleDismissTest: () => void
  isModelSavePending: boolean
}

export function useProviderCardState({
  provider,
  models,
  allModels,
  defaultModels,
  onUpdateApiKey,
  onUpdateModel,
  onAddModel,
  onFlushConfig,
  t,
}: UseProviderCardStateParams): UseProviderCardStateResult {
  void onFlushConfig
  void t

  const [isEditing, setIsEditing] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [tempKey, setTempKey] = useState(provider.apiKey || '')
  const [showTutorial, setShowTutorial] = useState(false)
  const [showAddForm, setShowAddForm] = useState<ProviderCardModelType | null>(null)
  const [newModel, setNewModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)
  const [batchMode, setBatchMode] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModel, setEditModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)
  const [keyTestStatus, setKeyTestStatus] = useState<KeyTestStatus>('idle')
  const [keyTestSteps, setKeyTestSteps] = useState<KeyTestStep[]>([])
  const [isModelSavePending, setIsModelSavePending] = useState(false)

  const providerKey = getProviderKey(provider.id)
  const isPresetProvider = PRESET_PROVIDERS.some((presetProvider) => presetProvider.id === provider.id)
  const tutorial = getProviderTutorial(provider.id)

  const groupedModels: ProviderCardGroupedModels = {}
  for (const model of models) {
    const groupedType = toProviderCardModelType(model.type)
    if (!groupedType) continue
    if (!groupedModels[groupedType]) groupedModels[groupedType] = []
    groupedModels[groupedType]!.push(model)
  }

  const hasModels = Object.keys(groupedModels).length > 0
  const maskedKey = provider.apiKey
    ? `${provider.apiKey.slice(0, 4)}${'•'.repeat(Math.max(8, Math.min(20, provider.apiKey.length - 4)))}`
    : '••••••••••••'

  const isPresetModel = (modelKey: string) =>
    PRESET_MODELS.some((model) => encodeModelKey(model.provider, model.modelId) === modelKey)

  const isDefaultModel = (model: CustomModel) => {
    if (model.type === 'llm') return matchesModelKey(defaultModels.analysisModel, model.provider, model.modelId)
    if (model.type === 'image') {
      return matchesModelKey(defaultModels.characterModel, model.provider, model.modelId)
        || matchesModelKey(defaultModels.locationModel, model.provider, model.modelId)
        || matchesModelKey(defaultModels.storyboardModel, model.provider, model.modelId)
        || matchesModelKey(defaultModels.editModel, model.provider, model.modelId)
    }
    if (model.type === 'video') return matchesModelKey(defaultModels.videoModel, model.provider, model.modelId)
    if (model.type === 'audio') return matchesModelKey(defaultModels.audioModel, model.provider, model.modelId)
    if (model.type === 'lipsync') return matchesModelKey(defaultModels.lipSyncModel, model.provider, model.modelId)
    return false
  }

  const runConnectionTest = useCallback(async (apiKey: string, saveOnPass: boolean) => {
    const normalizedKey = apiKey.trim()
    if (!normalizedKey) {
      setKeyTestStatus('failed')
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Missing API Key' }])
      return
    }

    setKeyTestStatus('testing')
    setKeyTestSteps([])
    try {
      const sourceModels = allModels ?? models
      const llmModel = pickConfiguredLlmModel({
        models: sourceModels,
        providerId: provider.id,
        defaultAnalysisModel: defaultModels.analysisModel,
      })
      const response = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiType: providerKey,
          apiKey: normalizedKey,
          ...(llmModel ? { llmModel } : {}),
        }),
      })
      const payload = await response.json().catch(() => null) as {
        success?: boolean
        steps?: KeyTestStep[]
      } | null
      const passed = response.ok && payload?.success === true
      setKeyTestSteps(Array.isArray(payload?.steps) ? payload.steps : [])
      setKeyTestStatus(passed ? 'passed' : 'failed')
      if (passed && saveOnPass) {
        onUpdateApiKey(provider.id, normalizedKey)
        setIsEditing(false)
      }
    } catch {
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setKeyTestStatus('failed')
    }
  }, [allModels, defaultModels.analysisModel, models, onUpdateApiKey, provider.id, providerKey])

  const startEditKey = () => {
    setTempKey(provider.apiKey || '')
    setKeyTestStatus('idle')
    setKeyTestSteps([])
    setIsEditing(true)
  }

  const handleSaveKey = () => {
    void runConnectionTest(tempKey, true)
  }

  const handleCancelEdit = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(false)
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }

  const handleTestOnly = () => {
    void runConnectionTest(provider.apiKey || tempKey, false)
  }

  const handleDismissTest = () => {
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }

  const handleEditModel = (model: CustomModel) => {
    setEditingModelId(model.modelKey)
    setEditModel({
      name: model.name,
      modelId: model.modelId,
      enableCustomPricing: false,
      priceInput: '',
      priceOutput: '',
      basePrice: '',
      optionPricesJson: '',
    })
  }

  const handleCancelEditModel = () => {
    setEditingModelId(null)
    setEditModel(EMPTY_MODEL_FORM)
  }

  const handleSaveModel = async (originalModelKey: string) => {
    if (!onUpdateModel) return
    const name = editModel.name.trim()
    const modelId = editModel.modelId.trim()
    if (!name || !modelId) return

    setIsModelSavePending(true)
    try {
      onUpdateModel(originalModelKey, { name, modelId })
      setEditingModelId(null)
      setEditModel(EMPTY_MODEL_FORM)
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleAddModel = async (type: ProviderCardModelType) => {
    const name = newModel.name.trim()
    const rawModelId = newModel.modelId.trim()
    if (!name || !rawModelId) return

    const modelId = type === 'video' && batchMode && provider.id === 'ark' && !rawModelId.endsWith('-batch')
      ? `${rawModelId}-batch`
      : rawModelId

    setIsModelSavePending(true)
    try {
      onAddModel({
        modelId,
        modelKey: encodeModelKey(provider.id, modelId),
        name,
        type,
        provider: provider.id,
        price: 0,
      })
      setNewModel(EMPTY_MODEL_FORM)
      setShowAddForm(null)
      setBatchMode(false)
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleCancelAdd = () => {
    setNewModel(EMPTY_MODEL_FORM)
    setShowAddForm(null)
    setBatchMode(false)
  }

  return {
    providerKey,
    isPresetProvider,
    tutorial,
    groupedModels,
    hasModels,
    isEditing,
    showKey,
    tempKey,
    showTutorial,
    showAddForm,
    newModel,
    batchMode,
    editingModelId,
    editModel,
    maskedKey,
    isPresetModel,
    isDefaultModel,
    setShowKey,
    setShowTutorial,
    setShowAddForm,
    setBatchMode,
    setNewModel,
    setEditModel,
    setTempKey,
    startEditKey,
    handleSaveKey,
    handleCancelEdit,
    handleEditModel,
    handleCancelEditModel,
    handleSaveModel,
    handleAddModel,
    handleCancelAdd,
    keyTestStatus,
    keyTestSteps,
    handleTestOnly,
    handleDismissTest,
    isModelSavePending,
  }
}
