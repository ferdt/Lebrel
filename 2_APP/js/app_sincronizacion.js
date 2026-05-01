import { initRouter } from './router.js';
import { initHeader } from './header.js';
import { TelemetryClient } from './telemetry.js';

document.addEventListener('DOMContentLoaded', () => {
    try {
        initRouter();
        initHeader('sincronizacion');
    } catch (e) {
        console.error('Error durante la inicialización:', e);
    }

    const ui = {
        rallyTime: document.getElementById('rally-time'),
        gpsTime: document.getElementById('gps-time'),
        offsetTime: document.getElementById('offset-time'),
        btnSub1: document.getElementById('btn-sub-1'),
        btnSub01: document.getElementById('btn-sub-01'),
        btnAdd01: document.getElementById('btn-add-01'),
        btnAdd1: document.getElementById('btn-add-1')
    };

    let currentSettings = {};
    let currentOffset = 0.0;

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                currentSettings = await res.json();
                currentOffset = currentSettings.time_offset_s || 0.0;
                updateOffsetUI(currentOffset);
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
        }
    }

    async function updateOffsetOnBackend(newOffset) {
        currentOffset = parseFloat(newOffset.toFixed(1));
        currentSettings.time_offset_s = currentOffset;

        // Update UI immediately for direct feedback
        updateOffsetUI(currentOffset);

        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentSettings)
            });
        } catch (err) {
            console.error('Error updating time offset on backend:', err);
        }
    }

    function updateOffsetUI(offset) {
        if (ui.offsetTime) {
            ui.offsetTime.textContent = (offset > 0 ? '+' : '') + offset.toFixed(1) + ' s';
            if (offset > 0) {
                ui.offsetTime.className = 'offset-val positive';
            } else if (offset < 0) {
                ui.offsetTime.className = 'offset-val negative';
            } else {
                ui.offsetTime.className = 'offset-val';
            }
        }
    }

    // Handlers for adjustments
    if (ui.btnSub1)  ui.btnSub1.addEventListener('click',  () => updateOffsetOnBackend(currentOffset - 1.0));
    if (ui.btnSub01) ui.btnSub01.addEventListener('click', () => updateOffsetOnBackend(currentOffset - 0.1));
    if (ui.btnAdd01) ui.btnAdd01.addEventListener('click', () => updateOffsetOnBackend(currentOffset + 0.1));
    if (ui.btnAdd1)  ui.btnAdd1.addEventListener('click',  () => updateOffsetOnBackend(currentOffset + 1.0));

    let currentSecond = null;
    let audioCtx = null;

    function playBeep() {
        if (localStorage.getItem('lebrel_mute_sounds') === 'true') {
            return;
        }
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.value = 1000;
            gain.gain.value = 0.1;

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            setTimeout(() => {
                osc.stop();
            }, 80);
        } catch (e) {
            console.error('Error playing beep:', e);
        }
    }

    // Telemetry connection
    const wsHost = window.location.host || 'localhost:8000';
    const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

    client.onMessage((data) => {
        if (data.system_time && ui.rallyTime) {
            ui.rallyTime.textContent = data.system_time;

            // Emit a beep on second change
            const parts = data.system_time.split(':');
            if (parts.length === 3) {
                const secPart = parts[2].split('.')[0];
                if (currentSecond !== null && currentSecond !== secPart) {
                    playBeep();
                }
                currentSecond = secPart;
            }
        }
        if (data.gps_time && ui.gpsTime) {
            ui.gpsTime.textContent = data.gps_time;
        }
        if (data.time_offset_s !== undefined) {
            // Re-sync currentOffset in case it was changed externally or from other pages
            currentOffset = data.time_offset_s;
            updateOffsetUI(currentOffset);
        }
    });

    client.connect();
    fetchSettings();
});
