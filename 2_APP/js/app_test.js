import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';

initHeader('test');
initRouter();
initFullscreen();
initWakeLock();
initRotation();

const statusIndicator = document.getElementById('status-indicator');
const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');
const distVal = document.getElementById('val_distancia');
const odoSourceVal = document.getElementById('val_odo_source');
const btnReset = document.getElementById('btn-reset-odo');

const wsHost = window.location.host || 'localhost:8000';
const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

client.onStatusChange((isConnected) => {
    if (isConnected) {
        if (statusIndicator) {
            statusIndicator.className = 'status-dot connected';
            statusIndicator.title = 'Conectado';
        }
    } else {
        if (statusIndicator) {
            statusIndicator.className = 'status-dot disconnected';
            statusIndicator.title = 'Desconectado';
        }
    }
});

// Handle speed slider changes
if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        if (speedVal) speedVal.textContent = speed;
        updateRemoteSpeed(speed);
    });
    updateRemoteSpeed(parseFloat(speedSlider.value));
} else {
    updateRemoteSpeed(0);
}

async function updateRemoteSpeed(speed) {
    try {
        await fetch(`/api/test/speed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speed: speed })
        });
    } catch (err) {
        console.error('Error updating speed:', err);
    }
}

// Handle reset odometer
if (btnReset) {
    btnReset.addEventListener('click', () => {
        if (confirm('¿Resetear odómetro del simulador?')) {
            client.sendCommand('ODO_RESET');
        }
    });
}

// Listen to telemetry to show current simulated state
client.onMessage((data) => {
    if (data.distancia_m !== undefined && distVal) {
        distVal.textContent = (data.distancia_m / 1000).toFixed(3) + ' km';
    }
    if (data.odo_source !== undefined && odoSourceVal) {
        odoSourceVal.textContent = data.odo_source.toUpperCase();
        odoSourceVal.style.color = data.odo_source === 'test' ? 'var(--accent-green)' : 'var(--text-secondary)';
    }
});

client.connect();
