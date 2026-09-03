[CmdletBinding()]
param(
    [string]$DbContainer = "supabase_db_kaverilmspracticeplayground",
    [string]$GoJudgeContainer = "kaveri-go-judge",
    [int]$FunctionStartupTimeoutSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$functionEnvPath = Join-Path $repoRoot "supabase\functions\.env.local"
$goJudgeLanguageId = 71

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
        if ($Exception.Response.PSObject.Methods.Name -contains "GetResponseStream") {
            $stream = $Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            try { return $reader.ReadToEnd() }
            finally {
                $reader.Dispose()
                $stream.Dispose()
            }
        }
    }
    catch {
        return $Exception.Message
    }
    return $Exception.Message
}

function Get-GoJudgeToken {
    param([Parameter(Mandatory)]$InspectRecord)

    $command = @($InspectRecord.Config.Cmd)
    for ($index = 0; $index -lt $command.Count - 1; $index += 1) {
        if ([string]$command[$index] -eq "-auth-token") {
            $token = [string]$command[$index + 1]
            if (-not [string]::IsNullOrWhiteSpace($token)) {
                return $token
            }
        }
    }
    return $null
}

$runningDatabase = docker ps `
    --filter "name=^/$DbContainer$" `
    --filter "status=running" `
    --format "{{.Names}}"

if ($LASTEXITCODE -ne 0 -or $runningDatabase -ne $DbContainer) {
    throw "Docker container '$DbContainer' is not running. Keep the local Supabase stack running."
}

$databaseInspect = docker inspect $DbContainer | ConvertFrom-Json
$supabaseNetwork = @($databaseInspect[0].NetworkSettings.Networks.PSObject.Properties.Name)[0]
if (-not $supabaseNetwork) {
    throw "Could not determine the local Supabase Docker network."
}

Write-Host "`n--- VERIFYING KAVERI GO-JUDGE RUNNER ---" -ForegroundColor Cyan

docker inspect $GoJudgeContainer *> $null
if ($LASTEXITCODE -ne 0) {
    throw "The Kaveri go-judge container '$GoJudgeContainer' does not exist. Start infrastructure\go-judge with its private GO_JUDGE_TOKEN first."
}

$runningGoJudge = docker ps `
    --filter "name=^/$GoJudgeContainer$" `
    --filter "status=running" `
    --format "{{.Names}}"

if ($runningGoJudge -ne $GoJudgeContainer) {
    docker start $GoJudgeContainer *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "The Kaveri go-judge container could not start."
    }
}

$goJudgeInspect = docker inspect $GoJudgeContainer | ConvertFrom-Json
$goJudgeToken = Get-GoJudgeToken -InspectRecord $goJudgeInspect[0]
if ([string]::IsNullOrWhiteSpace($goJudgeToken)) {
    throw "The Kaveri go-judge authentication token could not be discovered from the existing container configuration. Recreate the runner with GO_JUDGE_TOKEN configured."
}

Write-Host "GO_JUDGE_TOKEN: PRESENT, length: $($goJudgeToken.Length)" -ForegroundColor DarkGray

$goJudgeNetworks = @($goJudgeInspect[0].NetworkSettings.Networks.PSObject.Properties.Name)
if ($goJudgeNetworks -notcontains $supabaseNetwork) {
    docker network connect $supabaseNetwork $GoJudgeContainer
    if ($LASTEXITCODE -ne 0) {
        throw "Could not connect the Kaveri go-judge container to the local Supabase Docker network."
    }
}

$goJudgeHeaders = @{
    Authorization = "Bearer $goJudgeToken"
}
$probeBody = @{
    cmd = @(
        @{
            args = @("/usr/bin/python3", "-I", "solution.py")
            env = @("PATH=/usr/bin:/bin", "PYTHONIOENCODING=utf-8")
            files = @(
                @{ content = "" },
                @{ name = "stdout"; max = 65536 },
                @{ name = "stderr"; max = 65536 }
            )
            cpuLimit = 2000000000
            clockLimit = 5000000000
            memoryLimit = 134217728
            procLimit = 30
            copyIn = @{
                "solution.py" = @{ content = 'print("Kaveri runner ready")' }
            }
            copyOut = @("stdout", "stderr")
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $probeResponse = @(Invoke-RestMethod `
        -Uri "http://127.0.0.1:5050/run" `
        -Method Post `
        -Headers $goJudgeHeaders `
        -ContentType "application/json" `
        -Body $probeBody `
        -TimeoutSec 20)
}
catch {
    throw "The Kaveri go-judge authentication/execution probe failed."
}

$probeResult = @($probeResponse)[0]
if (-not $probeResult -or [string]$probeResult.status -ne "Accepted") {
    throw "The Kaveri go-judge runner did not accept the Python probe."
}
if (-not $probeResult.files -or [string]$probeResult.files.stdout -notmatch "Kaveri runner ready") {
    throw "The Kaveri go-judge runner did not return the expected Python output."
}

Write-Host "PASS: go-judge authenticated successfully." -ForegroundColor Green
Write-Host "PASS: go-judge executed isolated Python successfully." -ForegroundColor Green
Write-Host "PASS: go-judge is attached to the local Supabase Docker network." -ForegroundColor Green

$functionEnv = @"
GO_JUDGE_URL=http://${GoJudgeContainer}:5050
GO_JUDGE_TOKEN=$goJudgeToken
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
        throw "No published coding question with a reference solution and visible/hidden tests is available."
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
        languageId = $goJudgeLanguageId
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
            languageId = $goJudgeLanguageId
        } | ConvertTo-Json -Depth 5) `
        -TimeoutSec 30

    if (-not $sampleResult.executed -or -not $sampleResult.allPassed) {
        throw "The server-side sample test flow failed."
    }

    $customResult = Invoke-RestMethod `
        -Uri $functionUrl `
        -Method Post `
        -Headers $requestHeaders `
        -ContentType "application/json" `
        -Body (@{
            kind = "custom"
            code = 'print("custom-ok")'
            input = ""
            languageId = $goJudgeLanguageId
        } | ConvertTo-Json -Depth 5) `
        -TimeoutSec 30

    if (-not $customResult.executed -or -not $customResult.result.passed -or [string]$customResult.result.actual -ne "custom-ok") {
        throw "The server-side custom-input execution flow failed."
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

    Write-Host "PASS: LMS Edge Function reached the Kaveri go-judge runner." -ForegroundColor Green
    Write-Host "PASS: The server-side Run Sample Tests flow passed." -ForegroundColor Green
    Write-Host "PASS: The server-side custom-input flow passed." -ForegroundColor Green
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
