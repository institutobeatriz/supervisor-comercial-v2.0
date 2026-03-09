# Supervisor Comercial - Start (PowerShell)
# Inicia API e Worker em background

$baseDir = "C:\Users\user\.openclaw\workspace\supervisor-comercial"
$logDir = "$baseDir\logs"

Write-Host "=== Supervisor Comercial ===" -ForegroundColor Cyan

# Create logs directory
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Kill existing processes on port 3000
$apiConn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($apiConn) {
    Stop-Process -Id $apiConn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "API anterior parada" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# Start API with tsx
Write-Host "Iniciando API na porta 3000..." -ForegroundColor Yellow
$api = Start-Process -FilePath "npx" `
    -ArgumentList "tsx", "apps/api/src/index.ts" `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$logDir\api-out.log" `
    -RedirectStandardError "$logDir\api-err.log" `
    -WorkingDirectory $baseDir `
    -PassThru

Write-Host "  PID: $($api.Id)" -ForegroundColor Gray

Start-Sleep -Seconds 4

# Start Worker
Write-Host "Iniciando Worker..." -ForegroundColor Yellow
$worker = Start-Process -FilePath "node" `
    -ArgumentList "-r", "dotenv/config", "$baseDir/dist/worker.mjs" `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$logDir\worker-out.log" `
    -RedirectStandardError "$logDir\worker-err.log" `
    -WorkingDirectory $baseDir `
    -PassThru

Write-Host "  PID: $($worker.Id)" -ForegroundColor Gray

Start-Sleep -Seconds 3

# Check status
Write-Host ""
Write-Host "=== Status ===" -ForegroundColor Cyan

# API health check
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
    Write-Host "API: OK ($($health.status))" -ForegroundColor Green
} catch {
    Write-Host "API: FALHOU" -ForegroundColor Red
    Get-Content "$logDir\api-err.log" -Tail 3 -ErrorAction SilentlyContinue
}

# Worker check
$workerProcess = Get-Process -Id $worker.Id -ErrorAction SilentlyContinue
if ($workerProcess) {
    Write-Host "Worker: OK (PID $($worker.Id))" -ForegroundColor Green
} else {
    Write-Host "Worker: FALHOU" -ForegroundColor Red
    Get-Content "$logDir\worker-err.log" -Tail 3 -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Logs: $logDir" -ForegroundColor Gray
