@echo off
REM Manus DevAgents MVP - Script de Inicialização (Windows)
REM Este script inicia a aplicação automaticamente

echo.
echo ========================================
echo   Manus DevAgents MVP - Inicializando
echo ========================================
echo.

REM Verificar se Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERRO: Node.js não está instalado!
    echo.
    echo Instale Node.js em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Verificar se npm está instalado
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERRO: npm não está instalado!
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js e npm encontrados
echo.

REM Verificar se .env existe
if not exist .env (
    echo ⚠️  Arquivo .env não encontrado!
    echo.
    echo Criando .env a partir de .env.example...
    copy .env.example .env >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ ERRO: Não foi possível criar .env
        pause
        exit /b 1
    )
    echo ✅ Arquivo .env criado!
    echo.
    echo ⚠️  IMPORTANTE: Edite o arquivo .env e adicione sua chave OpenAI!
    echo.
    pause
)

REM Verificar se node_modules existe
if not exist node_modules (
    echo 📦 Instalando dependências...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ ERRO: Falha ao instalar dependências
        pause
        exit /b 1
    )
    echo ✅ Dependências instaladas!
    echo.
)

REM Iniciar a aplicação (sem watch mode para evitar restarts)
echo 🚀 Iniciando aplicação...
echo.
echo 📍 Acesse: http://localhost:3001
echo.
echo Para parar a aplicação, pressione Ctrl + C
echo.

call npm start

pause
