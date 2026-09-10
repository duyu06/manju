param(
  [switch]$StartApp
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step([string]$message) {
  Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

Step 'Checking prerequisites'
Require-Command 'docker'
Require-Command 'node'
Require-Command 'npm'

if (-not (Test-Path '.env')) {
  Step 'Creating .env from .env.example'
  Copy-Item '.env.example' '.env'
} else {
  Write-Host 'Using existing .env'
}

Step 'Starting MySQL, Redis and MinIO'
docker compose up -d mysql redis minio

Step 'Waiting for MySQL health check'
$mysqlReady = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    docker compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -paidrama-studio123 --silent *> $null
    if ($LASTEXITCODE -eq 0) {
      $mysqlReady = $true
      break
    }
  } catch {
    # Continue waiting while the container initializes.
  }
  Start-Sleep -Seconds 2
}
if (-not $mysqlReady) {
  throw 'MySQL did not become healthy. Run: docker compose ps'
}

Step 'Generating Prisma client and applying local schema'
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
npx prisma db push
if ($LASTEXITCODE -ne 0) { throw 'prisma db push failed' }

Step 'Seeding the interview project: 24 Hours Later'
npx tsx --env-file=.env scripts/seed-demo-project.ts --apply --create-user
if ($LASTEXITCODE -ne 0) { throw 'demo seed failed' }

Step 'Running interview demo preflight'
node scripts/interview-demo-preflight.mjs
if ($LASTEXITCODE -ne 0) { throw 'interview demo preflight failed' }

Write-Host "`nREADY: DramaFlow Studio interview demo is prepared." -ForegroundColor Green
Write-Host 'Demo login: demo / demo123456'
Write-Host 'Live path: Dashboard -> Assets -> Storyboard -> Shot #12 -> Retry -> Provider config'

if ($StartApp) {
  Step 'Starting local development app'
  npm run dev
} else {
  Write-Host "`nStart the UI when needed with:"
  Write-Host '  npm run dev'
  Write-Host 'Or run this script with -StartApp to launch it immediately.'
}
