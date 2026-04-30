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
        velocidad_actual: document.getElementById('val_velocidad_actual'),
        velocidad_objetivo: document.getElementById('val_velocidad_objetivo'),
        proxima_media: document.getElementById('val_proxima_media'),
        distancia_cambio: document.getElementById('val_distancia_cambio'),
        instruccion: document.getElementById('val_instruccion'),
        odo_parcial: document.getElementById('val_odo_parcial'),
        media_reset: document.getElementById('val_media_reset'),
        btn_reset_parcial: document.getElementById('btn-reset-parcial')
    };

    // Estado para el Odómetro Parcial y Media Reset
    let partialBaseDistM = 0;
    let partialBaseTime = Date.now();
    let currentDistM = 0;

    // Recuperar estado previo de localStorage si existe
    const savedBaseDist = localStorage.getItem('lebrel_partial_base_dist');
    const savedBaseTime = localStorage.getItem('lebrel_partial_base_time');
    if (savedBaseDist !== null) partialBaseDistM = parseFloat(savedBaseDist);
    if (savedBaseTime !== null) partialBaseTime = parseInt(savedBaseTime);

    if (ui.btn_reset_parcial) {
        ui.btn_reset_parcial.addEventListener('click', () => {
            partialBaseDistM = currentDistM;
            partialBaseTime = Date.now();
            localStorage.setItem('lebrel_partial_base_dist', partialBaseDistM);
            localStorage.setItem('lebrel_partial_base_time', partialBaseTime);
            updatePartialUI();
        });
    }

    function updatePartialUI() {
        const partialDistM = currentDistM - partialBaseDistM;
        const elapsedS = (Date.now() - partialBaseTime) / 1000;
        
        if (ui.odo_parcial) {
            ui.odo_parcial.textContent = (partialDistM / 1000).toFixed(3);
        }
        
        if (ui.media_reset) {
            if (elapsedS > 2 && partialDistM > 0) {
                const media = (partialDistM / 1000) / (elapsedS / 3600);
                ui.media_reset.textContent = media.toFixed(1);
            } else {
                ui.media_reset.textContent = "0.0";
            }
        }
    }

    const wsHost = window.location.host || 'localhost:8000';
    const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

    client.onStatusChange((isConnected) => {
        if (isConnected) {
            statusIndicator.className = 'status-dot connected';
            statusIndicator.title = 'Conectado';
        } else {
            statusIndicator.className = 'status-dot disconnected';
            statusIndicator.title = 'Desconectado';
        }
    });

    // Bucle para actualizar la media de reset con mayor frecuencia que la telemetría si se desea, 
    // pero aquí lo haremos al recibir mensaje.
    
    client.onMessage((data) => {
        if (data.tramo_nombre !== undefined && ui.tramo_nombre) ui.tramo_nombre.textContent = data.tramo_nombre;
        
        if (data.distancia_m !== undefined) {
            currentDistM = data.distancia_m;
            if (ui.distancia) ui.distancia.textContent = (currentDistM / 1000).toFixed(3);
            updatePartialUI();
        }

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
        
        if (data.velocidad_kmh !== undefined && ui.velocidad_actual) {
            ui.velocidad_actual.textContent = data.velocidad_kmh.toFixed(1);
        }

        if (data.velocidad_objetivo_kmh !== undefined && ui.velocidad_objetivo) {
            ui.velocidad_objetivo.textContent = data.velocidad_objetivo_kmh.toFixed(1);
        }
        
        if (data.system_time && ui.hora) ui.hora.textContent = data.system_time;
        
        if (data.proxima_media_kmh !== undefined && ui.proxima_media) {
            ui.proxima_media.textContent = data.proxima_media_kmh.toFixed(1);
        }
        
        if (data.distancia_cambio_m !== undefined && ui.distancia_cambio) {
            ui.distancia_cambio.textContent = (data.distancia_cambio_m / 1000).toFixed(3) + ' km';
        }
    });
    client.connect();
});
