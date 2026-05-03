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
    btnMilestone.addEventListener('click', async () => {
        let defHitos = 5;
        try {
            const r = await fetch('/api/settings');
            if (r.ok) {
                const s = await r.json();
                if (s.default_hitos !== undefined) defHitos = s.default_hitos;
            }
        } catch(e) {}
        
        // Create custom dialog popup overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000'; overlay.style.fontFamily = 'sans-serif';

        const dialog = document.createElement('div');
        dialog.style.backgroundColor = '#1e293b'; dialog.style.border = '2px solid #3b82f6'; dialog.style.borderRadius = '12px';
        dialog.style.padding = '24px'; dialog.style.width = '320px'; dialog.style.textAlign = 'center'; dialog.style.color = '#fff';
        dialog.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';

        const h3 = document.createElement('h3');
        h3.textContent = "Hitos a generar"; h3.style.margin = '0 0 16px 0'; h3.style.fontSize = '1.25rem'; h3.style.color = '#38bdf8';
        dialog.appendChild(h3);

        const input = document.createElement('input');
        input.type = 'number'; input.value = defHitos;
        input.style.width = '100%'; input.style.padding = '12px'; input.style.marginBottom = '20px'; input.style.borderRadius = '6px';
        input.style.border = '1px solid #475569'; input.style.backgroundColor = '#0f172a'; input.style.color = '#fff'; input.style.fontSize = '1.25rem';
        input.style.textAlign = 'center'; input.style.boxSizing = 'border-box';
        dialog.appendChild(input);

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex'; btnGroup.style.gap = '12px'; btnGroup.style.justifyContent = 'center';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Cancelar';
        btnCancel.style.padding = '12px 20px'; btnCancel.style.backgroundColor = '#475569'; btnCancel.style.border = 'none';
        btnCancel.style.borderRadius = '6px'; btnCancel.style.color = '#fff'; btnCancel.style.cursor = 'pointer'; btnCancel.style.fontSize = '1rem';
        btnCancel.addEventListener('click', () => document.body.removeChild(overlay));

        const btnOk = document.createElement('button');
        btnOk.textContent = 'Aceptar';
        btnOk.style.padding = '12px 20px'; btnOk.style.backgroundColor = '#2563eb'; btnOk.style.border = 'none';
        btnOk.style.borderRadius = '6px'; btnOk.style.color = '#fff'; btnOk.style.cursor = 'pointer'; btnOk.style.fontSize = '1rem';

        const handleOk = () => {
            const num = input.value;
            document.body.removeChild(overlay);
            if (num) {
                const count = parseInt(num);
                if (!isNaN(count) && count > 0) {
                    client.sendCommand(`PREPARE_HITOS:${count}`);
                    btnMilestone.style.background = "rgba(59, 130, 246, 0.4)";
                    setTimeout(() => btnMilestone.style.background = "", 200);
                }
            }
        };

        btnOk.addEventListener('click', handleOk);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleOk(); });

        btnGroup.appendChild(btnCancel); btnGroup.appendChild(btnOk);
        dialog.appendChild(btnGroup); overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        setTimeout(() => input.select(), 50);
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
