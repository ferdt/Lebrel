import { TelemetryClient } from './telemetry.js';
import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';
import { initHeader } from './header.js';

console.log('App Piloto: Inicializando');
try {
    initRouter();
    initHeader('piloto');
    initFullscreen();
    initWakeLock();
    initRotation();
} catch (e) {
    console.error('Error durante la inicialización:', e);
}

const statusIndicator = document.getElementById('status-indicator');

const ui = {
    tramo_nombre: document.getElementById('val_tramo_nombre'),
    hora: document.getElementById('val_hora'),
    diferencia_ideal: document.getElementById('val_diferencia_ideal'),
    distancia: document.getElementById('val_distancia'),
    velocidad_actual: document.getElementById('val_velocidad_actual'),
    velocidad_objetivo: document.getElementById('val_velocidad_objetivo'),
    proxima_media: document.getElementById('val_proxima_media'),
    distancia_cambio: document.getElementById('val_distancia_cambio'),
    instruccion: document.getElementById('val_instruccion'),
    odo_parcial: document.getElementById('val_odo_parcial'),
    media_reset: document.getElementById('val_media_reset'),
    btn_reset_parcial: document.getElementById('btn-reset-parcial')
};

// --- Ayudas sonoras ---
const btnSoundAids = document.getElementById('btn-sound-aids');
const valSoundAids = document.getElementById('val-sound-aids');
let soundAidsEnabled = localStorage.getItem('lebrel_pilot_sound_aids') !== 'false';

function updateSoundAidsUI() {
    if (valSoundAids) {
        valSoundAids.textContent = soundAidsEnabled ? 'ON' : 'OFF';
    }
    if (btnSoundAids) {
        if (soundAidsEnabled) {
            btnSoundAids.style.background = 'rgba(59, 130, 246, 0.2)';
            btnSoundAids.style.borderColor = 'var(--accent-blue)';
            btnSoundAids.style.color = 'var(--accent-blue)';
        } else {
            btnSoundAids.style.background = 'rgba(255, 255, 255, 0.05)';
            btnSoundAids.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            btnSoundAids.style.color = 'var(--text-secondary)';
        }
    }
}

updateSoundAidsUI();

let audioCtx = null;

if (btnSoundAids) {
    btnSoundAids.addEventListener('click', () => {
        soundAidsEnabled = !soundAidsEnabled;
        localStorage.setItem('lebrel_pilot_sound_aids', soundAidsEnabled);
        updateSoundAidsUI();
        
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        // Reproducir pequeño tono de prueba
        playBeep(1000, 0.1);
    });
}
let lastSoundTime = 0;

function playBeep(freq = 1000, duration = 0.1) {
    if (localStorage.getItem('lebrel_mute_sounds') === 'true') return;
    if (!soundAidsEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error('Error playing sound aid:', e);
    }
}

// Estado para el Odómetro Parcial y Media Reset
let partialBaseDistM = 0;
let partialBaseTime = 0;
let currentDistM = 0;
let currentWallTimeS = 0;

// Recuperar estado previo de localStorage si existe
const savedBaseDist = localStorage.getItem('lebrel_partial_base_dist');
const savedBaseTime = localStorage.getItem('lebrel_partial_base_time');
if (savedBaseDist !== null) partialBaseDistM = parseFloat(savedBaseDist);
if (savedBaseTime !== null) partialBaseTime = parseFloat(savedBaseTime);

if (ui.btn_reset_parcial) {
    ui.btn_reset_parcial.addEventListener('click', () => {
        partialBaseDistM = currentDistM;
        partialBaseTime = currentWallTimeS;
        localStorage.setItem('lebrel_partial_base_dist', partialBaseDistM);
        localStorage.setItem('lebrel_partial_base_time', partialBaseTime);
        updatePartialUI();
    });
}

function updatePartialUI() {
    const partialDistM = currentDistM - partialBaseDistM;
    const partialTime = currentWallTimeS - partialBaseTime;
    
    if (ui.odo_parcial) {
        ui.odo_parcial.textContent = (partialDistM / 1000).toFixed(3);
    }
    
    if (ui.media_reset) {
        if (partialTime > 2 && partialDistM > 0) {
            const media = (partialDistM / 1000) / (partialTime / 3600);
            ui.media_reset.textContent = media.toFixed(1);
        } else {
            ui.media_reset.textContent = "0.0";
        }
    }
}

const wsHost = window.location.host || 'localhost:8000';

let pidSettings = { kp: 0.5, ki: 0.05, kd: 0.1 };
async function loadPIDSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const settings = await res.json();
            pidSettings.kp = settings.pid_kp !== undefined ? parseFloat(settings.pid_kp) : 0.500;
            pidSettings.ki = settings.pid_ki !== undefined ? parseFloat(settings.pid_ki) : 0.050;
            pidSettings.kd = settings.pid_kd !== undefined ? parseFloat(settings.pid_kd) : 0.100;
        }
    } catch (e) {
        console.error('Error loading PID settings:', e);
    }
}
loadPIDSettings();

let prevError = 0;
let errorIntegral = 0;
let lastTime = 0;

