#!/bin/bash
# Script para instalar Lebrel Backend en Raspberry Pi (Raspberry Pi OS)

# Salir inmediatamente si un comando falla
set -e

echo "Iniciando instalación de Lebrel Backend..."

# 1. Instalar dependencias del sistema operativo
echo "Instalando dependencias de Python..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip

# 2. Crear entorno virtual
echo "Configurando entorno virtual Python..."
cd "$(dirname "$0")"
python3 -m venv venv
source venv/bin/activate

# 3. Instalar dependencias de Python
echo "Instalando requerimientos de pip..."
pip install -r requirements.txt

# 4. Configurar servicio systemd
echo "Configurando servicio systemd para auto-arranque..."
SERVICE_FILE="/etc/systemd/system/lebrel-backend.service"

sudo cp lebrel-backend.service $SERVICE_FILE
sudo systemctl daemon-reload
sudo systemctl enable lebrel-backend.service
sudo systemctl restart lebrel-backend.service

echo "¡Instalación completada!"
echo "El backend ahora se está ejecutando como servicio."
echo "Puedes comprobar el estado con: sudo systemctl status lebrel-backend.service"
