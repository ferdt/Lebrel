document.addEventListener('DOMContentLoaded', async () => {
    const btnSave = document.getElementById('btn-save');
    const msg = document.getElementById('save-msg');

    const inputWheel = document.getElementById('wheel_perimeter_m');
    const inputTheme = document.getElementById('theme');
    const inputFont = document.getElementById('font_size_offset');
    const valHora = document.getElementById('val_hora');

    setInterval(() => {
        if(valHora) {
            const now = new Date();
            valHora.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
    }, 1000);

    // Cambiar por la IP real en producción
    const API_URL = 'http://localhost:8000/api/settings';

    // Cargar config
    try {
        const res = await fetch(API_URL);
        if (res.ok) {
            const data = await res.json();
            inputWheel.value = data.wheel_perimeter_m || 1.95;
            inputTheme.value = data.theme || 'dark';
            inputFont.value = data.font_size_offset || 0;
        }
    } catch (e) {
        console.error("No se pudo cargar la configuración:", e);
    }

    // Guardar config
    btnSave.addEventListener('click', async () => {
        const payload = {
            wheel_perimeter_m: parseFloat(inputWheel.value),
            theme: inputTheme.value,
            font_size_offset: parseInt(inputFont.value, 10)
        };

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);
            }
        } catch (e) {
            console.error("Error al guardar:", e);
            alert("Error de conexión al guardar los ajustes");
        }
    });
});
