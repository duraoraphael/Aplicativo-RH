# Script para iniciar o Backend RH em desenvolvimento

# Cores para output
$CorVerde = "Green"
$CorVermelho = "Red"
$CorAmarelo = "Yellow"
$CorAzul = "Cyan"

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor $CorAzul
Write-Host "║     RH Aplicativo - Backend RH         ║" -ForegroundColor $CorAzul
Write-Host "║     Iniciando servidor de backend      ║" -ForegroundColor $CorAzul
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor $CorAzul
Write-Host ""

# Diretório do projeto
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectDir "backend"

Write-Host "📁 Diretório do projeto: $projectDir" -ForegroundColor $CorAzul
Write-Host "📁 Diretório do backend: $backendDir" -ForegroundColor $CorAzul
Write-Host ""

# Verificar se Node.js está instalado
Write-Host "🔍 Verificando Node.js..." -ForegroundColor $CorAmarelo
$nodeCheck = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Node.js não está instalado!" -ForegroundColor $CorVermelho
    Write-Host "   Baixe de: https://nodejs.org" -ForegroundColor $CorVermelho
    exit 1
}
Write-Host "✓ Node.js encontrado: $nodeCheck" -ForegroundColor $CorVerde
Write-Host ""

# Início do backend
Write-Host "🚀 Iniciando servidor backend na porta 3001..." -ForegroundColor $CorVerde
Write-Host ""

cd $backendDir
node index.js

Write-Host ""
Write-Host "⚠️  Servidor encerrado." -ForegroundColor $CorAmarelo
