import { prisma } from '@/lib/prisma'

function readDemoPayload(payload: unknown): { demo: true; panelNumber: number } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if (record.demo !== true || typeof record.panelNumber !== 'number') return null
  return { demo: true, panelNumber: record.panelNumber }
}

async function main() {
  const failedTasks = await prisma.task.findMany({
    where: {
      status: 'failed',
    },
    select: {
      id: true,
      payload: true,
    },
  })

  const demoFailedTasks = failedTasks.filter((task) => readDemoPayload(task.payload) !== null)
  const shot12 = demoFailedTasks.find((task) => readDemoPayload(task.payload)?.panelNumber === 12)
  if (!shot12) {
    throw new Error('Interview demo task for shot #12 was not found. Run seed-demo-project.ts --apply first.')
  }

  await prisma.task.update({
    where: { id: shot12.id },
    data: {
      attempt: 3,
      maxAttempts: 3,
      errorCode: 'CHARACTER_CONSISTENCY_LOW',
      errorMessage: 'Character consistency review failed after 3 attempts: lead identity drift detected (shot 12)',
    },
  })

  const shot16 = demoFailedTasks.find((task) => readDemoPayload(task.payload)?.panelNumber === 16)
  if (shot16) {
    await prisma.task.update({
      where: { id: shot16.id },
      data: {
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: 'Provider timeout after 2 attempts (shot 16)',
      },
    })
  }

  process.stdout.write(
    `${JSON.stringify({
      demo: true,
      normalized: true,
      shot12: {
        status: 'failed',
        attempt: 3,
        errorCode: 'CHARACTER_CONSISTENCY_LOW',
      },
      shot16: shot16
        ? {
            status: 'failed',
            errorCode: 'PROVIDER_TIMEOUT',
          }
        : null,
    }, null, 2)}\n`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
