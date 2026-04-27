#!/bin/bash
# Script para instalar Lebrel Backend en Raspberry Pi (Raspberry Pi OS)

# Salir inmediatamente si un comando falla
set -e

echo "Iniciando instalación de Lebrel Backend..."

# 1. Instalar dependencias del sistema operativo
echo "Instalando dependencias de Python..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip python3-pandas python3-numpy

# 2. Configurar permisos de hardware para posibles periféricos
echo "Añadiendo usuario '$USER' a grupos de hardware (dialout, i2c, spi, gpio, tty)..."
sudo usermod -a -G dialout,i2c,spi,gpio,tty $USER || true

# 3. Crear entorno virtual
echo "Configurando entorno virtual Python (con acceso a paquetes del sistema para Pandas)..."
cd "$(dirname "$0")"
rm -rf venv
python3 -m venv --system-site-packages venv
source venv/bin/activate

# 4. Instalar dependencias de Python
echo "Instalando requerimientos de pip..."
pip install -r requirements.txt

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
