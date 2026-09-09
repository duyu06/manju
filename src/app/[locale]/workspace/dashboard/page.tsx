'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import AppSidebar from '@/components/AppSidebar'
import { useRouter } from '@/i18n/navigation'

type StageStatus = 'done' | 'in_progress' | 'pending'
type IssueStatusKey = 'in_progress' | 'blocked'

interface IssueItem {
  id: string
  issue: string
  severity: string
  owner: string
  statusKey: IssueStatusKey
  status: string
}

interface FunnelItem {
  label: string
  count: number
}

interface KpiItem {
  label: string
  value: string
}

// Mock：项目阶段状态（对应驾驶舱演示项目《24小时之后》）
const PIPELINE_STAGES: Array<{ key: string; status: StageStatus }> = [
  { key: 'requirement', status: 'done' },
  { key: 'script', status: 'done' },
  { key: 'character', status: 'done' },
  { key: 'scene', status: 'done' },
  { key: 'storyboard', status: 'done' },
  { key: 'image', status: 'in_progress' },
  { key: 'video', status: 'in_progress' },
  { key: 'voice', status: 'pending' },
  { key: 'compose', status: 'pending' },
  { key: 'acceptance', status: 'pending' },
]

const STAGE_DOT: Record<StageStatus, string> = {
  done: '✓',
  in_progress: '●',
  pending: '○',
}

const STAGE_STYLE: Record<StageStatus, string> = {
  done: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  in_progress: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
  pending: 'border-[#e5e5e5] bg-white text-[#a3a3a3]',
}

const ISSUE_STATUS_STYLE: Record<IssueStatusKey, string> = {
  in_progress: 'border-blue-500/30 bg-blue-500/10 text-blue-700',
  blocked: 'border-red-500/30 bg-red-500/10 text-red-600',
}

const SEVERITY_STYLE: Record<string, string> = {
  P0: 'border-red-500/30 bg-red-500/10 text-red-600',
  P1: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  P2: 'border-[#e5e5e5] bg-[#f5f5f5] text-[#525252]',
}

const PROGRESS = 68
const FUNNEL_MAX = 24

/**
 * [DEMO / MOCK] 本页所有指标（进度、成功率、预算、漏斗、KPI）均为面试演示用的
 * 硬编码 Mock 数据，不来自任何真实任务统计。接入真实数据前不要当作生产指标引用。
 */
