export async function initWakeLock() {
    let wakeLock = null;

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock activo: la pantalla no se apagará');
            } catch (err) {
                console.warn(`Error Wake Lock: ${err.name}, ${err.message}`);
            }
        } else {
            console.warn('Wake Lock API no soportada en este navegador');
        }
    };

    // Solicitar inicial
    await requestWakeLock();

    // Re-solicitar si la app vuelve de segundo plano
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });
}
