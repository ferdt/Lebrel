#!/bin/bash
# Script para configurar Raspberry Pi OS (Bookworm o superior con NetworkManager) como Punto de Acceso WiFi
# Esto creará una red WiFi a la que se podrán conectar los móviles/tablets del coche.

# Salir inmediatamente si un comando falla
set -e

SSID="Lebrel_Rally"
PASSWORD="rallypassword"

echo "Configurando Punto de Acceso WiFi (Hotspot) usando NetworkManager..."

# Comprobar si NetworkManager está instalado
if ! command -v nmcli &> /dev/null
then
    echo "Error: nmcli (NetworkManager) no está instalado. Este script está pensado para Raspberry Pi OS Bookworm o superior."
    exit 1
fi

# Eliminar conexión anterior si existe
if nmcli con show "LebrelHotspot" &> /dev/null; then
    echo "Eliminando configuración anterior de LebrelHotspot..."
    sudo nmcli con delete "LebrelHotspot"
fi

echo "Creando nueva conexión Hotspot..."
# Crear el hotspot en wlan0
sudo nmcli con add type wifi ifname wlan0 mode ap con-name LebrelHotspot ssid "$SSID" ipv4.method shared

# Configurar contraseña WPA2
sudo nmcli con modify LebrelHotspot wifi-sec.key-mgmt wpa-psk
sudo nmcli con modify LebrelHotspot wifi-sec.psk "$PASSWORD"

# Evitar que interfiera con otras conexiones autoconectables en caso de conflicto, aunque un AP suele tener prioridad si es standalone
sudo nmcli con modify LebrelHotspot connection.autoconnect yes

# Levantar la conexión
echo "Iniciando red WiFi '$SSID'..."
sudo nmcli con up LebrelHotspot

echo "========================================="
echo "¡Punto de acceso configurado con éxito!"
echo "Nombre de red (SSID): $SSID"
echo "Contraseña: $PASSWORD"
echo "========================================="
echo "Nota: Si estabas conectado a la Raspberry Pi por WiFi, es posible que tu conexión se haya cortado. Conéctate a la nueva red."
