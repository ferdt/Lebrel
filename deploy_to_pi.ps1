<#
.SYNOPSIS
Script para desplegar el código de Lebrel en la Raspberry Pi.

.DESCRIPTION
Este script usa tar y SSH para enviar tu código local (Windows) a la Raspberry Pi
y reiniciar el servicio de forma automática.
#>

$PI_USER = "lebrel"
$PI_HOST = "192.168.1.147" # IP detectada a través del nombre de dispositivo 'PiLebrelTest'
$PI_PATH = "/home/$PI_USER/Lebrel"
$LOCAL_PATH = $PSScriptRoot

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "🚀 Desplegando Lebrel a $PI_USER@$PI_HOST..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Comprobar si SSH está disponible
if (!(Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "Error: No se encontró el comando 'ssh' en Windows." -ForegroundColor Red
    Write-Host "Por favor, instala el 'Cliente OpenSSH' en Windows o usa Git Bash." -ForegroundColor Red
    Pause
    exit
}

# 1. Crear directorios en la Pi si no existen
Write-Host "1. Asegurando que los directorios existan en la Pi..."
ssh $PI_USER@$PI_HOST "mkdir -p $PI_PATH/1_DEV $PI_PATH/2_APP /home/$PI_USER/Tablitos/public"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al conectar por SSH. Revisa la IP ($PI_HOST) y asegúrate de que el SSH esté activo en la Pi." -ForegroundColor Red
    Pause
    exit
}

# 2. Copiar archivos excluyendo venv y cachés usando tar+ssh
Write-Host "2. Comprimiendo y enviando archivos de Lebrel..."
Set-Location $LOCAL_PATH
cmd.exe /c "tar.exe -c -f - --exclude=1_DEV/venv --exclude=1_DEV/__pycache__ --exclude=.git 1_DEV 2_APP | ssh $PI_USER@$PI_HOST `"tar -x -v -C $PI_PATH`""

Write-Host "2.1 Comprimiendo y enviando archivos de Tablitos..."
$TABLITOS_LOCAL = Join-Path $LOCAL_PATH "..\Tablitos\public"
# Entramos en la carpeta de tablitos local para que el tar no incluya toda la ruta de carpetas
cmd.exe /c "tar.exe -c -f - -C $TABLITOS_LOCAL . | ssh $PI_USER@$PI_HOST `"tar -x -v -C /home/$PI_USER/Tablitos/public`""

# 3. Arreglar retornos de carro (CRLF de Windows a LF de Linux) y Reiniciar el servicio
Write-Host "3. Preparando scripts y reiniciando el servicio lebrel-backend en la Raspberry Pi..."
ssh -t $PI_USER@$PI_HOST "find $PI_PATH -type f -name '*.sh' -exec sed -i 's/\r$//' {} +; chmod +x $PI_PATH/1_DEV/*.sh; sudo systemctl daemon-reload; sudo systemctl restart lebrel-backend.service"

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "✅ ¡Despliegue completado con éxito!" -ForegroundColor Green
Write-Host "Prueba a refrescar la pantalla en los dispositivos del coche." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green

Pause
