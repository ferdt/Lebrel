import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';

initRouter();
initHeader('odometro');
initFullscreen();
initWakeLock();
initRotation();

const ui = {
    dist_gps: document.getElementById('val_dist_gps'),
    dist_rally: document.getElementById('val_dist_rally'),
    pulses_1: document.getElementById('val_pulses_1'),
    pulses_2: document.getElementById('val_pulses_2'),
    input_real_dist: document.getElementById('input_real_dist'),
    display_real_dist: document.getElementById('display_real_dist'),
    btn_reset: document.getElementById('btn-reset-cal'),
    btn_calculate: document.getElementById('btn-calculate-cal'),
    btn_save: document.getElementById('btn-save-cal'),
    results_box: document.getElementById('results_box'),
    results_container: document.getElementById('results_container'),
    res_rally_factor: document.getElementById('res_rally_factor'),
    history_body: document.getElementById('cal_history_body'),
    editBar: document.getElementById('cell-edit-bar'),
    editInput: document.getElementById('cell-edit-input'),
    btnEditOk: document.getElementById('cell-edit-ok'),
    btnEditCancel: document.getElementById('cell-edit-cancel'),
    btnManual: document.getElementById('btn-manual-cal'),
    modalManual: document.getElementById('modal-manual'),
    manualTitle: document.getElementById('manual-title'),
    manDist: document.getElementById('man-dist'),
    manFactor: document.getElementById('man-factor'),
    manP1: document.getElementById('man-p1'),
    manP2: document.getElementById('man-p2'),
    btnManualSave: document.getElementById('btn-manual-save'),
    btnManualCancel: document.getElementById('btn-manual-cancel')
};

let startData = null;
let currentData = null;
let lastCalculated = null;
let _isFirstKey = false;
let editingId = null;

// --- Editor Bar Logic ---
const openEditor = () => {
    ui.editInput.value = ui.display_real_dist.textContent;
    ui.editInput.classList.add('selected-highlight');
    _isFirstKey = true;
    ui.editBar.classList.add('open');
};

const closeEditor = () => {
    ui.editBar.classList.remove('open');
};

window.pressKey = (key) => {
    if (key === 'back') {
        ui.editInput.value = ui.editInput.value.slice(0, -1);
        _isFirstKey = false;
    } else if (key === 'clear') {
        ui.editInput.value = '0';
        _isFirstKey = true;
    } else {
        if (_isFirstKey) {
            ui.editInput.value = key;
            _isFirstKey = false;
        } else {
            ui.editInput.value += key;
        }
    }
    ui.editInput.classList.remove('selected-highlight');
};

ui.display_real_dist.addEventListener('click', openEditor);
ui.btnEditCancel.addEventListener('click', closeEditor);
ui.btnEditOk.addEventListener('click', () => {
    const val = parseFloat(ui.editInput.value) || 0;
    ui.display_real_dist.textContent = val.toFixed(3);
    ui.input_real_dist.value = val;
    closeEditor();
});

