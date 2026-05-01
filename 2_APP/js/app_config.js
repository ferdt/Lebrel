import { initRouter } from './router.js';
import { initHeader } from './header.js';

initRouter();
initHeader('config');

const elements = {
    odometer_source: document.getElementById('odometer_source'),
    driving_sound_aids: document.getElementById('driving_sound_aids'),
    wheel_perimeter_m: document.getElementById('wheel_perimeter_m'),
    neutral_interval_s: document.getElementById('neutral_interval_s'),
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

if (elements.btnSave) {
    elements.btnSave.addEventListener('click', async () => {
        const newSettings = Object.assign({}, currentSettings, {
            odometer_source: elements.odometer_source ? elements.odometer_source.value : 'sensor1',
            wheel_perimeter_m: elements.wheel_perimeter_m ? parseFloat(elements.wheel_perimeter_m.value) : 1.950,
            neutral_interval_s: elements.neutral_interval_s ? parseFloat(elements.neutral_interval_s.value) : 0.10,
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
