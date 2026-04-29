import { initFullscreen } from './fullscreen.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';

let socket = null;
const host = window.location.host || 'localhost:8000';

const valDist     = document.getElementById('val_distancia');
const valHora     = document.getElementById('val_hora');
const valTramo    = document.getElementById('val_tramo_nombre');
const statusInd   = document.getElementById('status-indicator');
const btnMilestone = document.getElementById('btn-milestone');
const btnOcr       = document.getElementById('btn-ocr');

function connect() {
    socket = new WebSocket(`ws://${host}/ws`);
    
    socket.onopen = () => {
        statusInd.textContent = "ONLINE";
        statusInd.className = "status connected";
    };

    socket.onclose = () => {
        statusInd.textContent = "OFFLINE";
        statusInd.className = "status disconnected";
        setTimeout(connect, 2000);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (valDist)  valDist.textContent  = (data.distancia_m / 1000).toFixed(3) + " km";
        if (valHora)  valHora.textContent  = data.hora;
        if (valTramo) valTramo.textContent = data.tramo_nombre || "TC-0: SIN TRAMO";
    };
}

window.adjustDist = function(meters) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(`DIST_ADJUST:${meters}`);
    }
};

if (btnMilestone) {
    btnMilestone.addEventListener('click', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send("MILESTONE");
            // Visual feedback
            btnMilestone.style.background = "rgba(59, 130, 246, 0.3)";
            setTimeout(() => btnMilestone.style.background = "", 200);
        }
    });
}

if (btnOcr) {
    btnOcr.addEventListener('click', () => {
        // Redirigir a Tablitos (local)
        window.location.href = "/tablitos/tablas.html";
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initFullscreen();
    initRotation();
    connect();
});

window.addEventListener('spa-navigated', () => {
    initFullscreen();
});
