import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader, updateGpsStatus } from './header.js';

function initCopiloto() {
    initRouter();
    initHeader('copiloto');
    initFullscreen();
    initWakeLock();
    initRotation();
    const statusIndicator = document.getElementById('status-indicator');
    
    // UI Elements Izquierda
    const valTramo = document.getElementById('val_tramo_nombre');
    const valHora = document.getElementById('val_hora');
    const valDiferencia = document.getElementById('val_diferencia_ideal');
    const valDistancia = document.getElementById('val_distancia');
    const valVelocidadAct = document.getElementById('val_velocidad_actual');
    const valVelocidadObj = document.getElementById('val_velocidad_objetivo');
    const valTiempo = document.getElementById('val_tiempo_tramo');
    
    // UI Tabla
    const tablaCuerpo = document.getElementById('tabla_cuerpo');

    let currentTableData = null;
    let currentSegment = -1;
    let currentHoraInicioTramo = '';  // "HH:MM:SS.d" del tramo activo

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

    // El reloj se actualizará desde la telemetría para estar sincronizado con la Pi

    const formatTime = (secs) => {
        const isNeg = secs < 0;
        const absSecs = Math.abs(secs);
        const h = Math.floor(absSecs / 3600);
        const m = Math.floor((absSecs % 3600) / 60);
        const s = Math.floor(absSecs % 60);
        const ms = Math.floor((absSecs % 1) * 10);
        const sign = isNeg ? '-' : '';
        const timePart = `${sign}${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        return `${timePart}<span class="tenths">.${ms}</span>`;
    };

    /** Parsea "HH:MM:SS.d" a segundos totales. Devuelve null si inválido. */
    const parseTimeStr = (str) => {
        if (!str) return null;
        const m = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d))?$/);
        if (!m) return null;
        return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + (m[4] ? parseInt(m[4]) * 0.1 : 0);
    };

    /** Formatea segundos totales a "HH:MM:SS.d" */
    const formatTimeFull = (secs) => {
        if (secs == null || isNaN(secs)) return '--:--:--.--';
        const h  = Math.floor(secs / 3600);
        const mn = Math.floor((secs % 3600) / 60);
        const s  = Math.floor(secs % 60);
        const d  = Math.floor((secs % 1) * 10);
        return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
    };

    /** Formatea una duración en segundos a "MM:SS" o "H:MM:SS" */
    const formatDuration = (secs) => {
        if (secs == null || isNaN(secs) || secs < 0) return '--:--';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    const CELL_LABELS = {
        ini: 'Inicio (km)', fin: 'Fin (km)', media: 'Media (km/h)',
        dur: 'Duración (MM:SS.d)', h_fin: 'T. Fin (MM:SS.d)'
    };

    let _editCell = null, _activeTramoId = null, _isFirstKey = false;

    const openCellEditor = (td, type, idx) => {
        _editCell = { td, type, idx };
        const label = CELL_LABELS[type] || type;
        const val = td.textContent.split(' ')[0];
        
        document.getElementById('cell-edit-label').textContent = label;
        const input = document.getElementById('cell-edit-input');
        input.value = val;
        _isFirstKey = true;
        input.classList.add('selected-highlight');
        
        modalRecal.classList.remove('open');
        document.getElementById('cell-edit-bar').classList.add('open');
    };

    const closeCellEditor = () => {
        document.getElementById('cell-edit-bar').classList.remove('open');
        document.getElementById('cell-edit-input').classList.remove('selected-highlight');
        _editCell = null;
    };

    const getRelStartTime = (idx) => {
        let t = 0;
        for (let i = 0; i < idx; i++) {
            const s = currentTableData[i];
            t += ((s.fin_m - s.inicio_m) / 1000) / s.media_kmh * 3600;
        }
        return t;
    };

    const parseDuration = (str) => {
        const parts = str.split(':');
        if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        return parseFloat(str);
    };

    document.getElementById('cell-edit-cancel').addEventListener('click', closeCellEditor);
    document.getElementById('cell-edit-ok').addEventListener('click', async () => {
        if (!_editCell || !currentTableData || !_activeTramoId) return;
        
        const newVal = document.getElementById('cell-edit-input').value.replace(',', '.');
        const { type, idx } = _editCell;
        const seg = currentTableData[idx];

        if (type === 'ini') seg.inicio_m = parseFloat(newVal) * 1000;
        else if (type === 'fin') seg.fin_m = parseFloat(newVal) * 1000;
        else if (type === 'media') seg.media_kmh = parseFloat(newVal);
        else if (type === 'dur' || type === 'h_fin') {
            const secs = parseDuration(newVal);
            if (secs !== null) {
                const distKm = (seg.fin_m - seg.inicio_m) / 1000;
                if (distKm > 0) {
                    const targetSecs = (type === 'dur') ? secs : (secs - (getRelStartTime(idx)));
                    seg.media_kmh = (distKm / targetSecs) * 3600;
                }
            }
        }

        try {
            const resp = await fetch('/api/tramos');
            const allTramos = await resp.json();
            const tIdx = allTramos.findIndex(t => t.id === _activeTramoId);
            if (tIdx !== -1) {
                allTramos[tIdx].segmentos = currentTableData;
                await fetch('/api/tramos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(allTramos)
                });
                closeCellEditor();
            }
        } catch (e) { console.error("Error saving:", e); }
    });

    const renderTable = (tabla, activeIdx) => {
        if(!tablaCuerpo) return;
        tablaCuerpo.innerHTML = '';
        let cursorRelativo = 0; 

        tabla.forEach((row, ix) => {
            const distKm   = (row.fin_m - row.inicio_m) / 1000;
            const durSecs  = (distKm / row.media_kmh) * 3600;
            const tiempoFin = cursorRelativo + durSecs;
            cursorRelativo += durSecs;

            const tr = document.createElement('tr');
            if (ix === activeIdx)      tr.className = 'active-row';
            else if (ix < activeIdx)   tr.className = 'passed-row';
            
            tr.innerHTML = `
                <td>${ix + 1}</td>
                <td class="td-editable" onclick="editCell(this, 'ini', ${ix})">${(row.inicio_m / 1000).toFixed(3)}</td>
                <td class="td-editable" onclick="editCell(this, 'fin', ${ix})">${(row.fin_m    / 1000).toFixed(3)}</td>
                <td class="td-editable" onclick="editCell(this, 'media', ${ix})" style="font-weight:bold;">${row.media_kmh.toFixed(1)}</td>
                <td>${row.referencias_externas ? 'Sí' : 'No'}</td>
                <td class="td-editable" onclick="editCell(this, 'dur', ${ix})" style="color:var(--text-secondary); font-size:0.85em;">${formatDuration(durSecs)}</td>
                <td class="td-editable" onclick="editCell(this, 'h_fin', ${ix})" style="color:var(--text-secondary); font-size:0.85em; font-variant-numeric:tabular-nums;">${formatTimeFull(tiempoFin)}</td>
            `;
            tablaCuerpo.appendChild(tr);
        });
    };
    
    window.editCell = (td, type, idx) => openCellEditor(td, type, idx);

    // --- Recalibración al paso ---
    let snappedDistanceM = 0;
    const modalRecal = document.getElementById('modal-recalibrar');
    const inputRoadbook = document.getElementById('input-roadbook');
    const snapDistDisplay = document.getElementById('snap-dist-val');
    const btnRecalOk = document.getElementById('btn-recal-ok');
    const btnRecalCancel = document.getElementById('btn-recal-cancel');
    let currentDistM = 0; // Guardará el último valor recibido

    window.pressKeyOdo = (key) => {
        const input = document.getElementById('input-roadbook');
        if (!input) return;
        if (key === 'back') {
            input.value = input.value.slice(0, -1);
        } else {
            input.value += key;
        }
    };

    window.adjustOdoVal = (val) => {
        const input = document.getElementById('input-roadbook');
        if (!input) return;
        _isFirstKey = false; // Al ajustar manualmente, ya no sobrescribimos
        input.classList.remove('selected-highlight');
        if (val === 'zero') {
            input.value = (0).toFixed(3);
        } else {
            let current = parseFloat(input.value) || 0;
            input.value = (current + val).toFixed(3);
        }
    };

    if (valDistancia) {
        valDistancia.style.cursor = 'pointer';
        valDistancia.addEventListener('click', () => {
            snappedDistanceM = currentDistM;
            snapDistDisplay.textContent = (snappedDistanceM / 1000).toFixed(3);
            inputRoadbook.value = (snappedDistanceM / 1000).toFixed(3);
            _isFirstKey = true; // También para odo
            inputRoadbook.classList.add('selected-highlight');
            closeCellEditor(); // Cerrar el otro si está abierto
            modalRecal.classList.add('open');
        });
    }

    window.pressKey = (key) => {
        const input = document.getElementById('cell-edit-input');
        if (!input) return;
        if (_isFirstKey && key !== 'back') {
            input.value = '';
            _isFirstKey = false;
            input.classList.remove('selected-highlight');
        }
        if (key === 'back') {
            input.value = input.value.slice(0, -1);
            _isFirstKey = false;
            input.classList.remove('selected-highlight');
        } else {
            input.value += key;
        }
    };

    window.pressKeyOdo = (key) => {
        const input = document.getElementById('input-roadbook');
        if (!input) return;
        if (_isFirstKey && key !== 'back') {
            input.value = '';
            _isFirstKey = false;
            input.classList.remove('selected-highlight');
        }
        if (key === 'back') {
            input.value = input.value.slice(0, -1);
            _isFirstKey = false;
            input.classList.remove('selected-highlight');
        } else {
            input.value += key;
        }
    };

    window.adjustModalVal = (val) => {
        if (!inputRoadbook) return;
        if (val === 'zero') {
            inputRoadbook.value = (0).toFixed(3);
        } else {
            let current = parseFloat(inputRoadbook.value) || 0;
            inputRoadbook.value = (current + val).toFixed(3);
        }
    };

    inputRoadbook.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            btnRecalOk.click();
        }
    });

    btnRecalCancel.addEventListener('click', () => modalRecal.classList.remove('open'));
    btnRecalOk.addEventListener('click', () => {
        const roadbookKm = parseFloat(inputRoadbook.value);
        if (!isNaN(roadbookKm)) {
            const roadbookM = roadbookKm * 1000;
            const diffM = roadbookM - snappedDistanceM;
            client.sendCommand(`DIST_ADJUST:${diffM}`);
            modalRecal.classList.remove('open');
        }
    });

    client.onMessage((data) => {
        if (data.distancia_m !== undefined) {
            currentDistM = data.distancia_m;
            if (valDistancia) valDistancia.textContent = (data.distancia_m / 1000).toFixed(3);
        }
        if (data.tramo_nombre !== undefined && valTramo) valTramo.textContent = data.tramo_nombre;
        if (data.tramo_id !== undefined) _activeTramoId = data.tramo_id;
        if (data.gps_tcp_status !== undefined) updateGpsStatus(data.gps_tcp_status);

        if (data.diferencia_ideal_s !== undefined && valDiferencia) {
            const diff = data.diferencia_ideal_s;
            const threshold = 0.1;
            valDiferencia.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1);
            valDiferencia.className = 'value ' + (diff > threshold ? 'positive' : (diff < -threshold ? 'negative' : ''));
        }
        if (data.tiempo_tramo_s !== undefined && valTiempo) valTiempo.innerHTML = formatTime(data.tiempo_tramo_s);
        if (data.velocidad_kmh !== undefined && valVelocidadAct) valVelocidadAct.textContent = data.velocidad_kmh.toFixed(1);
        if (data.velocidad_objetivo_kmh !== undefined && valVelocidadObj) valVelocidadObj.textContent = data.velocidad_objetivo_kmh.toFixed(1);

        if (data.hora_inicio_tramo !== undefined) currentHoraInicioTramo = data.hora_inicio_tramo;
        
        // NO actualizar la tabla si estamos editando una celda para evitar sobrescrituras
        if (data.tramo_tabla && !_editCell) {
            currentTableData = data.tramo_tabla;
        }

        if (data.segment_idx !== undefined && currentTableData) {
            currentSegment = data.segment_idx;
            // Solo redibujar si no estamos editando
            if (!_editCell) {
                renderTable(currentTableData, currentSegment);
            }
        }
        if (data.system_time && valHora) valHora.textContent = data.system_time;
    });

    const btnPlus = document.getElementById('btn-odo-plus');
    const btnMinus = document.getElementById('btn-odo-minus');
    const btnPlus1 = document.getElementById('btn-odo-plus1');
    const btnMinus1 = document.getElementById('btn-odo-minus1');
    const btnMilestone = document.getElementById('btn-milestone');
    const btnOcr = document.getElementById('btn-ocr');
    const btnReset = document.getElementById('btn-odo-reset');

    if(btnPlus) btnPlus.addEventListener('click', () => client.sendCommand('DIST_ADJUST:10'));
    if(btnMinus) btnMinus.addEventListener('click', () => client.sendCommand('DIST_ADJUST:-10'));
    if(btnPlus1) btnPlus1.addEventListener('click', () => client.sendCommand('DIST_ADJUST:1'));
    if(btnMinus1) btnMinus1.addEventListener('click', () => client.sendCommand('DIST_ADJUST:-1'));
    
    if(btnMilestone) {
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

    if(btnOcr) {
        btnOcr.addEventListener('click', () => {
            window.location.href = "/tablitos/tablas.html";
        });
    }

    const btnRefExtAction = document.getElementById('btn-ref-ext-action');
    if(btnRefExtAction) {
        btnRefExtAction.addEventListener('click', () => {
            client.sendCommand('REF_EXT_ACTION');
            btnRefExtAction.style.background = "rgba(251, 191, 36, 0.4)";
            setTimeout(() => btnRefExtAction.style.background = "rgba(251, 191, 36, 0.2)", 200);
        });
    }

    if(btnReset) btnReset.addEventListener('click', () => {
        if (confirm('¿Resetear odómetro a 0?')) client.sendCommand('ODO_RESET');
    });

    client.connect();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCopiloto);
} else {
    initCopiloto();
}
