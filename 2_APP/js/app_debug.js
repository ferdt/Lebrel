import { TelemetryClient } from './telemetry.js';
import { initHeader } from './header.js';
import { initRouter } from './router.js';

function initDebug() {
    initHeader('debug');
    initRouter();

    const ui = {
        body: document.getElementById('debug-body'),
        btnStart: document.getElementById('btn-start-log'),
        btnStop: document.getElementById('btn-stop-log'),
        logInfo: document.getElementById('log-info'),
        status: document.getElementById('status-indicator')
    };

    let logData = [];
    let isLogging = false;

    const wsHost = window.location.host || 'localhost:8000';
    const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

    client.onStatusChange((isConnected) => {
        ui.status.className = 'status-dot ' + (isConnected ? 'connected' : 'disconnected');
    });

    client.onMessage((data) => {
        // Actualizar tabla
        renderTable(data);

        // Guardar log si está activo
        if (isLogging) {
            logData.push({
                timestamp: Date.now(),
                ...data
            });
            ui.logInfo.textContent = `Registros capturados: ${logData.length}`;
        }
    });

    function renderTable(data) {
        ui.body.innerHTML = Object.entries(data).map(([key, val]) => `
            <tr>
                <td class="var-name">${key}</td>
                <td class="var-value">${formatValue(val)}</td>
            </tr>
        `).join('');
    }

    function formatValue(val) {
        if (typeof val === 'number') return val.toFixed(4);
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
    }

    ui.btnStart.addEventListener('click', () => {
        isLogging = true;
        logData = [];
        ui.btnStart.style.display = 'none';
        ui.btnStop.style.display = 'block';
        ui.logInfo.textContent = 'Iniciando captura...';
    });

    ui.btnStop.addEventListener('click', () => {
        isLogging = false;
        ui.btnStart.style.display = 'block';
        ui.btnStop.style.display = 'none';
        exportLog();
    });

    function exportLog() {
        if (logData.length === 0) return;

        const headersSet = new Set();
        logData.forEach(item => {
            Object.keys(item).forEach(k => headersSet.add(k));
        });
        const headers = Array.from(headersSet);

        const csvRows = [];
        csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

        logData.forEach(item => {
            const row = headers.map(h => {
                let val = item[h];
                if (val === undefined || val === null) {
                    val = '';
                } else if (typeof val === 'object') {
                    val = JSON.stringify(val);
                } else {
                    val = String(val);
                }
                return `"${val.replace(/"/g, '""')}"`;
            });
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lebrel_debug_log_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        ui.logInfo.textContent = `Log exportado (${logData.length} registros en CSV).`;
    }

    const history = [];
    const maxDataPoints = 30;

    function updateChart(cpuLoad, cpuTemp, ramUsed) {
        history.push({ cpu: cpuLoad, temp: cpuTemp, ram: ramUsed });
        if (history.length > maxDataPoints) {
            history.shift();
        }

        const canvas = document.getElementById('system-stats-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        if (history.length < 2) return;

        // X steps
        const stepX = w / (maxDataPoints - 1);

        // Function to draw lines for metrics
        const drawLine = (prop, color, maxScale) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            
            history.forEach((pt, i) => {
                const x = i * stepX;
                let val = pt[prop];
                if (typeof val !== 'number' || isNaN(val)) val = 0;
                const pct = Math.min(val / maxScale, 1);
                const y = h - (pct * (h - 20)) - 10;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Glow effect
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
        };

        // Scale CPU load up to 2.0, CPU temp up to 100 °C, RAM up to 100 %
        drawLine('cpu', '#38bdf8', 2.0);
        drawLine('temp', '#ef4444', 100);
        drawLine('ram', '#10b981', 100);
    }

    async function fetchStats() {
        try {
            const r = await fetch('/api/system/stats');
            if (r.ok) {
                const s = await r.json();
                if (s.error) return;
                const cpuEl = document.getElementById('stat-cpu-1m');
                const tempEl = document.getElementById('stat-cpu-temp');
                const ramEl = document.getElementById('stat-ram');
                if (cpuEl) cpuEl.textContent = s.cpu_load_1m + " (carga 1m)";
                if (tempEl) tempEl.textContent = s.cpu_temp_c + " °C";
                if (ramEl) ramEl.textContent = `${s.ram_used_pct}% (${s.ram_total_mb} MB total)`;

                updateChart(s.cpu_load_1m, s.cpu_temp_c, s.ram_used_pct);
            }
        } catch(e) {}
    }

    setInterval(fetchStats, 3000);
    fetchStats();

    client.connect();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDebug);
} else {
    initDebug();
}

window.addEventListener('spa-navigated', () => {
    initDebug();
});
