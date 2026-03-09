# Script para iniciar o Backend RH em desenvolvimento (ASCII-safe)

$CorVerde = "Green"
$CorVermelho = "Red"
$CorAmarelo = "Yellow"
$CorAzul = "Cyan"

Write-Host "========================================" -ForegroundColor $CorAzul
Write-Host " RH Aplicativo - Backend RH " -ForegroundColor $CorAzul
Write-Host "========================================" -ForegroundColor $CorAzul
Write-Host ""

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectDir "backend"

Write-Host "Project dir: $projectDir" -ForegroundColor $CorAzul
Write-Host "Backend dir: $backendDir" -ForegroundColor $CorAzul
Write-Host ""

Write-Host "Checking Node.js..." -ForegroundColor $CorAmarelo
$nodeCheck = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Node.js is not installed." -ForegroundColor $CorVermelho
    Write-Host "Install from https://nodejs.org" -ForegroundColor $CorVermelho
    exit 1
}

Write-Host "Node found: $nodeCheck" -ForegroundColor $CorVerde
Write-Host ""
Write-Host "Starting backend on port 3001..." -ForegroundColor $CorVerde
Write-Host ""

Set-Location $backendDir
node index.js

Write-Host ""
Write-Host "Backend stopped." -ForegroundColor $CorAmarelo
