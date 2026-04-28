import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initFullscreen();
    initWakeLock();
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
            statusIndicator.textContent = 'Conectado';
            statusIndicator.className = 'status connected';
        } else {
            statusIndicator.textContent = 'Desconectado';
            statusIndicator.className = 'status disconnected';
        }
    });

    setInterval(() => {
        if(valHora) {
            const now = new Date();
            valHora.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
    }, 1000);

    const formatTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
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

    const renderTable = (tabla, activeIdx, horaInicioStr) => {
        if(!tablaCuerpo) return;
        tablaCuerpo.innerHTML = '';

        // Calcular cursor de tiempo acumulado desde hora_inicio del tramo
        let cursor = parseTimeStr(horaInicioStr); // null si no hay hora definida

        tabla.forEach((row, ix) => {
            const distKm   = (row.fin_m - row.inicio_m) / 1000;
            const durSecs  = (distKm / row.media_kmh) * 3600;
            const horaFin  = (cursor != null) ? cursor + durSecs : null;
            if (cursor != null) cursor += durSecs;

            const tr = document.createElement('tr');
            if (ix === activeIdx)      tr.className = 'active-row';
            else if (ix < activeIdx)   tr.className = 'passed-row';
            tr.innerHTML = `
                <td>${ix + 1}</td>
                <td>${(row.inicio_m / 1000).toFixed(3)}</td>
                <td>${(row.fin_m    / 1000).toFixed(3)}</td>
                <td style="font-weight:bold;">${row.media_kmh.toFixed(1)}</td>
                <td style="color:var(--text-secondary); font-size:0.85em;">${formatDuration(durSecs)}</td>
                <td style="color:var(--text-secondary); font-size:0.85em; font-variant-numeric:tabular-nums;">${formatTimeFull(horaFin)}</td>
            `;
            tablaCuerpo.appendChild(tr);
        });
    };

    client.onMessage((data) => {
        if (data.tramo_nombre !== undefined && valTramo) valTramo.textContent = data.tramo_nombre;
        if (data.distancia_m !== undefined && valDistancia) valDistancia.textContent = (data.distancia_m / 1000).toFixed(3) + ' km';
        if (data.diferencia_ideal_s !== undefined && valDiferencia) {
            const diff = data.diferencia_ideal_s;
            const label = diff > 0.1 ? ' ACELERA' : (diff < -0.1 ? ' FRENA' : '');
            valDiferencia.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + label;
            valDiferencia.className = 'value ' + (diff > 0.1 ? 'positive' : (diff < -0.1 ? 'negative' : ''));
        }
        if (data.tiempo_tramo_s !== undefined && valTiempo) valTiempo.textContent = formatTime(data.tiempo_tramo_s);
        if (data.velocidad_kmh !== undefined && valVelocidadAct) valVelocidadAct.textContent = data.velocidad_kmh.toFixed(1);
        if (data.velocidad_objetivo_kmh !== undefined && valVelocidadObj) valVelocidadObj.textContent = data.velocidad_objetivo_kmh.toFixed(1);

        if (data.hora_inicio_tramo !== undefined) currentHoraInicioTramo = data.hora_inicio_tramo;
        if (data.tramo_tabla) currentTableData = data.tramo_tabla;
        if (data.segment_idx !== undefined && currentTableData) {
            currentSegment = data.segment_idx;
            renderTable(currentTableData, currentSegment, currentHoraInicioTramo);
        }
    });

    const btnPlus = document.getElementById('btn-odo-plus');
    const btnMinus = document.getElementById('btn-odo-minus');
    const btnReset = document.getElementById('btn-odo-reset');

    if(btnPlus) btnPlus.addEventListener('click', () => client.sendCommand('ODO_PLUS_10m'));
    if(btnMinus) btnMinus.addEventListener('click', () => client.sendCommand('ODO_MINUS_10m'));
    if(btnReset) btnReset.addEventListener('click', () => {
        if (confirm('¿Resetear odómetro a 0?')) client.sendCommand('ODO_RESET');
    });

    client.connect();
});