const IS_MOCK_DATA = true

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('dashboard')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-sm text-[#737373]">...</div>
      </div>
    )
  }

  const issues = t.raw('issues.items') as IssueItem[]
  const funnelItems = t.raw('funnel.items') as FunnelItem[]
  const kpiItems = t.raw('kpi.items') as KpiItem[]

  const metrics = [
    { label: t('metrics.progress'), value: `${PROGRESS}%`, tone: 'default' },
    { label: t('metrics.stage'), value: t('metrics.stageValue'), tone: 'default' },
    { label: t('project.sprintLabel'), value: t('project.sprint'), tone: 'default' },
    { label: t('project.etaLabel'), value: t('project.eta'), tone: 'default' },
    { label: t('metrics.blockers'), value: '2', tone: 'danger' },
    { label: t('metrics.risks'), value: '3', tone: 'warning' },
    { label: t('metrics.successRate'), value: '92.4%', tone: 'success' },
    { label: t('metrics.budgetUsage'), value: '71%', tone: 'warning' },
  ]

  const metricTone: Record<string, string> = {
    default: 'text-[#171717]',
    danger: 'text-red-600',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
  }

  return (
    <div className="h-screen flex flex-col bg-[#fafafa] overflow-hidden">
      <Navbar />
      <div className="flex flex-1 min-h-0">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#171717] mb-1">{t('title')}</h1>
              <p className="text-sm text-[#525252]">{t('subtitle')}</p>
            </div>
            <span
              className="inline-flex items-center self-start px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 text-xs font-medium"
              data-mock={IS_MOCK_DATA ? 'true' : undefined}
            >
              {t('demoBadge')}
            </span>
          </div>

          {/* Project card */}
          <div className="border border-[#e5e5e5] rounded-xl bg-white p-6 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold text-[#171717] mb-2">{t('project.name')}</h2>
                <p className="text-sm leading-relaxed text-[#525252]">{t('project.synopsis')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-700 text-xs font-medium">
                  {t('project.statusLabel')} · {t('project.status')}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-[#e5e5e5] bg-[#f5f5f5] text-[#525252] text-xs font-medium">
                  {t('project.etaLabel')} · {t('project.eta')}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-[#e5e5e5] bg-[#f5f5f5] text-[#525252] text-xs font-medium">
                  {t('project.sprintLabel')} · {t('project.sprint')}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <h3 className="text-sm font-semibold text-[#171717] mb-3">{t('metrics.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="border border-[#e5e5e5] rounded-xl bg-white p-4">
                <div className="text-xs text-[#737373] mb-1.5">{metric.label}</div>
                <div className={`text-2xl font-semibold ${metricTone[metric.tone]}`}>{metric.value}</div>
                {metric.label === t('metrics.progress') && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#f0f0f0] overflow-hidden">
                    <div className="h-full rounded-full bg-[#171717]" style={{ width: `${PROGRESS}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pipeline */}
          <div className="border border-[#e5e5e5] rounded-xl bg-white p-6 mb-6">
            <div className="mb-1">
              <h3 className="text-sm font-semibold text-[#171717]">{t('pipeline.title')}</h3>
              <p className="text-xs text-[#737373] mt-1">{t('pipeline.subtitle')}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {PIPELINE_STAGES.map((stage, index) => (
                <div key={stage.key} className="flex items-center gap-2">
                  {index > 0 && <span className="text-[#d4d4d4] text-xs">→</span>}
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${STAGE_STYLE[stage.status]}`}
                  >
                    <span aria-hidden>{STAGE_DOT[stage.status]}</span>
                    {t(`pipeline.stages.${stage.key}`)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-[#737373]">
              <span>✓ {t('pipeline.statusDone')}</span>
              <span>● {t('pipeline.statusInProgress')}</span>
              <span>○ {t('pipeline.statusPending')}</span>
            </div>
          </div>

          {/* Issues + Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Risks & Issues */}
            <div className="border border-[#e5e5e5] rounded-xl bg-white p-6">
              <h3 className="text-sm font-semibold text-[#171717] mb-4">{t('issues.title')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-[#a3a3a3] border-b border-[#f0f0f0]">
                      <th className="pb-2 pr-3 font-medium">{t('issues.colId')}</th>
                      <th className="pb-2 pr-3 font-medium">{t('issues.colIssue')}</th>
                      <th className="pb-2 pr-3 font-medium">{t('issues.colSeverity')}</th>
                      <th className="pb-2 pr-3 font-medium">{t('issues.colOwner')}</th>
                      <th className="pb-2 font-medium">{t('issues.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue) => (
                      <tr key={issue.id} className="border-b border-[#f5f5f5] last:border-0 align-middle">
                        <td className="py-2.5 pr-3 text-xs font-mono text-[#737373]">{issue.id}</td>
                        <td className="py-2.5 pr-3 text-sm text-[#171717]">{issue.issue}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.P2}`}>
                            {issue.severity}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-[#525252]">{issue.owner}</td>
                        <td className="py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${ISSUE_STATUS_STYLE[issue.statusKey]}`}>
                            {issue.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shot funnel */}
            <div className="border border-[#e5e5e5] rounded-xl bg-white p-6">
              <h3 className="text-sm font-semibold text-[#171717] mb-4">{t('funnel.title')}</h3>
              <div className="space-y-3">
                {funnelItems.map((item, index) => {
                  const isIssue = index >= funnelItems.length - 2
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#525252]">{item.label}</span>
                        <span className={`text-sm font-semibold ${isIssue ? (index === funnelItems.length - 1 ? 'text-red-600' : 'text-amber-600') : 'text-[#171717]'}`}>
                          {item.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#f0f0f0] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${index === funnelItems.length - 1 ? 'bg-red-500' : isIssue ? 'bg-amber-500' : 'bg-[#171717]'}`}
                          style={{ width: `${(item.count / FUNNEL_MAX) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* KPI */}
          <h3 className="text-sm font-semibold text-[#171717] mb-3">{t('kpi.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {kpiItems.map((kpi) => (
              <div key={kpi.label} className="border border-[#e5e5e5] rounded-xl bg-white p-4">
                <div className="text-xs text-[#737373] mb-1.5">{kpi.label}</div>
                <div className="text-lg font-semibold text-[#171717]">{kpi.value}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
