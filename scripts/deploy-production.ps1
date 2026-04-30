param(
  [string]$TempDir = (Join-Path $env:TEMP 'toyoparts-prod-current'),
  [string]$SupabaseProjectRef = 'hkxjnykrnhjtkkabgece',
  [switch]$SkipTextCheck,
  [switch]$SkipBuild,
  [switch]$SkipVercel,
  [switch]$SkipSupabase,
  [switch]$PreserveTemp
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

function Assert-ExitCode {
  param(
    [int]$Code,
    [string]$Message
  )

  if ($Code -ne 0) {
    throw "$Message (exit code $Code)"
  }
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$excludeDirs = @(
  (Join-Path $workspace '.git'),
  (Join-Path $workspace 'node_modules'),
  (Join-Path $workspace 'dist'),
  (Join-Path $workspace '.deploy-temp'),
  (Join-Path $workspace '.playwright-cli'),
  (Join-Path $workspace 'output'),
  (Join-Path $workspace 'supabase\.temp'),
  (Join-Path $workspace 'apps\public-next\.next'),
  (Join-Path $workspace 'apps\public-next\node_modules')
)
$excludeFiles = @(
  '*.log',
  '.toyoparts-home.html',
  '.toyoparts-pecas.html'
)

Write-Host "Workspace: $workspace"
Write-Host "TempDir:   $TempDir"
Write-Host "Mode:      current workspace -> clean temp mirror -> production deploy"

Invoke-Step 'Prepare clean mirror from current workspace' {
  if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
  }
  New-Item -ItemType Directory -Path $TempDir | Out-Null

  $robocopyArgs = @(
    $workspace,
    $TempDir,
    '/MIR',
    '/R:2',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD'
  ) + $excludeDirs + @('/XF') + $excludeFiles

  & robocopy @robocopyArgs | Out-Host
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed while preparing the deploy mirror (exit code $LASTEXITCODE)"
  }

  $copiedDist = Join-Path $TempDir 'dist'
  if (Test-Path $copiedDist) {
    Remove-Item -Recurse -Force $copiedDist
  }
}

if (-not $SkipTextCheck) {
  Invoke-Step 'Validate Portuguese texts' {
    Push-Location $workspace
    try {
      & npm.cmd run check:pt-texts
      Assert-ExitCode $LASTEXITCODE 'Portuguese text check failed'
    } finally {
      Pop-Location
    }
  }
}

if (-not $SkipBuild) {
  Invoke-Step 'Validate build from current workspace' {
    Push-Location $workspace
    try {
      & npm.cmd run build
      Assert-ExitCode $LASTEXITCODE 'Build failed'
    } finally {
      Pop-Location
    }
  }
}

if (-not $SkipVercel) {
  Invoke-Step 'Deploy current workspace mirror to Vercel production' {
    Push-Location $workspace
    try {
      & npx.cmd vercel deploy $TempDir --prod -y
      Assert-ExitCode $LASTEXITCODE 'Vercel production deploy failed'
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Inspect current production alias' {
    Push-Location $workspace
    try {
      & npx.cmd vercel inspect https://www.toyoparts.com.br
      Assert-ExitCode $LASTEXITCODE 'Vercel inspect failed'
    } finally {
      Pop-Location
    }
  }
}

if (-not $SkipSupabase) {
  Invoke-Step 'Deploy Edge Functions to Supabase' {
    if (-not $env:SUPABASE_ACCESS_TOKEN) {
      throw 'SUPABASE_ACCESS_TOKEN is required to deploy the backend.'
    }

    Push-Location $workspace
    try {
      & npx.cmd supabase functions deploy make-server-1d6e33e0 --project-ref $SupabaseProjectRef
      Assert-ExitCode $LASTEXITCODE 'Supabase make-server deploy failed'

      & npx.cmd supabase functions deploy home-config-1d6e33e0 --project-ref $SupabaseProjectRef
      Assert-ExitCode $LASTEXITCODE 'Supabase home-config deploy failed'
    } finally {
      Pop-Location
    }
  }
}

if (-not $PreserveTemp -and (Test-Path $TempDir)) {
  Invoke-Step 'Clean temporary deploy mirror' {
    Remove-Item -Recurse -Force $TempDir
  }
}

Write-Host ""
Write-Host 'Done.' -ForegroundColor Green
Write-Host 'Production domain: https://www.toyoparts.com.br'
