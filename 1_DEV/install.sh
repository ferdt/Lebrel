#!/bin/bash
# Script para instalar Lebrel Backend en Raspberry Pi (Raspberry Pi OS)

# Salir inmediatamente si un comando falla
set -e

echo "Iniciando instalación de Lebrel Backend..."

# 1. Instalar dependencias del sistema operativo
echo "Instalando dependencias de sistema (Python, Venv, OpenCV libs)..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip python3-pandas python3-numpy libgl1 libglib2.0-0t64

# 2. Configurar permisos de hardware para posibles periféricos
echo "Añadiendo usuario '$USER' a grupos de hardware..."
sudo usermod -a -G dialout,i2c,spi,gpio,tty $USER || true

# 3. Crear entorno virtual
echo "Configurando entorno virtual Python..."
cd "$(dirname "$0")"
if [ ! -d "venv" ]; then
    python3 -m venv --system-site-packages venv
fi

# 4. Instalar dependencias de Python (Usando el pip del venv para evitar 'externally-managed-environment')
echo "Instalando requerimientos de pip en el entorno virtual..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 5. Configurar servicio systemd
echo "Configurando servicio systemd para auto-arranque..."
SERVICE_FILE="/etc/systemd/system/lebrel-backend.service"

sudo cp lebrel-backend.service $SERVICE_FILE
sudo systemctl daemon-reload
sudo systemctl enable lebrel-backend.service
sudo systemctl restart lebrel-backend.service

echo "¡Instalación completada!"
echo "El backend ahora se está ejecutando como servicio."
echo "Puedes comprobar el estado con: sudo systemctl status lebrel-backend.service"
