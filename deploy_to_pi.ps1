<#
.SYNOPSIS
Script para desplegar el código de Lebrel en la Raspberry Pi.

.DESCRIPTION
Este script usa tar y SSH para enviar tu código local (Windows) a la Raspberry Pi
y reiniciar el servicio de forma automática.
#>

$PI_USER = "lebrel"
$PI_HOST = "192.168.1.142" # IP detectada a través del nombre de dispositivo 'PiLebrelTest'
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
Write-Host "1. Asegurando que el directorio base exista en la Pi..."
ssh $PI_USER@$PI_HOST "mkdir -p $PI_PATH/1_DEV $PI_PATH/2_APP"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al conectar por SSH. Revisa la IP ($PI_HOST) y asegúrate de que el SSH esté activo en la Pi." -ForegroundColor Red
    Pause
    exit
}

# 2. Copiar archivos excluyendo venv y cachés usando tar+ssh
Write-Host "2. Comprimiendo y enviando archivos (1_DEV y 2_APP)..."
Set-Location $LOCAL_PATH
# Usamos tar para comprimir al vuelo y descomprimir en la Pi (excluyendo entornos virtuales)
tar.exe -c --exclude="1_DEV/venv" --exclude="1_DEV/__pycache__" --exclude=".git" 1_DEV 2_APP | ssh $PI_USER@$PI_HOST "tar -x -C $PI_PATH"

# 3. Reiniciar el servicio
Write-Host "3. Reiniciando el servicio lebrel-backend en la Raspberry Pi..."
ssh -t $PI_USER@$PI_HOST "sudo systemctl daemon-reload; sudo systemctl restart lebrel-backend.service"

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "✅ ¡Despliegue completado con éxito!" -ForegroundColor Green
Write-Host "Prueba a refrescar la pantalla en los dispositivos del coche." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green

Pause
