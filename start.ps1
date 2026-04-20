# Pipeline Executor — Script de Inicialização (PowerShell)
# Este script inicia a aplicação automaticamente

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pipeline Executor — Inicializando" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Node.js está instalado
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERRO: Node.js não está instalado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instale Node.js em: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "✅ Node.js $nodeVersion encontrado" -ForegroundColor Green
Write-Host ""

# Verificar se .env existe
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Criando .env a partir de .env.example..." -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠️  IMPORTANTE: Edite o arquivo .env e adicione sua chave OpenAI!" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Pressione Enter para continuar"
    } else {
        Write-Host "❌ ERRO: Arquivo .env.example não encontrado" -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}

# Verificar se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Cyan
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ERRO: Falha ao instalar dependências" -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }
    Write-Host "✅ Dependências instaladas!" -ForegroundColor Green
    Write-Host ""
}

# Iniciar a aplicação (sem watch mode para evitar restarts)
Write-Host "🚀 Iniciando aplicação..." -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Acesse: http://localhost:3001" -ForegroundColor Green
Write-Host ""
Write-Host "Para parar a aplicação, pressione Ctrl + C" -ForegroundColor Yellow
Write-Host ""

npm start
