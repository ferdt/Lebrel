import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
    initHeader('piloto');
    initRouter();
    initFullscreen();
    initWakeLock();
    initRotation();
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
        distancia_cambio: document.getElementById('val_distancia_cambio'),
        instruccion: document.getElementById('val_instruccion')
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

    // El reloj se sincroniza con la Pi vía telemetría

    client.onMessage((data) => {
        if (data.tramo_nombre !== undefined && ui.tramo_nombre) ui.tramo_nombre.textContent = data.tramo_nombre;
        if (data.distancia_m !== undefined && ui.distancia) ui.distancia.textContent = (data.distancia_m / 1000).toFixed(3) + ' km';
        if (data.diferencia_ideal_s !== undefined && ui.diferencia_ideal) {
            const diff = data.diferencia_ideal_s;
            const threshold = 0.1; // Umbral para OK
            
            // 1. Actualizar cifra
            ui.diferencia_ideal.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1);
            ui.diferencia_ideal.className = 'value ' + (diff > threshold ? 'positive' : (diff < -threshold ? 'negative' : ''));
            
            // 2. Actualizar Instrucción Gigante
            if (ui.instruccion) {
                if (diff > threshold) {
                    ui.instruccion.textContent = 'ACELERA';
                    ui.instruccion.style.color = 'var(--accent-green)';
                } else if (diff < -threshold) {
                    ui.instruccion.textContent = 'FRENA';
                    ui.instruccion.style.color = 'var(--accent-red)';
                } else {
                    ui.instruccion.textContent = 'OK';
                    ui.instruccion.style.color = 'var(--text-secondary)';
                }
            }
        }
        if (data.tiempo_tramo_s !== undefined && ui.tiempo_tramo) {
            const secs = data.tiempo_tramo_s;
            const isNeg = secs < 0;
            const absSecs = Math.abs(secs);
            const h = Math.floor(absSecs / 3600);
            const m = Math.floor((absSecs % 3600) / 60);
            const s = Math.floor(absSecs % 60);
            const ms = Math.floor((absSecs % 1) * 10);
            const sign = isNeg ? '-' : '';
            ui.tiempo_tramo.innerHTML = `${sign}${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}<span class="tenths">.${ms}</span>`;
        }
        if (data.velocidad_kmh !== undefined && ui.velocidad_actual) ui.velocidad_actual.textContent = data.velocidad_kmh.toFixed(1);
        if (data.velocidad_objetivo_kmh !== undefined && ui.velocidad_objetivo) ui.velocidad_objetivo.textContent = data.velocidad_objetivo_kmh.toFixed(1);
        if (data.system_time && ui.hora) ui.hora.textContent = data.system_time;
        if (data.proxima_media_kmh !== undefined && ui.proxima_media) ui.proxima_media.textContent = data.proxima_media_kmh.toFixed(1) + ' km/h';
        if (data.distancia_cambio_m !== undefined && ui.distancia_cambio) ui.distancia_cambio.textContent = (data.distancia_cambio_m / 1000).toFixed(3) + ' km';
    });
    client.connect();
});
