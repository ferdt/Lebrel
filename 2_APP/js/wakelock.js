export async function initWakeLock() {
    let wakeLock = null;
    let fallbackVideo = null;
    let fallbackAudio = null;
    let isActive = false;

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

    const setupUI = () => {
        let indicator = document.getElementById('wakelock-status');
        if (!indicator) {
            const header = document.querySelector('.header-right');
            if (header) {
                indicator = document.createElement('button');
                indicator.id = 'wakelock-status';
                indicator.style.cssText = 'background:none; border:none; padding:0; margin-right:10px; font-size:0.75rem; font-weight:bold; cursor:pointer; color:var(--accent-red); transition:all 0.3s; outline:none;';
                indicator.innerHTML = '🔓 OFF';
                indicator.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!(await requestWakeLock())) {
                        startFallbacks();
                        playEverything();
                    }
                });
                header.prepend(indicator);
            }
        }
        if (indicator && isActive) updateStatusUI(true);
    };

    setupUI();
    setTimeout(setupUI, 500); 
    setTimeout(setupUI, 2000); 

    // Ejecución inicial
    if (!(await requestWakeLock())) {
        startFallbacks();
    }

    // Gestión de visibilidad
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            if (!(await requestWakeLock())) {
                playEverything();
            }
        }
    });

    // Interacciones globales
    ['click', 'touchstart'].forEach(ev => {
        document.addEventListener(ev, () => {
            if (!isActive) {
                playEverything();
            }
        }, { once: false });
    });

    // Refresco periódico
    setInterval(async () => {
        if (!isActive && document.visibilityState === 'visible') {
            if (!(await requestWakeLock())) {
                playEverything();
            }
        }
    }, 15000);
}
