export async function initWakeLock() {
    let wakeLock = null;
    let fallbackVideo = null;
    let fallbackAudio = null;
    let isActive = false;

    let userDisabled = false;

    const updateStatusUI = (active) => {
        isActive = active;
        const indicator = document.getElementById('wakelock-status');
        if (indicator) {
            indicator.style.color = active ? 'var(--accent-green)' : 'var(--accent-red)';
            indicator.title = active ? 'Pantalla Siempre Activa' : 'Presiona para activar No-Sleep';
            indicator.innerHTML = active ? '🔒 ON' : '🔓 OFF';
            if (active) {
                indicator.style.textShadow = '0 0 10px var(--accent-green)';
            } else {
                indicator.style.textShadow = 'none';
            }
        }
    };

    const requestWakeLock = async () => {
        if (userDisabled) return false;
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('✅ Wake Lock API activo');
                updateStatusUI(true);
                wakeLock.addEventListener('release', () => {
                    console.warn('⚠️ Wake Lock API liberado');
                    wakeLock = null;
                    if (!fallbackVideo || fallbackVideo.paused) {
                        updateStatusUI(false);
                    }
                });
                return true;
            } catch (err) {
                console.warn(`❌ Error Wake Lock API: ${err.message}`);
            }
        }
        return false;
    };

    const playEverything = () => {
        if (userDisabled) return;
        if (fallbackVideo) {
            fallbackVideo.play().then(() => {
                updateStatusUI(true);
            }).catch(err => {
                console.error("Error al reproducir video fallback:", err);
            });
        }
        if (fallbackAudio) {
            fallbackAudio.play().catch(() => {});
        }
    };

    const startFallbacks = () => {
        if (fallbackVideo) return;
        
        console.log('🔄 Iniciando fallbacks NoSleep (Video + Audio)...');
        
        fallbackVideo = document.createElement('video');
        fallbackVideo.setAttribute('loop', '');
        fallbackVideo.setAttribute('playsinline', '');
        fallbackVideo.setAttribute('muted', '');
        fallbackVideo.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0.01; z-index:-1; pointer-events:none;';
        fallbackVideo.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAG21kYXQAAAGUAbHByaW50ZWYgIkhlbGxvIgD6AAAZYm1vb3YAAABsbXZoZAAAAADbe67723uu+wAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIVdHJhawAAAFx0a2hkAAAAAdt7rvvbe677AAAAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAGWbWRpYQAAACBtZGhkAAAAAdt7rvvbe677AAAQAAAAEABEAAAAAAAAAABoZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAEHZtZGhkAAAAAAABAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMYm94dAAAAAEAAAFEbXN0YmwAAABidmNlYwAAAABCYXZjMSAAAAAAABAAZABkAAAAGGF2Y0MBZABk/v8AAAAAABAAAABkAAAAAgAAAAIAAAACAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAA';
        document.body.appendChild(fallbackVideo);

        fallbackAudio = document.createElement('audio');
        fallbackAudio.setAttribute('loop', '');
        fallbackAudio.style.display = 'none';
        fallbackAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        document.body.appendChild(fallbackAudio);
        
        playEverything();
    };

    // Usar delegación de eventos para sobrevivir a la navegación SPA
    document.addEventListener('click', (e) => {
        const indicator = e.target.closest('#wakelock-status');
        if (indicator) {
            e.stopPropagation();
            if (isActive) {
                // Apagar manualmente
                userDisabled = true;
                if (wakeLock) {
                    wakeLock.release().catch(() => {});
                    wakeLock = null;
                }
                if (fallbackVideo) fallbackVideo.pause();
                if (fallbackAudio) fallbackAudio.pause();
                updateStatusUI(false);
            } else {
                // Encender manualmente
                userDisabled = false;
                
                // IMPORTANTE: En móviles (Samsung, Chrome), play() debe llamarse 
                // SIN NINGÚN await previo para no perder el token de "gesto de usuario".
                startFallbacks();
                playEverything();
                
                // Intentar la API moderna en segundo plano
                requestWakeLock().catch(() => {});
            }
        }
    });

    const checkUI = () => {
        if (isActive) updateStatusUI(true);
    };

    checkUI();
    setTimeout(checkUI, 500); 
    setTimeout(checkUI, 2000);

    // Ejecución inicial
    if (!(await requestWakeLock())) {
        startFallbacks();
    }

    // Refrescar UI cuando la aplicación navega (porque se recarga el header)
    window.addEventListener('spa-navigated', () => {
        updateStatusUI(isActive);
    });

    // Gestión de visibilidad
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && !userDisabled) {
            if (!(await requestWakeLock())) {
                playEverything();
            }
        }
    });

    // Interacciones globales
    ['click', 'touchstart'].forEach(ev => {
        document.addEventListener(ev, (e) => {
            if (userDisabled) return;
            if (e.target.closest('#wakelock-status')) return; // No procesar si fue el botón
            if (!isActive) {
                requestWakeLock().then(success => {
                    if (!success) playEverything();
                });
            }
        }, { once: false });
    });

    // Refresco periódico
    setInterval(async () => {
        if (!isActive && document.visibilityState === 'visible' && !userDisabled) {
            if (!(await requestWakeLock())) {
                playEverything();
            }
        }
    }, 15000);
}
