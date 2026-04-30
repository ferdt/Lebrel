import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
    initHeader('calibracion');
    initRouter();
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
        history_body: document.getElementById('historial-body'),
        editBar: document.getElementById('cell-edit-bar'),
        editInput: document.getElementById('cell-edit-input'),
        btnEditOk: document.getElementById('cell-edit-ok'),
        btnEditCancel: document.getElementById('cell-edit-cancel')
    };

    let startData = null;
    let currentData = null;
    let lastCalculated = null;
    let _isFirstKey = false;

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
            if (ui.history_body) {
                ui.history_body.innerHTML = data.reverse().map(cal => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 10px;">${cal.timestamp.split(' ')[0]}</td>
                        <td style="padding: 10px;">${cal.real_dist_km.toFixed(3)}</td>
                        <td style="padding: 10px;">${cal.pulses_km_1.toFixed(1)}</td>
                        <td style="padding: 10px;">${cal.rally_factor.toFixed(4)}</td>
                        <td style="padding: 10px;">
                            <button onclick="window.applyCal(${cal.id})" style="padding: 4px 8px; font-size: 0.7rem; background: var(--accent-blue); color: white; border: none; border-radius: 4px;">USAR</button>
                        </td>
                    </tr>
                `).join('');
            }
            
            window.applyCal = async (id) => {
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
        } catch (e) { console.error('Error cargando historial:', e); }
    };

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

    loadHistory();
    client.connect();
});