function computePID(diff, targetSpeedKmh) {
    const targetSpeedMps = (targetSpeedKmh || 50) / 3.6;
    const error = diff * targetSpeedMps;
    const now = Date.now();
    const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000;
    lastTime = now;

    if (dt > 0) {
        const derivative = (error - prevError) / dt;
        
        // Clamping anti-windup:
        let trialOutput = pidSettings.kp * error + pidSettings.ki * errorIntegral + pidSettings.kd * derivative;
        const isSaturated = trialOutput >= 1 || trialOutput <= -1;
        const sameSign = Math.sign(trialOutput) === Math.sign(error);
        
        if (!isSaturated || !sameSign) {
            errorIntegral += error * dt;
        }
        
        errorIntegral = Math.max(-2, Math.min(2, errorIntegral));
        prevError = error;

        let output = pidSettings.kp * error + pidSettings.ki * errorIntegral + pidSettings.kd * derivative;
        output = Math.max(-1, Math.min(1, output));
        return output;
    }
    prevError = error;
    return 0;
}
const client = new TelemetryClient(`ws://${wsHost}/ws/telemetry`);

client.onStatusChange((isConnected) => {
    if (statusIndicator) {
        if (isConnected) {
            statusIndicator.className = 'status-dot connected';
            statusIndicator.title = 'Conectado';
        } else {
            statusIndicator.className = 'status-dot disconnected';
            statusIndicator.title = 'Desconectado';
        }
    }
});

client.onMessage((data) => {
    if (data.tramo_nombre !== undefined && ui.tramo_nombre) ui.tramo_nombre.textContent = data.tramo_nombre;
    
    if (data.wall_time_s !== undefined) {
        currentWallTimeS = data.wall_time_s;
    }

    if (data.distancia_m !== undefined) {
        currentDistM = data.distancia_m;
        if (ui.distancia) ui.distancia.textContent = (currentDistM / 1000).toFixed(3);
        updatePartialUI();
    }

    if (data.diferencia_ideal_s !== undefined && ui.diferencia_ideal) {
        const diff = data.diferencia_ideal_s;
        const threshold = 0.1; // Umbral para OK
        
        // 1. Actualizar cifra con centésimas en menor tamaño y weight
        const diffStr = (diff > 0 ? '+' : '') + diff.toFixed(2);
        const mainPart = diffStr.substring(0, diffStr.length - 1);
        const hundredthPart = diffStr.substring(diffStr.length - 1);
        ui.diferencia_ideal.innerHTML = `${mainPart}<span style="font-size: 0.6em; opacity: 0.7; font-weight: 300;">${hundredthPart}</span>`;
        ui.diferencia_ideal.className = 'value ' + (diff > threshold ? 'positive' : (diff < -threshold ? 'negative' : ''));
        
        // Actualizar barra horizontal PID
        const pidOutput = computePID(diff, data.velocidad_objetivo_kmh || 50);
        const barLeft = document.getElementById('pid-bar-left');
        const barRight = document.getElementById('pid-bar-right');
        if (barLeft && barRight) {
            if (pidOutput > 0) {
                // Acelerar (verde hacia la derecha)
                barRight.style.width = (pidOutput * 50) + '%';
                barLeft.style.width = '0%';
            } else {
                // Frenar (rojo hacia la izquierda)
                barLeft.style.width = (Math.abs(pidOutput) * 50) + '%';
                barRight.style.width = '0%';
            }
        }
        
        // 2. Actualizar Instrucción Gigante
        if (ui.instruccion) {
            if (diff > threshold) {
                ui.instruccion.textContent = 'ACELERA';
                ui.instruccion.style.color = 'var(--accent-green)';
            } else if (diff < -threshold) {
                ui.instruccion.textContent = 'FRENA';
                ui.instruccion.style.color = 'var(--accent-red)';
            } else {
                ui.instruccion.textContent = 'OK';
                ui.instruccion.style.color = 'var(--text-secondary)';
            }
        }

        // 3. Ayudas sonoras (cada 1.5s)
        const nowTime = Date.now();
        if (nowTime - lastSoundTime > 1500) {
            if (diff > threshold) {
                playBeep(1200, 0.1); // Acelera beep
                lastSoundTime = nowTime;
            } else if (diff < -threshold) {
                playBeep(800, 0.1); // Frena beep
                lastSoundTime = nowTime;
            }
        }
    }
    
    if (data.velocidad_kmh !== undefined && ui.velocidad_actual) {
        ui.velocidad_actual.textContent = data.velocidad_kmh.toFixed(1);
    }

    if (data.velocidad_objetivo_kmh !== undefined && ui.velocidad_objetivo) {
        ui.velocidad_objetivo.textContent = data.velocidad_objetivo_kmh.toFixed(1);
    }
    
    if (data.system_time && ui.hora) ui.hora.textContent = data.system_time;
    
    if (data.proxima_media_kmh !== undefined && ui.proxima_media) {
        ui.proxima_media.textContent = data.proxima_media_kmh.toFixed(1);
    }
    
    if (data.distancia_cambio_m !== undefined && ui.distancia_cambio) {
        ui.distancia_cambio.textContent = (data.distancia_cambio_m / 1000).toFixed(3) + ' km';
    }
});

client.connect();
