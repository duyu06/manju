import { prisma } from '@/lib/prisma'

function panelNumberFromPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = (payload as Record<string, unknown>).panelNumber
  return typeof value === 'number' ? value : null
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

  const shot12 = failedTasks.find((task) => panelNumberFromPayload(task.payload) === 12)
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

  const shot16 = failedTasks.find((task) => panelNumberFromPayload(task.payload) === 16)
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
