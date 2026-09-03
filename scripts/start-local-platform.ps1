[CmdletBinding()]
param(
    [int]$DockerStartupTimeoutSeconds = 180,
    [int]$LmsStartupTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$lmsUrl = "http://localhost:5173"

function Test-HttpEndpoint {
    param([Parameter(Mandatory)][string]$Url)

    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Start-PowerShellWindow {
    param([Parameter(Mandatory)][string]$Command)

    $encodedCommand = [Convert]::ToBase64String(
        [System.Text.Encoding]::Unicode.GetBytes($Command)
    )

    return Start-Process powershell.exe `
        -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            $encodedCommand
        ) `
        -PassThru
}

Set-Location $repoRoot

docker info *> $null
$dockerReady = $LASTEXITCODE -eq 0

if (-not $dockerReady) {
    if (-not (Test-Path $dockerDesktop)) {
        throw "Docker Desktop was not found at '$dockerDesktop'."
    }

    Write-Host "`n--- STARTING DOCKER DESKTOP ---" -ForegroundColor Cyan
    Start-Process $dockerDesktop

    $dockerDeadline = (Get-Date).AddSeconds($DockerStartupTimeoutSeconds)
    while ((Get-Date) -lt $dockerDeadline -and -not $dockerReady) {
        Start-Sleep -Seconds 5
        docker info *> $null
        $dockerReady = $LASTEXITCODE -eq 0
    }
}

if (-not $dockerReady) {
    throw "Docker Desktop did not become ready within $DockerStartupTimeoutSeconds seconds."
}

Write-Host "PASS: Docker Desktop is ready." -ForegroundColor Green

Write-Host "`n--- STARTING LOCAL SUPABASE ---" -ForegroundColor Cyan
npx.cmd supabase start
if ($LASTEXITCODE -ne 0) {
    throw "Local Supabase could not start."
}

Write-Host "PASS: Local Supabase is running." -ForegroundColor Green

& (Join-Path $PSScriptRoot "start-local-secure-grading.ps1")

if (-not (Test-HttpEndpoint -Url $lmsUrl)) {
    Write-Host "`n--- STARTING KAVERI LMS IN ANOTHER POWERSHELL ---" -ForegroundColor Cyan
    $escapedRoot = $repoRoot.Replace("'", "''")
    $lmsCommand = "Set-Location '$escapedRoot'; npm.cmd run dev"
    $lmsProcess = Start-PowerShellWindow -Command $lmsCommand
    $lmsDeadline = (Get-Date).AddSeconds($LmsStartupTimeoutSeconds)

    while ((Get-Date) -lt $lmsDeadline -and -not (Test-HttpEndpoint -Url $lmsUrl)) {
        if ($lmsProcess.HasExited) {
            throw "The LMS PowerShell window exited before Vite became ready."
        }
        Start-Sleep -Seconds 2
    }
}

if (-not (Test-HttpEndpoint -Url $lmsUrl)) {
    throw "The LMS did not become reachable at $lmsUrl."
}

Write-Host "PASS: Kaveri LMS is running." -ForegroundColor Green

Write-Host "`n--- RUNNING CONTAINERS ---" -ForegroundColor Cyan
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

Start-Process $lmsUrl

Write-Host "`nKAVERI LOCAL PLATFORM IS OPEN" -ForegroundColor Green
Write-Host "LMS:      $lmsUrl"
Write-Host "Supabase: http://127.0.0.1:54321"
Write-Host "Studio:   http://127.0.0.1:54323"
Write-Host "Judge0:   http://127.0.0.1:2358"
Write-Host "Keep the LMS and secure-grade PowerShell windows open." -ForegroundColor Yellow
