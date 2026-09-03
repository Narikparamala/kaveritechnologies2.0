[CmdletBinding()]
param(
    [string]$DbContainer = "supabase_db_kaverilmspracticeplayground",
    [string]$Judge0Container = "judge0-v1131-server-1",
    [int]$FunctionStartupTimeoutSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$functionEnvPath = Join-Path $repoRoot "supabase\functions\.env.local"

function Write-Utf8WithoutBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Value
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Get-StatusValue {
    param(
        [Parameter(Mandatory)][string[]]$StatusLines,
        [Parameter(Mandatory)][string[]]$Names
    )

    foreach ($name in $Names) {
        $line = $StatusLines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
        if ($line) {
            return (($line -split "=", 2)[1]).Trim().Trim('"')
        }
    }
    return $null
}

function Read-ErrorResponseBody {
    param([Parameter(Mandatory)]$Exception)

    if (-not $Exception.Response) { return $Exception.Message }
    try {
        $stream = $Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        try { return $reader.ReadToEnd() }
        finally {
            $reader.Dispose()
            $stream.Dispose()
        }
    }
    catch {
        return $Exception.Message
    }
}

function Read-Judge0ConfValue {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$Key
    )

    $confContent = $null
    try {
        $confContent = docker exec $Container cat /judge0.conf 2>$null
    }
    catch {
        return $null
    }
    if ($LASTEXITCODE -ne 0 -or -not $confContent) { return $null }

    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*)$'
    foreach ($line in ($confContent -split "`n")) {
        if ($line -match $pattern) {
            $val = $matches[1].Trim()
            if ($val.Length -ge 2 -and
                (($val.StartsWith('"') -and $val.EndsWith('"')) -or
                 ($val.StartsWith("'") -and $val.EndsWith("'")))) {
                $val = $val.Substring(1, $val.Length - 2)
            }
            else {
                $hashIndex = $val.IndexOf(' #')
                if ($hashIndex -ge 0) { $val = $val.Substring(0, $hashIndex).Trim() }
            }
            return $val
        }
    }
    return $null
}

$runningDatabase = docker ps `
    --filter "name=^/$DbContainer$" `
    --filter "status=running" `
    --format "{{.Names}}"

if ($LASTEXITCODE -ne 0 -or $runningDatabase -ne $DbContainer) {
    throw "Docker container '$DbContainer' is not running. Keep Supabase running in its PowerShell window."
}

$databaseInspect = docker inspect $DbContainer | ConvertFrom-Json
$supabaseNetwork = @($databaseInspect[0].NetworkSettings.Networks.PSObject.Properties.Name)[0]
if (-not $supabaseNetwork) {
    throw "Could not determine the local Supabase Docker network."
}

Write-Host "`n--- STARTING SELF-HOSTED JUDGE0 ---" -ForegroundColor Cyan

$judge0Containers = @(
    "judge0-v1131-db-1",
    "judge0-v1131-redis-1",
    "judge0-v1131-workers-1",
    $Judge0Container
)

foreach ($containerName in $judge0Containers) {
    docker inspect $containerName *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Judge0 container '$containerName' does not exist. Restore the local Judge0 v1.13.1 installation first."
    }
}

docker start "judge0-v1131-db-1" "judge0-v1131-redis-1" *> $null
if ($LASTEXITCODE -ne 0) { throw "Judge0 database or Redis could not start." }

docker start "judge0-v1131-workers-1" $Judge0Container *> $null
if ($LASTEXITCODE -ne 0) { throw "Judge0 server or workers could not start." }

$judge0Inspect = docker inspect $Judge0Container | ConvertFrom-Json
$judge0Environment = @{}
foreach ($entry in $judge0Inspect[0].Config.Env) {
    if ($entry -match '^([^=]+)=(.*)$') {
        $judge0Environment[$matches[1]] = $matches[2]
    }
}

$judge0AuthnHeader = [string]$judge0Environment["AUTHN_HEADER"]
$judge0AuthnToken  = [string]$judge0Environment["AUTHN_TOKEN"]
$judge0AuthzHeader = [string]$judge0Environment["AUTHZ_HEADER"]
$judge0AuthzToken  = [string]$judge0Environment["AUTHZ_TOKEN"]

$authnTokenSource = "docker-env"
$authzTokenSource = "docker-env"

