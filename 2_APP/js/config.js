document.addEventListener('DOMContentLoaded', async () => {
    const btnSave = document.getElementById('btn-save');
    const msg = document.getElementById('save-msg');

    const inputOdo = document.getElementById('odometer_source');
    const inputWheel = document.getElementById('wheel_perimeter_m');
    const inputNeutral = document.getElementById('neutral_interval_s');
    const inputTheme = document.getElementById('theme');
    const inputFont = document.getElementById('font_size_offset');
    const valHora = document.getElementById('val_hora');

    setInterval(() => {
        if(valHora) {
            const now = new Date();
            valHora.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
    }, 1000);

    const API_URL = window.location.origin + '/api/settings';

    // Cargar config
    try {
        const res = await fetch(API_URL);
        if (res.ok) {
            const data = await res.json();
            if(inputOdo) inputOdo.value = data.odometer_source || 'test';
            if(inputWheel) inputWheel.value = data.wheel_perimeter_m || 1.95;
            if(inputNeutral) inputNeutral.value = data.neutral_interval_s || 0.1;
            if(inputTheme) inputTheme.value = data.theme || 'dark';
            if(inputFont) inputFont.value = data.font_size_offset || 0;
        }
    } catch (e) {
        console.error("No se pudo cargar la configuración:", e);
    }

    // Guardar config
    btnSave.addEventListener('click', async () => {
        const payload = {
            odometer_source: inputOdo ? inputOdo.value : 'test',
            wheel_perimeter_m: inputWheel ? parseFloat(inputWheel.value) : 1.95,
            neutral_interval_s: inputNeutral ? parseFloat(inputNeutral.value) : 0.1,
            theme: inputTheme ? inputTheme.value : 'dark',
            font_size_offset: inputFont ? parseInt(inputFont.value, 10) : 0
        };

        try {
            console.log("Enviando ajustes a:", API_URL, payload);
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);
            } else {
                const errorData = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorData}`);
            }
        } catch (e) {
            console.error("Error detallado al guardar:", e);
            alert("Error al guardar: " + e.message + "\n\nEste error suele ocurrir si el servidor no está respondiendo o si hay un problema con la red.");
        }
    });
});
