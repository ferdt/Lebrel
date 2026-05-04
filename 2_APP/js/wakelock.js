let isInitialized = false;
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

export async function initWakeLock() {
    if (isInitialized) {
        // Si ya se inicializó, solo forzamos el repintado de la UI correcta
        updateStatusUI(isActive);
        return;
    }
    isInitialized = true;

    const playEverything = () => {
        if (userDisabled) return;
        
        // Actualizamos la interfaz INMEDIATAMENTE para dar feedback visual al usuario.
        updateStatusUI(true);
        
        if (fallbackVideo) {
            fallbackVideo.play().catch(err => {
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
        fallbackVideo.setAttribute('autoplay', '');
        
        // HACK: Para evitar que Android 13 / Chrome pause el video por estar fuera de pantalla 
        // o ser invisible (IntersectionObserver throttling), debe estar en medio del viewport,
        // tener tamaño real y una opacidad mínima, pero con pointer-events: none.
        fallbackVideo.style.cssText = 'position:fixed; top:50%; left:50%; width:100px; height:100px; z-index:-9999; pointer-events:none; opacity:0.001; transform:translate(-50%, -50%);';
        fallbackVideo.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAG21kYXQAAAGUAbHByaW50ZWYgIkhlbGxvIgD6AAAZYm1vb3YAAABsbXZoZAAAAADbe67723uu+wAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIVdHJhawAAAFx0a2hkAAAAAdt7rvvbe677AAAAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAGWbWRpYQAAACBtZGhkAAAAAdt7rvvbe677AAAQAAAAEABEAAAAAAAAAABoZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAEHZtZGhkAAAAAAABAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMYm94dAAAAAEAAAFEbXN0YmwAAABidmNlYwAAAABCYXZjMSAAAAAAABAAZABkAAAAGGF2Y0MBZABk/v8AAAAAABAAAABkAAAAAgAAAAIAAAACAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAA';
        document.body.appendChild(fallbackVideo);

        fallbackAudio = document.createElement('audio');
        fallbackAudio.setAttribute('loop', '');
        fallbackAudio.setAttribute('autoplay', '');
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
