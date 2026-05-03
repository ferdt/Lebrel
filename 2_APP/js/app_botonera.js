import { TelemetryClient } from './telemetry.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';
import { initFullscreen } from './fullscreen.js';

initHeader('botonera');
initRouter();
initRotation();
initFullscreen();

const host = window.location.host || 'localhost:8000';
const client = new TelemetryClient(`ws://${host}/ws/telemetry`);

const valDist      = document.getElementById('val_distancia');
const valHora      = document.getElementById('val_hora');
const valTramo     = document.getElementById('val_tramo_nombre');
const statusInd    = document.getElementById('status-indicator');
const btnMilestone = document.getElementById('btn-milestone');
const btnOcr       = document.getElementById('btn-ocr');

client.onStatusChange((isConnected) => {
    if (statusInd) {
        if (isConnected) {
            statusInd.className = "status-dot connected";
            statusInd.title = "Conectado";
        } else {
            statusInd.className = "status-dot disconnected";
            statusInd.title = "Desconectado";
        }
    }
});

client.onMessage((data) => {
    if (valDist && data.distancia_m !== undefined) {
        valDist.textContent = (data.distancia_m / 1000).toFixed(3) + " km";
    }
    if (valHora && data.system_time) {
        valHora.textContent = data.system_time;
    }
    if (valTramo && data.tramo_nombre) {
        valTramo.textContent = data.tramo_nombre;
    }
});

window.adjustDist = function(meters) {
    client.sendCommand(`DIST_ADJUST:${meters}`);
};

if (btnMilestone) {
    btnMilestone.addEventListener('click', () => {
        client.sendCommand("MILESTONE");
        // Visual feedback
        btnMilestone.style.background = "rgba(59, 130, 246, 0.3)";
        setTimeout(() => btnMilestone.style.background = "", 200);
    });
}

if (btnOcr) {
    btnOcr.addEventListener('click', () => {
        // Redirigir a Tablitos (local)
        window.location.href = "/tablitos/tablas.html";
    });
}

const btnRefExtAction = document.getElementById('btn-ref-ext-action');
if (btnRefExtAction) {
    btnRefExtAction.addEventListener('click', () => {
        client.sendCommand("REF_EXT_ACTION");
        btnRefExtAction.style.background = "rgba(251, 191, 36, 0.4)";
        setTimeout(() => btnRefExtAction.style.background = "rgba(251, 191, 36, 0.2)", 200);
    });
}

client.connect();

window.addEventListener('spa-navigated', () => {
    initFullscreen();
});
