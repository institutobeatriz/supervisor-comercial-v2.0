# Supervisor Comercial - Stop
Write-Host "Parando Supervisor Comercial..." -ForegroundColor Yellow

# Kill API (port 3000)
$apiConn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($apiConn) {
    $apiPid = $apiConn.OwningProcess
    Stop-Process -Id $apiPid -Force -ErrorAction SilentlyContinue
    Write-Host "API parada (PID $apiPid)" -ForegroundColor Green
} else {
    Write-Host "API nao estava rodando" -ForegroundColor Gray
}

# Kill Worker - check logs for PID or kill all background node
$workerPid = Get-Content "C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\worker.pid" -ErrorAction SilentlyContinue
if ($workerPid) {
    Stop-Process -Id $workerPid -Force -ErrorAction SilentlyContinue
    Write-Host "Worker parado (PID $workerPid)" -ForegroundColor Green
} else {
    Write-Host "Worker nao encontrado" -ForegroundColor Gray
}

Write-Host "Concluido!" -ForegroundColor Cyan
