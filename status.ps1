# Supervisor Comercial - Status
Write-Host "=== Status do Supervisor Comercial ===" -ForegroundColor Cyan
Write-Host ""

# API
$apiConn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($apiConn) {
    $apiPid = $apiConn.OwningProcess
    $apiProcess = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
    Write-Host "API: RODANDO" -ForegroundColor Green
    Write-Host "  PID: $apiPid" -ForegroundColor Gray
    Write-Host "  Uptime: $($apiProcess.StartTime)" -ForegroundColor Gray
    
    # Health check
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 3
        Write-Host "  Status: $($health.status)" -ForegroundColor Gray
        Write-Host "  Database: $($health.database)" -ForegroundColor Gray
    } catch {
        Write-Host "  Health: ERRO" -ForegroundColor Red
    }
} else {
    Write-Host "API: PARADA" -ForegroundColor Red
}

Write-Host ""

# Worker
$workerLog = "C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\worker-out.log"
if (Test-Path $workerLog) {
    $lastHeartbeat = Get-Content $workerLog -Tail 1 -ErrorAction SilentlyContinue
    $lastWrite = (Get-Item $workerLog).LastWriteTime
    $secondsAgo = [math]::Round(((Get-Date) - $lastWrite).TotalSeconds, 0)
    
    if ($secondsAgo -lt 120) {
        Write-Host "Worker: RODANDO" -ForegroundColor Green
        Write-Host "  Ultimo heartbeat: ${secondsAgo}s atras" -ForegroundColor Gray
    } else {
        Write-Host "Worker: PARADO (ultima atividade ha ${secondsAgo}s)" -ForegroundColor Red
    }
} else {
    Write-Host "Worker: PARADO" -ForegroundColor Red
}

Write-Host ""

# Docker containers
Write-Host "Docker:" -ForegroundColor Cyan
docker ps --format "{{.Names}}: {{.Status}}" --filter "name=supervisor" 2>$null
if (-not $?) {
    Write-Host "  Docker nao esta rodando" -ForegroundColor Red
}