if ([string]::IsNullOrWhiteSpace($judge0AuthnHeader)) {
    $judge0AuthnHeader = Read-Judge0ConfValue -Container $Judge0Container -Key "AUTHN_HEADER"
}
if ([string]::IsNullOrWhiteSpace($judge0AuthnToken)) {
    $judge0AuthnToken = Read-Judge0ConfValue -Container $Judge0Container -Key "AUTHN_TOKEN"
    if (-not [string]::IsNullOrWhiteSpace($judge0AuthnToken)) { $authnTokenSource = "container-config" }
}
if ([string]::IsNullOrWhiteSpace($judge0AuthzHeader)) {
    $judge0AuthzHeader = Read-Judge0ConfValue -Container $Judge0Container -Key "AUTHZ_HEADER"
}
if ([string]::IsNullOrWhiteSpace($judge0AuthzToken)) {
    $judge0AuthzToken = Read-Judge0ConfValue -Container $Judge0Container -Key "AUTHZ_TOKEN"
    if (-not [string]::IsNullOrWhiteSpace($judge0AuthzToken)) { $authzTokenSource = "container-config" }
}

if ([string]::IsNullOrWhiteSpace($judge0AuthnHeader)) { $judge0AuthnHeader = "X-Auth-Token" }
if ([string]::IsNullOrWhiteSpace($judge0AuthzHeader)) { $judge0AuthzHeader = "X-Auth-User" }

if ([string]::IsNullOrWhiteSpace($judge0AuthnToken)) {
    throw "Judge0 AUTHN_TOKEN was not found in the container environment or /judge0.conf. Cannot proceed without authentication."
}

Write-Host "AUTHN_TOKEN source: $authnTokenSource" -ForegroundColor DarkGray
Write-Host "AUTHN_TOKEN: PRESENT, length: $($judge0AuthnToken.Length)" -ForegroundColor DarkGray
Write-Host "AUTHZ_TOKEN source: $authzTokenSource" -ForegroundColor DarkGray
if ([string]::IsNullOrWhiteSpace($judge0AuthzToken)) {
    Write-Host "AUTHZ_TOKEN: MISSING (authorization header will not be sent)" -ForegroundColor DarkGray
}
else {
    Write-Host "AUTHZ_TOKEN: PRESENT, length: $($judge0AuthzToken.Length)" -ForegroundColor DarkGray
}

$judge0RequestHeaders = @{}
$judge0RequestHeaders[$judge0AuthnHeader] = $judge0AuthnToken
if (-not [string]::IsNullOrWhiteSpace($judge0AuthzToken)) {
    $judge0RequestHeaders[$judge0AuthzHeader] = $judge0AuthzToken
}

$judge0Languages = $null
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    try {
        $judge0Languages = @(Invoke-RestMethod `
            -Uri "http://127.0.0.1:2358/languages/" `
            -Method Get `
            -Headers $judge0RequestHeaders `
            -TimeoutSec 5)
        if ($judge0Languages.Count -gt 0) { break }
    }
    catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $judge0Languages -or $judge0Languages.Count -eq 0) {
    docker logs --tail 100 $Judge0Container
    throw "Judge0 did not expose its installed languages on http://127.0.0.1:2358."
}

$judge0Python = $judge0Languages |
    Where-Object { $_.name -match '^Python \(3\.' } |
    Select-Object -First 1

if (-not $judge0Python) {
    throw "Judge0 is running but no Python 3 runtime is installed."
}

$judge0Networks = @($judge0Inspect[0].NetworkSettings.Networks.PSObject.Properties.Name)
if ($judge0Networks -notcontains $supabaseNetwork) {
    docker network connect --alias kaveri-judge0 $supabaseNetwork $Judge0Container
    if ($LASTEXITCODE -ne 0) {
        throw "Could not connect Judge0 to the Supabase Docker network."
    }
}

Write-Host "PASS: Judge0 exposes $($judge0Languages.Count) installed language runtimes." -ForegroundColor Green
Write-Host "PASS: Judge0 authentication was detected and kept server-side: $(-not [string]::IsNullOrWhiteSpace($judge0AuthnToken))" -ForegroundColor Green

$functionEnv = @"
JUDGE0_URL=http://${Judge0Container}:2358
JUDGE0_AUTHN_HEADER=$judge0AuthnHeader
JUDGE0_AUTHN_TOKEN=$judge0AuthnToken
JUDGE0_AUTHZ_HEADER=$judge0AuthzHeader
JUDGE0_AUTHZ_TOKEN=$judge0AuthzToken
LMS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
"@
Write-Utf8WithoutBom -Path $functionEnvPath -Value $functionEnv

