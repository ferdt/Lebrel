import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initFullscreen();
    initWakeLock();
    const statusIndicator = document.getElementById('status-indicator');
    
    const ui = {
        tramo_nombre: document.getElementById('val_tramo_nombre'),
        hora: document.getElementById('val_hora'),
        diferencia_ideal: document.getElementById('val_diferencia_ideal'),
        distancia: document.getElementById('val_distancia'),
        tiempo_tramo: document.getElementById('val_tiempo_tramo'),
        velocidad_actual: document.getElementById('val_velocidad_actual'),
        velocidad_objetivo: document.getElementById('val_velocidad_objetivo'),
        proxima_media: document.getElementById('val_proxima_media'),
        distancia_cambio: document.getElementById('val_distancia_cambio')
    };

    const wsHost = window.location.host || 'localhost:8000';
    const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

    client.onStatusChange((isConnected) => {
        if (isConnected) {
            statusIndicator.textContent = 'Conectado';
            statusIndicator.className = 'status connected';
        } else {
            statusIndicator.textContent = 'Desconectado';
            statusIndicator.className = 'status disconnected';
        }
    });

    setInterval(() => {
        const now = new Date();
        if(ui.hora) ui.hora.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
    }, 1000);

    client.onMessage((data) => {
        if (data.tramo_nombre !== undefined && ui.tramo_nombre) ui.tramo_nombre.textContent = data.tramo_nombre;
        if (data.distancia_m !== undefined && ui.distancia) ui.distancia.textContent = (data.distancia_m / 1000).toFixed(3) + ' km';
        if (data.diferencia_ideal_s !== undefined && ui.diferencia_ideal) {
            const diff = data.diferencia_ideal_s;
            ui.diferencia_ideal.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1);
            ui.diferencia_ideal.className = 'value ' + (diff > 0 ? 'positive' : 'negative');
        }
        if (data.tiempo_tramo_s !== undefined && ui.tiempo_tramo) {
            const secs = data.tiempo_tramo_s;
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 10);
            ui.tiempo_tramo.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${ms}`;
        }
        if (data.velocidad_kmh !== undefined && ui.velocidad_actual) ui.velocidad_actual.textContent = data.velocidad_kmh.toFixed(1);
        if (data.velocidad_objetivo_kmh !== undefined && ui.velocidad_objetivo) ui.velocidad_objetivo.textContent = data.velocidad_objetivo_kmh.toFixed(1);
        if (data.proxima_media_kmh !== undefined && ui.proxima_media) ui.proxima_media.textContent = data.proxima_media_kmh.toFixed(1) + ' km/h';
        if (data.distancia_cambio_m !== undefined && ui.distancia_cambio) ui.distancia_cambio.textContent = (data.distancia_cambio_m / 1000).toFixed(3) + ' km';
    });
    client.connect();
});
