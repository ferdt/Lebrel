import { TelemetryClient } from './telemetry.js';

document.addEventListener('DOMContentLoaded', () => {
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

    const client = new TelemetryClient('ws://localhost:8000/ws/telemetry');

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

    const renderTable = (tabla, activeIdx) => {
        tablaCuerpo.innerHTML = '';
        tabla.forEach((row, ix) => {
            const tr = document.createElement('tr');
            
            if (ix === activeIdx) {
                tr.className = 'active-row';
            } else if (ix < activeIdx) {
                tr.className = 'passed-row';
            }

            tr.innerHTML = `
                <td>${ix + 1}</td>
                <td>${(row.inicio_m / 1000).toFixed(3)}</td>
                <td>${(row. fin_m / 1000).toFixed(3)}</td>
                <td style="font-weight:bold;">${row.media_kmh.toFixed(1)}</td>
            `;

            tablaCuerpo.appendChild(tr);
        });
    };

    client.onMessage((data) => {
        if (data.tramo_nombre !== undefined) valTramo.textContent = data.tramo_nombre;
        
        if (data.distancia_m !== undefined) {
            valDistancia.textContent = (data.distancia_m / 1000).toFixed(3) + ' km';
        }
        if (data.diferencia_ideal_s !== undefined) {
            const diff = data.diferencia_ideal_s;
            valDiferencia.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1);
            valDiferencia.className = 'value ' + (diff > 0 ? 'positive' : 'negative');
        }
        if (data.tiempo_tramo_s !== undefined) {
            valTiempo.textContent = formatTime(data.tiempo_tramo_s);
        }
        if (data.velocidad_kmh !== undefined) valVelocidadAct.textContent = data.velocidad_kmh.toFixed(1);
        if (data.velocidad_objetivo_kmh !== undefined) valVelocidadObj.textContent = data.velocidad_objetivo_kmh.toFixed(1);

        // Tabla Render
        // Si el backend envía el array `tramo_tabla`
        if (data.tramo_tabla) {
            currentTableData = data.tramo_tabla;
        }
        if (data.segment_idx !== undefined && currentTableData) {
            if (currentSegment !== data.segment_idx || true) { // Refrescar siempre por si actualiza la tabla (optimización futura)
                currentSegment = data.segment_idx;
                renderTable(currentTableData, currentSegment);
            }
        }
    });

    // Controles Odómetro
    document.getElementById('btn-odo-plus').addEventListener('click', () => client.sendCommand('ODO_PLUS_10m'));
    document.getElementById('btn-odo-minus').addEventListener('click', () => client.sendCommand('ODO_MINUS_10m'));
    document.getElementById('btn-odo-reset').addEventListener('click', () => {
        if (confirm('¿Resetear odómetro a 0?')) client.sendCommand('ODO_RESET');
    });

    client.connect();
});