Set-Location $repoRoot
$statusLines = @(npx.cmd supabase status -o env)
if ($LASTEXITCODE -ne 0) {
    throw "Could not read the local Supabase status."
}

$apiUrl = Get-StatusValue -StatusLines $statusLines -Names @("API_URL", "SUPABASE_URL")
$anonKey = Get-StatusValue -StatusLines $statusLines -Names @("ANON_KEY", "SUPABASE_ANON_KEY")
$serviceRoleKey = Get-StatusValue -StatusLines $statusLines -Names @("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY")

if (-not $apiUrl -or -not $anonKey -or -not $serviceRoleKey) {
    throw "Local Supabase URL or API keys could not be discovered."
}
$functionUrl = "$($apiUrl.TrimEnd('/'))/functions/v1/secure-grade"

$escapedRoot = $repoRoot.Replace("'", "''")
$escapedEnvPath = $functionEnvPath.Replace("'", "''")
$serveCommand = "Set-Location '$escapedRoot'; npx.cmd supabase functions serve secure-grade --env-file '$escapedEnvPath'"
$encodedServeCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($serveCommand))

Write-Host "`n--- STARTING SECURE-GRADE EDGE FUNCTION ---" -ForegroundColor Cyan
$functionProcess = Start-Process powershell.exe `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedServeCommand) `
    -PassThru

$temporaryUserId = $null
$temporaryEmail = "secure-grader-$([Guid]::NewGuid().ToString('N'))@example.test"
$temporaryPassword = "Kaveri-$([Guid]::NewGuid().ToString('N'))!9a"
$adminHeaders = @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
}

