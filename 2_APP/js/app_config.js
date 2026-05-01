import { initRouter } from './router.js';
import { initHeader } from './header.js';

initRouter();
initHeader('config');

const elements = {
    odometer_source: document.getElementById('odometer_source'),
    driving_sound_aids: document.getElementById('driving_sound_aids'),
    wheel_perimeter_m: document.getElementById('wheel_perimeter_m'),
    neutral_interval_s: document.getElementById('neutral_interval_s'),
    pid_weight: document.getElementById('pid_weight'),
    pid_power: document.getElementById('pid_power'),
    pid_accel_max: document.getElementById('pid_accel_max'),
    pid_decel_max: document.getElementById('pid_decel_max'),
    pid_kp: document.getElementById('pid_kp'),
    pid_ki: document.getElementById('pid_ki'),
    pid_kd: document.getElementById('pid_kd'),
    theme: document.getElementById('theme'),
    font_size_offset: document.getElementById('font_size_offset'),
    btnSave: document.getElementById('btn-save'),
    saveMsg: document.getElementById('save-msg')
};

let currentSettings = {};

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch');
        currentSettings = await res.json();
        
        if (elements.odometer_source) elements.odometer_source.value = currentSettings.odometer_source || 'sensor1';
        if (elements.wheel_perimeter_m) elements.wheel_perimeter_m.value = currentSettings.wheel_perimeter_m || 1.950;
        if (elements.neutral_interval_s) elements.neutral_interval_s.value = currentSettings.neutral_interval_s || 0.10;
        if (elements.pid_weight) elements.pid_weight.value = currentSettings.pid_weight || 1000;
        if (elements.pid_power) elements.pid_power.value = currentSettings.pid_power || 100;
        if (elements.pid_accel_max) elements.pid_accel_max.value = currentSettings.pid_accel_max || 0.54;
        if (elements.pid_decel_max) elements.pid_decel_max.value = currentSettings.pid_decel_max || 0.50;
        if (elements.pid_kp) elements.pid_kp.value = currentSettings.pid_kp || 0.188;
        if (elements.pid_ki) elements.pid_ki.value = currentSettings.pid_ki || 0.020;
        if (elements.pid_kd) elements.pid_kd.value = currentSettings.pid_kd || 0.050;
        if (elements.theme) elements.theme.value = currentSettings.theme || 'dark';
        if (elements.font_size_offset) elements.font_size_offset.value = currentSettings.font_size_offset || 0;
        
        // Cargar desde localStorage para el toggle de ayuda sonora de piloto
        if (elements.driving_sound_aids) {
            const isEnabled = localStorage.getItem('lebrel_pilot_sound_aids') !== 'false';
            elements.driving_sound_aids.value = isEnabled ? 'true' : 'false';
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

const btnPidAutotune = document.getElementById('btn-pid-autotune');
if (btnPidAutotune) {
    btnPidAutotune.addEventListener('click', () => {
        const accelG = parseFloat(elements.pid_accel_max ? elements.pid_accel_max.value : 0.54) || 0.54;
        const decelG = parseFloat(elements.pid_decel_max ? elements.pid_decel_max.value : 0.50) || 0.50;
        
        const kpCalculated = 1.0 / (accelG * 9.81);
        const kiCalculated = 0.02;
        const kdCalculated = 0.05 / decelG;
        
        if (elements.pid_kp) elements.pid_kp.value = kpCalculated.toFixed(3);
        if (elements.pid_ki) elements.pid_ki.value = kiCalculated.toFixed(3);
        if (elements.pid_kd) elements.pid_kd.value = kdCalculated.toFixed(3);
    });
}

if (elements.btnSave) {
    elements.btnSave.addEventListener('click', async () => {
        const newSettings = Object.assign({}, currentSettings, {
            odometer_source: elements.odometer_source ? elements.odometer_source.value : 'sensor1',
            wheel_perimeter_m: elements.wheel_perimeter_m ? parseFloat(elements.wheel_perimeter_m.value) : 1.950,
            neutral_interval_s: elements.neutral_interval_s ? parseFloat(elements.neutral_interval_s.value) : 0.10,
            pid_weight: elements.pid_weight ? parseFloat(elements.pid_weight.value) : 1000,
            pid_power: elements.pid_power ? parseFloat(elements.pid_power.value) : 100,
            pid_accel_max: elements.pid_accel_max ? parseFloat(elements.pid_accel_max.value) : 0.54,
            pid_decel_max: elements.pid_decel_max ? parseFloat(elements.pid_decel_max.value) : 0.50,
            pid_kp: elements.pid_kp ? parseFloat(elements.pid_kp.value) : 0.188,
            pid_ki: elements.pid_ki ? parseFloat(elements.pid_ki.value) : 0.020,
            pid_kd: elements.pid_kd ? parseFloat(elements.pid_kd.value) : 0.050,
            theme: elements.theme ? elements.theme.value : 'dark',
            font_size_offset: elements.font_size_offset ? parseInt(elements.font_size_offset.value) : 0
        });

        if (elements.driving_sound_aids) {
            localStorage.setItem('lebrel_pilot_sound_aids', elements.driving_sound_aids.value);
        }

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
            if (res.ok) {
                currentSettings = newSettings;
                if (elements.saveMsg) {
                    elements.saveMsg.style.display = 'block';
                    setTimeout(() => { elements.saveMsg.style.display = 'none'; }, 2000);
                }
            }
        } catch (err) {
            console.error('Error saving settings:', err);
        }
    });
}

loadSettings();
