'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { logError as _ulogError } from '@/lib/logging/core'
import { apiFetch } from '@/lib/api-fetch'
import {
  type Provider,
  type CustomModel,
  PRESET_PROVIDERS,
  PRESET_MODELS,
  encodeModelKey,
  getProviderKey,
  isPresetComingSoonModelKey,
  resolvePresetProviderName,
  type PricingDisplayItem,
  type PricingDisplayMap,
} from './types'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

interface DefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  audioModel?: string
  lipSyncModel?: string
  voiceDesignModel?: string
}

interface WorkflowConcurrency {
  analysis: number
  image: number
  video: number
}

interface UseProvidersReturn {
  providers: Provider[]
  models: CustomModel[]
  defaultModels: DefaultModels
  workflowConcurrency: WorkflowConcurrency
  capabilityDefaults: CapabilitySelections
  loading: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  flushConfig: () => Promise<void>
  updateProviderHidden: (providerId: string, hidden: boolean) => void
  updateProviderApiKey: (providerId: string, apiKey: string) => void
  reorderProviders: (activeProviderId: string, overProviderId: string) => void
  deleteProvider: (providerId: string) => void
  toggleModel: (modelKey: string, providerId?: string) => void
  updateModel: (modelKey: string, updates: Partial<CustomModel>, providerId?: string) => void
  addModel: (model: Omit<CustomModel, 'enabled'>) => void
  deleteModel: (modelKey: string, providerId?: string) => void
  updateDefaultModel: (
    field: string,
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => void
  batchUpdateDefaultModels: (
    fields: string[],
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => void
  updateWorkflowConcurrency: (field: keyof WorkflowConcurrency, value: number) => void
  updateCapabilityDefault: (modelKey: string, field: string, value: string | number | boolean | null) => void
  getModelsByType: (type: CustomModel['type']) => CustomModel[]
}

const OFFICIAL_PROVIDER_KEYS = new Set(PRESET_PROVIDERS.map((provider) => provider.id))

const DEFAULT_WORKFLOW_CONCURRENCY: WorkflowConcurrency = {
  analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseWorkflowConcurrency(raw: unknown): WorkflowConcurrency {
  if (!isRecord(raw)) return DEFAULT_WORKFLOW_CONCURRENCY
  return {
    analysis: normalizeWorkflowConcurrencyValue(raw.analysis, DEFAULT_WORKFLOW_CONCURRENCY.analysis),
    image: normalizeWorkflowConcurrencyValue(raw.image, DEFAULT_WORKFLOW_CONCURRENCY.image),
    video: normalizeWorkflowConcurrencyValue(raw.video, DEFAULT_WORKFLOW_CONCURRENCY.video),
  }
}

function composePricingDisplayKey(type: CustomModel['type'], provider: string, modelId: string): string {
  return `${type}::${provider}::${modelId}`
}

function parsePricingDisplayMap(raw: unknown): PricingDisplayMap {
  if (!isRecord(raw)) return {}
  const map: PricingDisplayMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : null
    const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : null
    const label = typeof value.label === 'string' ? value.label.trim() : ''
    const input = typeof value.input === 'number' && Number.isFinite(value.input) ? value.input : undefined
    const output = typeof value.output === 'number' && Number.isFinite(value.output) ? value.output : undefined
    if (min === null || max === null || !label) continue
    map[key] = {
      min,
      max,
      label,
      ...(typeof input === 'number' ? { input } : {}),
      ...(typeof output === 'number' ? { output } : {}),
    }
  }
  return map
}

function applyPricingDisplay(model: CustomModel, map: PricingDisplayMap): CustomModel {
  const pricing: PricingDisplayItem | undefined = map[
    composePricingDisplayKey(model.type, model.provider, model.modelId)
  ]
  if (!pricing) {
    return {
      ...model,
      price: model.price ?? 0,
      priceLabel: model.priceLabel || '--',
    }
  }
  return {
    ...model,
    price: pricing.min,
    priceMin: pricing.min,
    priceMax: pricing.max,
    priceLabel: pricing.label,
    ...(typeof pricing.input === 'number' ? { priceInput: pricing.input } : {}),
    ...(typeof pricing.output === 'number' ? { priceOutput: pricing.output } : {}),
  }
}

export function mergeProvidersForDisplay(
  savedProviders: Provider[],
  presetProviders: Provider[],
): Provider[] {
  const savedByKey = new Map<string, Provider>()
  for (const saved of savedProviders) {
    const providerKey = getProviderKey(saved.id)
    if (!OFFICIAL_PROVIDER_KEYS.has(providerKey)) continue
    if (!savedByKey.has(providerKey)) savedByKey.set(providerKey, saved)
  }

  return presetProviders.map((preset) => {
    const saved = savedByKey.get(preset.id)
    const apiKey = saved?.apiKey || ''
    return {
      ...preset,
      apiKey,
      hasApiKey: apiKey.length > 0,
      hidden: saved?.hidden === true,
      apiMode: saved?.apiMode,
      gatewayRoute: 'official',
    }
  })
}

function sanitizeProviderForSave(provider: Provider) {
  return {
    id: provider.id,
    name: provider.name,
    apiKey: provider.apiKey || '',
    hidden: provider.hidden === true,
    ...(provider.apiMode ? { apiMode: provider.apiMode } : {}),
    gatewayRoute: 'official' as const,
  }
}

function sanitizeModelForSave(model: CustomModel) {
  return {
    modelId: model.modelId,
    modelKey: encodeModelKey(model.provider, model.modelId),
    name: model.name,
    type: model.type,
    provider: model.provider,
    ...(model.llmProtocol ? { llmProtocol: model.llmProtocol } : {}),
    ...(model.llmProtocolCheckedAt ? { llmProtocolCheckedAt: model.llmProtocolCheckedAt } : {}),
    price: 0,
    ...(model.capabilities ? { capabilities: model.capabilities } : {}),
    ...(model.customPricing ? { customPricing: model.customPricing } : {}),
  }
}

export function useProviders(): UseProvidersReturn {
  const locale = useLocale()
  const t = useTranslations('apiConfig')
  const presetProviders = PRESET_PROVIDERS.map((provider) => ({
    ...provider,
    name: resolvePresetProviderName(provider.id, provider.name, locale),
  }))

  const [providers, setProviders] = useState<Provider[]>(
    presetProviders.map((provider) => ({ ...provider, apiKey: '', hasApiKey: false, hidden: false })),
  )
  const [models, setModels] = useState<CustomModel[]>(
    PRESET_MODELS.map((model) => ({
      ...model,
      modelKey: encodeModelKey(model.provider, model.modelId),
      price: 0,
      priceLabel: '--',
      enabled: false,
    })),
  )
  const [defaultModels, setDefaultModels] = useState<DefaultModels>({})
  const [workflowConcurrency, setWorkflowConcurrency] = useState<WorkflowConcurrency>(DEFAULT_WORKFLOW_CONCURRENCY)
  const [capabilityDefaults, setCapabilityDefaults] = useState<CapabilitySelections>({})
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const latestProvidersRef = useRef(providers)
  const latestModelsRef = useRef(models)
  const latestDefaultModelsRef = useRef(defaultModels)
  const latestWorkflowConcurrencyRef = useRef(workflowConcurrency)
  const latestCapabilityDefaultsRef = useRef(capabilityDefaults)

  useEffect(() => { latestProvidersRef.current = providers }, [providers])
  useEffect(() => { latestModelsRef.current = models }, [models])
  useEffect(() => { latestDefaultModelsRef.current = defaultModels }, [defaultModels])
  useEffect(() => { latestWorkflowConcurrencyRef.current = workflowConcurrency }, [workflowConcurrency])
  useEffect(() => { latestCapabilityDefaultsRef.current = capabilityDefaults }, [capabilityDefaults])

  const performSave = useCallback(async (
    overrides?: {
      providers?: Provider[]
      models?: CustomModel[]
      defaultModels?: DefaultModels
      workflowConcurrency?: WorkflowConcurrency
      capabilityDefaults?: CapabilitySelections
    },
    silent = false,
  ): Promise<boolean> => {
    if (!silent) setSaveStatus('saving')
    try {
      const currentProviders = overrides?.providers ?? latestProvidersRef.current
      const currentModels = overrides?.models ?? latestModelsRef.current
      const currentDefaultModels = overrides?.defaultModels ?? latestDefaultModelsRef.current
      const currentWorkflowConcurrency = overrides?.workflowConcurrency ?? latestWorkflowConcurrencyRef.current
      const currentCapabilityDefaults = overrides?.capabilityDefaults ?? latestCapabilityDefaultsRef.current

      const response = await apiFetch('/api/user/api-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: currentProviders.map(sanitizeProviderForSave),
          models: currentModels.filter((model) => model.enabled).map(sanitizeModelForSave),
          defaultModels: currentDefaultModels,
          workflowConcurrency: currentWorkflowConcurrency,
          capabilityDefaults: currentCapabilityDefaults,
        }),
      })
      if (!response.ok) {
        if (!silent) setSaveStatus('error')
        return false
      }
      if (!silent) {
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 3000)
      }
      return true
    } catch (error) {
      _ulogError('保存 API 配置失败:', error)
      if (!silent) setSaveStatus('error')
      return false
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const response = await apiFetch('/api/user/api-config')
      if (!response.ok) throw new Error(`api-config load failed: HTTP ${response.status}`)
      const data = await response.json() as {
        providers?: Provider[]
        models?: CustomModel[]
        defaultModels?: DefaultModels
        workflowConcurrency?: unknown
        capabilityDefaults?: CapabilitySelections
        pricingDisplay?: unknown
      }

      const pricingDisplay = parsePricingDisplayMap(data.pricingDisplay)
      const nextProviders = mergeProvidersForDisplay(data.providers || [], presetProviders)
      setProviders(nextProviders)
      latestProvidersRef.current = nextProviders

      const savedModels = (data.models || []).filter((model) => OFFICIAL_PROVIDER_KEYS.has(getProviderKey(model.provider)))
      const savedByKey = new Map(savedModels.map((model) => [
        model.modelKey || encodeModelKey(model.provider, model.modelId),
        model,
      ]))
      const presetKeys = new Set<string>()
      const mergedPresets = PRESET_MODELS.map((preset) => {
        const modelKey = encodeModelKey(preset.provider, preset.modelId)
        presetKeys.add(modelKey)
        const saved = savedByKey.get(modelKey)
        return applyPricingDisplay({
          ...preset,
          modelKey,
          price: 0,
          priceLabel: '--',
          enabled: isPresetComingSoonModelKey(modelKey) ? false : !!saved,
          capabilities: saved?.capabilities ?? preset.capabilities,
          customPricing: saved?.customPricing,
        }, pricingDisplay)
      })
      const customModels = savedModels
        .filter((model) => !presetKeys.has(model.modelKey || encodeModelKey(model.provider, model.modelId)))
        .map((model) => applyPricingDisplay({
          ...model,
          modelKey: model.modelKey || encodeModelKey(model.provider, model.modelId),
          enabled: true,
          price: 0,
        }, pricingDisplay))
      const nextModels = [...mergedPresets, ...customModels]
      setModels(nextModels)
      latestModelsRef.current = nextModels

      const nextDefaults = data.defaultModels || {}
      setDefaultModels(nextDefaults)
      latestDefaultModelsRef.current = nextDefaults

      const nextConcurrency = parseWorkflowConcurrency(data.workflowConcurrency)
      setWorkflowConcurrency(nextConcurrency)
      latestWorkflowConcurrencyRef.current = nextConcurrency

      const nextCapabilities = data.capabilityDefaults && isRecord(data.capabilityDefaults)
        ? data.capabilityDefaults
        : {}
      setCapabilityDefaults(nextCapabilities)
      latestCapabilityDefaultsRef.current = nextCapabilities
    } catch (error) {
      _ulogError('获取 API 配置失败:', error)
      setSaveStatus('error')
    } finally {
      setLoading(false)
    }
  }, [presetProviders])

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  const flushConfig = useCallback(async () => {
    const success = await performSave(undefined, true)
    if (!success) throw new Error('API_CONFIG_FLUSH_FAILED')
  }, [performSave])

  const updateProviderApiKey = useCallback((providerId: string, apiKey: string) => {
    if (!OFFICIAL_PROVIDER_KEYS.has(getProviderKey(providerId))) return
    setProviders((previous) => {
      const next = previous.map((provider) =>
        provider.id === providerId ? { ...provider, apiKey, hasApiKey: apiKey.trim().length > 0 } : provider,
      )
      latestProvidersRef.current = next
      void performSave({ providers: next }, true)
      return next
    })
  }, [performSave])

  const updateProviderHidden = useCallback((providerId: string, hidden: boolean) => {
    setProviders((previous) => {
      const next = previous.map((provider) => provider.id === providerId ? { ...provider, hidden } : provider)
      latestProvidersRef.current = next
      void performSave({ providers: next }, true)
      return next
    })
  }, [performSave])

  const reorderProviders = useCallback((activeProviderId: string, overProviderId: string) => {
    if (activeProviderId === overProviderId) return
    setProviders((previous) => {
      const oldIndex = previous.findIndex((provider) => provider.id === activeProviderId)
      const newIndex = previous.findIndex((provider) => provider.id === overProviderId)
      if (oldIndex < 0 || newIndex < 0) return previous
      const next = [...previous]
      const [moved] = next.splice(oldIndex, 1)
      if (!moved) return previous
      next.splice(newIndex, 0, moved)
      latestProvidersRef.current = next
      void performSave({ providers: next }, true)
      return next
    })
  }, [performSave])

  const deleteProvider = useCallback((_providerId: string) => {
    alert(t('presetProviderCannotDelete'))
  }, [t])

  const toggleModel = useCallback((modelKey: string, providerId?: string) => {
    if (isPresetComingSoonModelKey(modelKey)) return
    setModels((previous) => {
      const next = previous.map((model) =>
        model.modelKey === modelKey && (!providerId || model.provider === providerId)
          ? { ...model, enabled: !model.enabled }
          : model,
      )
      latestModelsRef.current = next
      void performSave({ models: next }, true)
      return next
    })
  }, [performSave])

  const updateModel = useCallback((modelKey: string, updates: Partial<CustomModel>, providerId?: string) => {
    setModels((previous) => {
      let replacementKey: string | null = null
      const next = previous.map((model) => {
        if (model.modelKey !== modelKey || (providerId && model.provider !== providerId)) return model
        const nextModelId = typeof updates.modelId === 'string' && updates.modelId.trim()
          ? updates.modelId.trim()
          : model.modelId
        replacementKey = encodeModelKey(model.provider, nextModelId)
        return {
          ...model,
          ...updates,
          provider: model.provider,
          modelId: nextModelId,
          modelKey: replacementKey,
        }
      })
      latestModelsRef.current = next
      if (replacementKey && replacementKey !== modelKey) {
        setDefaultModels((previousDefaults) => {
          const nextDefaults = { ...previousDefaults }
          for (const field of Object.keys(nextDefaults) as Array<keyof DefaultModels>) {
            if (nextDefaults[field] === modelKey) nextDefaults[field] = replacementKey || ''
          }
          latestDefaultModelsRef.current = nextDefaults
          return nextDefaults
        })
      }
      void performSave({ models: next }, false)
      return next
    })
  }, [performSave])

  const addModel = useCallback((model: Omit<CustomModel, 'enabled'>) => {
    const providerKey = getProviderKey(model.provider)
    if (!OFFICIAL_PROVIDER_KEYS.has(providerKey)) {
      setSaveStatus('error')
      return
    }
    setModels((previous) => {
      const modelKey = encodeModelKey(model.provider, model.modelId)
      if (previous.some((item) => item.modelKey === modelKey)) return previous
      const next: CustomModel[] = [
        ...previous,
        {
          ...model,
          modelKey,
          price: 0,
          priceLabel: model.priceLabel || '--',
          enabled: true,
        },
      ]
      latestModelsRef.current = next
      void performSave({ models: next }, false)
      return next
    })
  }, [performSave])

  const deleteModel = useCallback((modelKey: string, providerId?: string) => {
    const preset = PRESET_MODELS.some((model) =>
      encodeModelKey(model.provider, model.modelId) === modelKey && (!providerId || model.provider === providerId),
    )
    if (preset) {
      alert(t('presetModelCannotDelete'))
      return
    }
    if (!confirm(t('confirmDeleteModel'))) return

    setModels((previous) => {
      const next = previous.filter((model) =>
        !(model.modelKey === modelKey && (!providerId || model.provider === providerId)),
      )
      latestModelsRef.current = next
      setDefaultModels((previousDefaults) => {
        const nextDefaults = { ...previousDefaults }
        const remaining = new Set(next.map((model) => model.modelKey))
        for (const field of Object.keys(nextDefaults) as Array<keyof DefaultModels>) {
          const current = nextDefaults[field]
          if (current && !remaining.has(current)) nextDefaults[field] = ''
        }
        latestDefaultModelsRef.current = nextDefaults
        void performSave({ models: next, defaultModels: nextDefaults }, true)
        return nextDefaults
      })
      return next
    })
  }, [performSave, t])

  const updateDefaultModel = useCallback((
    field: string,
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => {
    setDefaultModels((previous) => {
      const next = { ...previous, [field]: modelKey }
      latestDefaultModelsRef.current = next
      let nextCapabilities = latestCapabilityDefaultsRef.current
      if (capabilityFieldsToDefault?.length) {
        const selection = { ...(nextCapabilities[modelKey] || {}) }
        let changed = false
        for (const definition of capabilityFieldsToDefault) {
          if (selection[definition.field] === undefined && definition.options.length > 0) {
            selection[definition.field] = definition.options[0]
            changed = true
          }
        }
        if (changed) {
          nextCapabilities = { ...nextCapabilities, [modelKey]: selection }
          latestCapabilityDefaultsRef.current = nextCapabilities
          setCapabilityDefaults(nextCapabilities)
        }
      }
      void performSave({ defaultModels: next, capabilityDefaults: nextCapabilities }, true)
      return next
    })
  }, [performSave])

  const batchUpdateDefaultModels = useCallback((
    fields: string[],
    modelKey: string,
    capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
  ) => {
    setDefaultModels((previous) => {
      const next = { ...previous }
      for (const field of fields) (next as Record<string, string | undefined>)[field] = modelKey
      latestDefaultModelsRef.current = next

      let nextCapabilities = latestCapabilityDefaultsRef.current
      if (capabilityFieldsToDefault?.length) {
        const selection = { ...(nextCapabilities[modelKey] || {}) }
        let changed = false
        for (const definition of capabilityFieldsToDefault) {
          if (selection[definition.field] === undefined && definition.options.length > 0) {
            selection[definition.field] = definition.options[0]
            changed = true
          }
        }
        if (changed) {
          nextCapabilities = { ...nextCapabilities, [modelKey]: selection }
          latestCapabilityDefaultsRef.current = nextCapabilities
          setCapabilityDefaults(nextCapabilities)
        }
      }
      void performSave({ defaultModels: next, capabilityDefaults: nextCapabilities }, true)
      return next
    })
  }, [performSave])

  const updateWorkflowConcurrency = useCallback((field: keyof WorkflowConcurrency, value: number) => {
    const normalized = normalizeWorkflowConcurrencyValue(value, DEFAULT_WORKFLOW_CONCURRENCY[field])
    setWorkflowConcurrency((previous) => {
      const next = { ...previous, [field]: normalized }
      latestWorkflowConcurrencyRef.current = next
      void performSave({ workflowConcurrency: next }, true)
      return next
    })
  }, [performSave])

  const updateCapabilityDefault = useCallback((
    modelKey: string,
    field: string,
    value: string | number | boolean | null,
  ) => {
    setCapabilityDefaults((previous) => {
      const next = { ...previous }
      const selection = { ...(next[modelKey] || {}) }
      if (value === null) delete selection[field]
      else selection[field] = value
      if (Object.keys(selection).length === 0) delete next[modelKey]
      else next[modelKey] = selection
      latestCapabilityDefaultsRef.current = next
      void performSave({ capabilityDefaults: next }, true)
      return next
    })
  }, [performSave])

  const getModelsByType = useCallback(
    (type: CustomModel['type']) => models.filter((model) => model.type === type),
    [models],
  )

  return {
    providers,
    models,
    defaultModels,
    workflowConcurrency,
    capabilityDefaults,
    loading,
    saveStatus,
    flushConfig,
    updateProviderHidden,
    updateProviderApiKey,
    reorderProviders,
    deleteProvider,
    toggleModel,
    updateModel,
    addModel,
    deleteModel,
    updateDefaultModel,
    batchUpdateDefaultModels,
    updateWorkflowConcurrency,
    updateCapabilityDefault,
    getModelsByType,
  }
}