try {
    $createdUser = Invoke-RestMethod `
        -Uri "$apiUrl/auth/v1/admin/users" `
        -Method Post `
        -Headers $adminHeaders `
        -ContentType "application/json" `
        -Body (@{
            email = $temporaryEmail
            password = $temporaryPassword
            email_confirm = $true
            user_metadata = @{ full_name = "Secure Grader Test Student" }
        } | ConvertTo-Json -Depth 5)

    $temporaryUserId = if ($createdUser.PSObject.Properties["user"] -and $createdUser.user) {
        [string]$createdUser.user.id
    }
    else {
        [string]$createdUser.id
    }
    if (-not $temporaryUserId) { throw "Temporary local test user was not created." }

    $loginResponse = Invoke-RestMethod `
        -Uri "$apiUrl/auth/v1/token?grant_type=password" `
        -Method Post `
        -Headers @{ apikey = $anonKey } `
        -ContentType "application/json" `
        -Body (@{ email = $temporaryEmail; password = $temporaryPassword } | ConvertTo-Json)

    $accessToken = [string]$loginResponse.access_token
    if (-not $accessToken) { throw "Temporary local student could not sign in." }

    $questionRecord = docker exec $DbContainer `
        psql `
        -v ON_ERROR_STOP=1 `
        -U postgres `
        -d postgres `
        -At `
        -c "select q.id::text || '|' || encode(convert_to(q.reference_solution, 'UTF8'), 'hex') from public.coding_questions q where q.is_published = true and nullif(trim(q.reference_solution), '') is not null and exists (select 1 from public.coding_question_test_cases t where t.question_id = q.id and t.is_hidden = false) and exists (select 1 from public.coding_question_test_cases t where t.question_id = q.id and t.is_hidden = true) order by q.frequency_score desc, q.created_at limit 1;"

    if ($LASTEXITCODE -ne 0 -or -not $questionRecord) {
        throw "No published coding question with a reference solution and tests is available."
    }

    $questionParts = ([string]$questionRecord).Trim() -split "\|", 2
    $questionId = $questionParts[0]
    $solutionHex = $questionParts[1]
    $solutionBytes = New-Object byte[] ($solutionHex.Length / 2)
    for ($index = 0; $index -lt $solutionBytes.Length; $index += 1) {
        $solutionBytes[$index] = [Convert]::ToByte($solutionHex.Substring($index * 2, 2), 16)
    }
    $referenceSolution = [System.Text.Encoding]::UTF8.GetString($solutionBytes)

    $requestHeaders = @{
        apikey = $anonKey
        Authorization = "Bearer $accessToken"
    }
    $requestBody = @{
        kind = "practice"
        questionId = $questionId
        code = $referenceSolution
        languageId = [int]$judge0Python.id
    } | ConvertTo-Json -Depth 5

    $gradingResult = $null
    $lastFunctionError = $null
    $deadline = (Get-Date).AddSeconds($FunctionStartupTimeoutSeconds)

    while ((Get-Date) -lt $deadline -and -not $gradingResult) {
        if ($functionProcess.HasExited) {
            throw "The secure-grade PowerShell process exited before the function became ready."
        }
        try {
            $gradingResult = Invoke-RestMethod `
                -Uri $functionUrl `
                -Method Post `
                -Headers $requestHeaders `
                -ContentType "application/json" `
                -Body $requestBody `
                -TimeoutSec 20
        }
        catch {
            $lastFunctionError = Read-ErrorResponseBody -Exception $_.Exception
            Start-Sleep -Seconds 2
        }
    }

    if (-not $gradingResult) {
        throw "Secure-grade did not become ready. Last response: $lastFunctionError"
    }
    if (-not $gradingResult.verified -or -not $gradingResult.allPassed) {
        throw "The end-to-end grader returned an unverified or failing result."
    }

    $sampleResult = Invoke-RestMethod `
        -Uri $functionUrl `
        -Method Post `
        -Headers $requestHeaders `
        -ContentType "application/json" `
        -Body (@{
            kind = "sample"
            questionId = $questionId
            code = $referenceSolution
            languageId = [int]$judge0Python.id
        } | ConvertTo-Json -Depth 5) `
        -TimeoutSec 30

    if (-not $sampleResult.executed -or -not $sampleResult.allPassed) {
        throw "The server-side sample test flow failed."
    }

    $publicTests = @($gradingResult.tests)
    $visibleResults = @($publicTests | Where-Object { -not $_.hidden })
    $hiddenResults = @($publicTests | Where-Object { $_.hidden })

    if ($publicTests.Count -ne [int]$gradingResult.total) {
        throw "The secure grading response did not include one safe result per test."
    }
    if ($visibleResults.Count -lt 1 -or $hiddenResults.Count -lt 1) {
        throw "The result contract requires both visible and hidden test coverage."
    }

    foreach ($visibleResult in $visibleResults) {
        $visibleProperties = @($visibleResult.PSObject.Properties.Name)
        foreach ($requiredProperty in @("input", "expected", "actual", "stderr")) {
            if ($visibleProperties -notcontains $requiredProperty) {
                throw "Visible result is missing '$requiredProperty'."
            }
        }
    }

    foreach ($hiddenResult in $hiddenResults) {
        $hiddenProperties = @($hiddenResult.PSObject.Properties.Name)
        foreach ($protectedProperty in @("input", "expected", "actual", "stderr")) {
            if ($hiddenProperties -contains $protectedProperty) {
                throw "SECURITY FAILURE: Hidden result exposed '$protectedProperty'."
            }
        }
    }

    $auditCount = docker exec $DbContainer `
        psql `
        -v ON_ERROR_STOP=1 `
        -U postgres `
        -d postgres `
        -At `
        -c "select count(*) from public.secure_grading_runs where student_id = '$temporaryUserId'::uuid and status = 'passed';"

    if ($LASTEXITCODE -ne 0 -or [int](([string]$auditCount).Trim()) -lt 1) {
        throw "The verified grading audit row was not persisted."
    }

    Write-Host "PASS: LMS Edge Function reached the isolated runner." -ForegroundColor Green
    Write-Host "PASS: The server-side Run Sample Tests flow passed." -ForegroundColor Green
    Write-Host "PASS: A real authenticated student solution passed hidden final tests." -ForegroundColor Green
    Write-Host "PASS: Visible comparisons were returned and hidden test data stayed private." -ForegroundColor Green
    Write-Host "PASS: The verified result and audit row were persisted." -ForegroundColor Green
}
catch {
    if ($functionProcess -and -not $functionProcess.HasExited) {
        Stop-Process -Id $functionProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw
}
finally {
    if ($temporaryUserId) {
        try {
            Invoke-RestMethod `
                -Uri "$apiUrl/auth/v1/admin/users/$temporaryUserId" `
                -Method Delete `
                -Headers $adminHeaders | Out-Null
        }
        catch {
            Write-Warning "Temporary test user cleanup failed: $($_.Exception.Message)"
        }
    }
}

Write-Host "`nLOCAL SECURE GRADING IS CONNECTED AND VERIFIED" -ForegroundColor Green
Write-Host "Keep the secure-grade PowerShell window open while using the LMS." -ForegroundColor Yellow