const loadHistory = async () => {
    try {
        const resp = await fetch('/api/calibraciones');
        const data = await resp.json();
        
        if (ui.history_body && Array.isArray(data)) {
            ui.history_body.innerHTML = data.map(cal => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px;">${cal.timestamp ? cal.timestamp.split(' ')[0] : '--'}</td>
                    <td style="padding: 10px;">${(cal.real_dist_km || 0).toFixed(3)}</td>
                    <td style="padding: 10px;">${(cal.pulses_km_1 || 0).toFixed(1)}</td>
                    <td style="padding: 10px;">${cal.pulses_km_2 ? cal.pulses_km_2.toFixed(1) : '--'}</td>
                    <td style="padding: 10px;">${(cal.rally_factor || 1).toFixed(4)}</td>
                    <td style="padding: 10px; text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
                        <button onclick="window.applyCal(${cal.id})" title="Usar" style="padding: 5px; background: var(--accent-green); border: none; border-radius: 4px; color: white; cursor: pointer;">✓</button>
                        <button onclick="window.editCal(${cal.id})" title="Editar" style="padding: 5px; background: var(--accent-blue); border: none; border-radius: 4px; color: white; cursor: pointer;">✎</button>
                        <button onclick="window.deleteCal(${cal.id})" title="Borrar" style="padding: 5px; background: var(--accent-red); border: none; border-radius: 4px; color: white; cursor: pointer;">✕</button>
                    </td>
                </tr>
            `).join('');
        }
        
        window.editCal = (id) => {
            if (!Array.isArray(data)) return;
            const cal = data.find(c => c.id === id);
            if (cal) {
                editingId = id;
                ui.manualTitle.textContent = "Editar Calibración";
                ui.manDist.value = cal.real_dist_km;
                ui.manFactor.value = cal.rally_factor;
                ui.manP1.value = cal.pulses_km_1;
                ui.manP2.value = cal.pulses_km_2 || 0;
                ui.modalManual.classList.add('open');
            }
        };

        window.deleteCal = async (id) => {
            if (confirm('¿Seguro que quieres borrar esta calibración?')) {
                await fetch(`/api/calibraciones/${id}`, { method: 'DELETE' });
                loadHistory();
            }
        };
        
        window.applyCal = async (id) => {
            if (!Array.isArray(data)) return;
            const cal = data.find(c => c.id === id);
            if (cal) {
                await fetch('/api/calibraciones/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cal)
                });
                alert('Calibración aplicada correctamente');
            }
        };
    } catch (e) { 
        console.error('Error cargando historial:', e); 
    }
};

ui.btnManual.addEventListener('click', () => {
    editingId = null;
    ui.manualTitle.textContent = "Nueva Calibración Manual";
    ui.manDist.value = "";
    ui.manFactor.value = "1.0000";
    ui.manP1.value = "";
    ui.manP2.value = "";
    ui.modalManual.classList.add('open');
});

ui.btnManualCancel.addEventListener('click', () => ui.modalManual.classList.remove('open'));

ui.btnManualSave.addEventListener('click', async () => {
    const payload = {
        real_dist_km: parseFloat(ui.manDist.value),
        rally_factor: parseFloat(ui.manFactor.value),
        pulses_km_1: parseFloat(ui.manP1.value),
        pulses_km_2: parseFloat(ui.manP2.value) || 0
    };

    if (isNaN(payload.real_dist_km)) { alert('Distancia inválida'); return; }

    const url = editingId ? `/api/calibraciones/${editingId}` : '/api/calibraciones';
    const method = editingId ? 'PUT' : 'POST';

    try {
        await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        ui.modalManual.classList.remove('open');
        loadHistory();
    } catch (e) { alert('Error guardando'); }
});

const wsHost = window.location.host || 'localhost:8000';
const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

client.onMessage((data) => {
    currentData = data;
    if (!startData) startData = JSON.parse(JSON.stringify(data));

    const deltaGPS = (data.dist_gps_m - startData.dist_gps_m) / 1000;
    const deltaRally = (data.distancia_m - startData.distancia_m) / 1000;
    const deltaP1 = data.pulses_1 - startData.pulses_1;
    const deltaP2 = data.pulses_2 - startData.pulses_2;

    if(ui.dist_gps) ui.dist_gps.textContent = deltaGPS.toFixed(3) + ' km';
    if(ui.dist_rally) ui.dist_rally.textContent = deltaRally.toFixed(3) + ' km';
    if(ui.pulses_1) ui.pulses_1.textContent = deltaP1;
    if(ui.pulses_2) ui.pulses_2.textContent = deltaP2;
});

ui.btn_reset.addEventListener('click', () => {
    startData = JSON.parse(JSON.stringify(currentData));
    ui.results_box.classList.remove('visible');
    ui.input_real_dist.value = '0';
    ui.display_real_dist.textContent = '0.000';
});

ui.btn_calculate.addEventListener('click', () => {
    const realDistKm = parseFloat(ui.input_real_dist.value);
    if (isNaN(realDistKm) || realDistKm <= 0) {
        alert('Introduce una distancia real válida');
        return;
    }

    const deltaGPS = (currentData.dist_gps_m - startData.dist_gps_m) / 1000;
    const deltaP1 = currentData.pulses_1 - startData.pulses_1;
    const deltaP2 = currentData.pulses_2 - startData.pulses_2;

    lastCalculated = {
        real_dist_km: realDistKm,
        rally_factor: deltaGPS > 0 ? (realDistKm / deltaGPS) : 1.0,
        pulses_km_1: deltaP1 / realDistKm,
        pulses_km_2: deltaP2 / realDistKm
    };

    ui.results_container.innerHTML = `
        <div class="result-item">
            <span class="result-label">Sensor 1 (Pulsos/km)</span>
            <span class="result-value">${lastCalculated.pulses_km_1.toFixed(1)}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Sensor 2 (Pulsos/km)</span>
            <span class="result-value">${lastCalculated.pulses_km_2.toFixed(1)}</span>
        </div>
    `;
    ui.res_rally_factor.textContent = lastCalculated.rally_factor.toFixed(4);
    ui.results_box.classList.add('visible');
});

ui.btn_save.addEventListener('click', async () => {
    if (!lastCalculated) return;
    try {
        await fetch('/api/calibraciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastCalculated)
        });
        alert('Calibración guardada');
        loadHistory();
    } catch (e) { alert('Error guardando'); }
});

const sourceButtons = {
    sensor1: document.getElementById('btn-source-sensor1'),
    sensor2: document.getElementById('btn-source-sensor2'),
    gps: document.getElementById('btn-source-gps')
};

let currentSettings = {};

async function fetchSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            currentSettings = await res.json();
            updateSourceUI(currentSettings.odometer_source || 'sensor1');
        }
    } catch (err) {
        console.error('Error fetching settings:', err);
    }
}

function updateSourceUI(source) {
    Object.keys(sourceButtons).forEach(k => {
        const btn = sourceButtons[k];
        if (btn) {
            if (k === source) {
                btn.classList.add('active');
                btn.style.background = 'var(--accent-blue)';
                btn.style.borderColor = 'var(--accent-blue)';
                btn.style.fontWeight = 'bold';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255, 255, 255, 0.03)';
                btn.style.borderColor = 'var(--glass-border)';
                btn.style.fontWeight = 'normal';
            }
        }
    });
}

async function updateSource(source) {
    currentSettings.odometer_source = source;
    currentSettings.test_mode = false;
    updateSourceUI(source);
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings)
        });
    } catch (err) {
        console.error('Error updating odometer source:', err);
    }
}

if (sourceButtons.sensor1) {
    sourceButtons.sensor1.addEventListener('click', () => {
        updateSource('sensor1');
    });
}
if (sourceButtons.sensor2) {
    sourceButtons.sensor2.addEventListener('click', () => {
        updateSource('sensor2');
    });
}
if (sourceButtons.gps) {
    sourceButtons.gps.addEventListener('click', () => {
        updateSource('gps');
    });
}

fetchSettings();
loadHistory();
client.connect();
