import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';

// ============================================================
// Data model:
//   tramos = [{ id, nombre, hora_inicio, segmentos: [...] }]
//   segmento = { inicio_m, fin_m, media_kmh }
// ============================================================

let tramos = [];
let selectedId = null;
let activeTramoId = null; // El tramo actualmente lanzado para cálculos

// ---- Time helpers ----

/**
 * Parses "HH:MM:SS.d" -> total seconds (float).
 * Returns null if invalid.
 */
function parseTime(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d))?$/);
    if (!m) return null;
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + (m[4] ? parseInt(m[4]) * 0.1 : 0);
}

/**
 * Formats total seconds -> "HH:MM:SS.d"
 */
function formatTime(secs) {
    if (secs == null || isNaN(secs)) return '--:--:--.--';
    const h  = Math.floor(secs / 3600);
    const m  = Math.floor((secs % 3600) / 60);
    const s  = Math.floor(secs % 60);
    const d  = Math.floor((secs % 1) * 10);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

/**
 * Calculates hora_inicio / hora_fin for each segment given the tramo start time.
 * hora_inicio of segment[i+1] = hora_fin of segment[i].
 * Time to travel a segment = (distance_km / media_kmh) * 3600 seconds.
 */
function calcHoras(segmentos, horaInicioStr) {
    const horaBase = parseTime(horaInicioStr);
    if (horaBase == null) return segmentos.map(() => ({ hora_inicio: null, hora_fin: null }));

    let cursor = horaBase;
    return segmentos.map(seg => {
        const distKm = (seg.fin_m - seg.inicio_m) / 1000;
        const durSecs = (distKm / seg.media_kmh) * 3600;
        const h_ini = cursor;
        cursor += durSecs;
        return { hora_inicio: h_ini, hora_fin: cursor };
    });
}

// ---- Unique id ----
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---- Selected tramo accessor ----
function getSelected() {
    return tramos.find(t => t.id === selectedId) ?? null;
}

// ---- DOM refs ----
const tramosList      = document.getElementById('tramos-list');
const tramosEmpty     = document.getElementById('tramos-empty');
const headerNombre    = document.getElementById('header-tramo-nombre');
const placeholderEl   = document.getElementById('placeholder-noselect');
const segContent      = document.getElementById('seg-content');
const segTbody        = document.getElementById('seg-tbody');
const segEmpty        = document.getElementById('seg-empty');
const segCount        = document.getElementById('seg-count');
const segInicio       = document.getElementById('seg-inicio');
const segFin          = document.getElementById('seg-fin');
const segMedia        = document.getElementById('seg-media');
const btnAddSeg       = document.getElementById('btn-add-seg');
const btnSave         = document.getElementById('btn-save');
const btnLaunch       = document.getElementById('btn-launch');
const btnClearSegs    = document.getElementById('btn-clear-segs');
const saveStatus      = document.getElementById('save-status');
const modalOverlay    = document.getElementById('modal-nuevo-tramo');
const modalNombre     = document.getElementById('modal-nombre');
const modalHora       = document.getElementById('modal-hora');
const modalCancel     = document.getElementById('modal-cancel');
const modalOk         = document.getElementById('modal-ok');
const btnNuevoTramo   = document.getElementById('btn-nuevo-tramo');

// ---- Status messages ----
function showStatus(msg, type = 'ok') {
    saveStatus.textContent = msg;
    saveStatus.className = `save-msg ${type}`;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { saveStatus.className = 'save-msg'; }, 3500);
}

// ---- Render tramos list ----
function renderTramosList() {
    // Clear dynamic items (keep empty placeholder)
    [...tramosList.querySelectorAll('.tramo-item')].forEach(el => el.remove());

    tramosEmpty.style.display = tramos.length === 0 ? 'block' : 'none';

    tramos.forEach(tramo => {
        const isActive = tramo.id === activeTramoId;
        const div = document.createElement('div');
        div.className = 'tramo-item'
            + (tramo.id === selectedId ? ' selected' : '')
            + (isActive ? ' active-tramo' : '');
        div.dataset.id = tramo.id;
        div.innerHTML = `
            <div class="tramo-item-info">
                <div class="tramo-item-name">${escHtml(tramo.nombre)}${isActive ? '<span class="active-badge">EN CURSO</span>' : ''}</div>
                <div class="tramo-item-time">⏱ ${tramo.hora_inicio || '--:--:--.--'} &nbsp;·&nbsp; ${tramo.segmentos.length} seg.</div>
            </div>
            <button class="btn-delete-tramo" data-id="${tramo.id}" title="Eliminar">✕</button>
        `;
        tramosList.appendChild(div);
    });
}

// ---- Render segmentos table ----
function renderSegmentos() {
    const tramo = getSelected();

    if (!tramo) {
        placeholderEl.style.display = 'flex';
        segContent.style.display    = 'none';
        headerNombre.textContent    = 'Editor de Tramos';
        return;
    }

    placeholderEl.style.display = 'none';
    segContent.style.display    = 'flex';
    headerNombre.textContent    = tramo.nombre;

    // Botón lanzar: indica visualmente si este tramo ya está activo
    if (btnLaunch) {
        const isActive = tramo.id === activeTramoId;
        btnLaunch.classList.toggle('active-tramo', isActive);
        btnLaunch.textContent = isActive ? '✅ En curso' : '▶ Lanzar Tramo';
    }

    const segs = tramo.segmentos;
    const horas = calcHoras(segs, tramo.hora_inicio);

    segEmpty.style.display  = segs.length === 0 ? 'block' : 'none';
    segCount.textContent    = `${segs.length} seg.`;

    segTbody.innerHTML = '';
    segs.forEach((seg, i) => {
        const distKm = ((seg.fin_m - seg.inicio_m) / 1000).toFixed(3);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="seg-num">${i + 1}</td>
            <td>${(seg.inicio_m / 1000).toFixed(3)}</td>
            <td>${(seg.fin_m   / 1000).toFixed(3)}</td>
            <td><span class="media-badge">${seg.media_kmh.toFixed(1)}</span></td>
            <td class="hora-cell">${formatTime(horas[i].hora_inicio)}</td>
            <td class="hora-cell">${formatTime(horas[i].hora_fin)}</td>
            <td><button class="btn-del-seg" data-idx="${i}" title="Eliminar">✕</button></td>
        `;
        segTbody.appendChild(tr);
    });

    // Auto-fill inicio for next segment
    if (segs.length > 0) {
        segInicio.value = (segs[segs.length - 1].fin_m / 1000).toFixed(3);
    }
}

// ---- Escape html ----
function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- Select tramo ----
function selectTramo(id) {
    selectedId = id;
    renderTramosList();
    renderSegmentos();
}

// ---- Tramos list click delegation ----
tramosList.addEventListener('click', e => {
    const delBtn = e.target.closest('.btn-delete-tramo');
    if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.id;
        const t  = tramos.find(x => x.id === id);
        if (!confirm(`¿Eliminar el tramo "${t?.nombre}"?\nSe eliminarán todos sus segmentos.`)) return;
        tramos = tramos.filter(x => x.id !== id);
        if (selectedId === id) selectedId = tramos[0]?.id ?? null;
        renderTramosList();
        renderSegmentos();
        return;
    }
    const item = e.target.closest('.tramo-item');
    if (item) selectTramo(item.dataset.id);
});

// ---- Segments table delete delegation ----
segTbody.addEventListener('click', e => {
    const btn = e.target.closest('.btn-del-seg');
    if (!btn) return;
    const tramo = getSelected();
    if (!tramo) return;
    const idx = parseInt(btn.dataset.idx, 10);
    tramo.segmentos.splice(idx, 1);
    renderSegmentos();
});

// ---- Add segment ----
function getSegInputValues() {
    const inicioKm = parseFloat(segInicio.value);
    const finKm    = parseFloat(segFin.value);
    const media    = parseFloat(segMedia.value);

    if (isNaN(inicioKm) || isNaN(finKm) || isNaN(media)) { showStatus('Rellena todos los campos del segmento', 'err'); return null; }
    if (finKm <= inicioKm)                                 { showStatus('El fin debe ser mayor que el inicio', 'err'); return null; }
    if (media <= 0 || media > 250)                         { showStatus('Media fuera de rango (1–250 km/h)', 'err'); return null; }
    return { inicio_m: Math.round(inicioKm * 1000), fin_m: Math.round(finKm * 1000), media_kmh: media };
}

btnAddSeg.addEventListener('click', () => {
    const tramo = getSelected();
    if (!tramo) return;
    const seg = getSegInputValues();
    if (!seg) return;

    const solapado = tramo.segmentos.some(ex => seg.inicio_m < ex.fin_m && seg.fin_m > ex.inicio_m);
    if (solapado) { showStatus('El segmento se solapa con uno existente', 'err'); return; }

    tramo.segmentos.push(seg);
    tramo.segmentos.sort((a, b) => a.inicio_m - b.inicio_m);
    segFin.value   = '';
    segMedia.value = '';
    segFin.focus();
    renderSegmentos();
});

[segInicio, segFin, segMedia].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') btnAddSeg.click(); }));

// ---- Clear segments ----
btnClearSegs.addEventListener('click', () => {
    const tramo = getSelected();
    if (!tramo || tramo.segmentos.length === 0) return;
    if (!confirm('¿Eliminar todos los segmentos de este tramo?')) return;
    tramo.segmentos = [];
    segInicio.value = '';
    renderSegmentos();
});

// ---- Launch tramo ----
if (btnLaunch) {
    btnLaunch.addEventListener('click', async () => {
        const tramo = getSelected();
        if (!tramo) return;
        if (tramo.segmentos.length === 0) {
            showStatus('El tramo no tiene segmentos definidos', 'err');
            return;
        }
        try {
            const host = window.location.host || 'localhost:8000';
            const res  = await fetch(`http://${host}/api/tramos/active`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id: tramo.id })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            activeTramoId = tramo.id;
            showStatus(`▶ "${tramo.nombre}" lanzado`, 'ok');
            renderTramosList();
            renderSegmentos();
        } catch (err) {
            showStatus('Error al lanzar: ' + err.message, 'err');
        }
    });
}

// ---- Save to backend ----
btnSave.addEventListener('click', async () => {
    if (tramos.length === 0) { showStatus('No hay tramos que guardar', 'err'); return; }
    try {
        const host = window.location.host || 'localhost:8000';
        const res  = await fetch(`http://${host}/api/tramos`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(tramos)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showStatus('✓ Guardado correctamente', 'ok');
    } catch (err) {
        showStatus('Error al guardar: ' + err.message, 'err');
    }
});

// ---- Modal: nuevo tramo ----
btnNuevoTramo.addEventListener('click', () => {
    modalNombre.value = '';
    // Pre-fill with current time
    const now = new Date();
    modalHora.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.0`;
    modalOverlay.classList.add('open');
    setTimeout(() => modalNombre.focus(), 50);
});

modalCancel.addEventListener('click', () => modalOverlay.classList.remove('open'));

modalOk.addEventListener('click', () => {
    const nombre = modalNombre.value.trim();
    const hora   = modalHora.value.trim();
    if (!nombre) { modalNombre.focus(); return; }
    if (hora && parseTime(hora) === null) { showStatus('Formato de hora inválido (HH:MM:SS.d)', 'err'); return; }
    const t = { id: uid(), nombre, hora_inicio: hora || '', segmentos: [] };
    tramos.push(t);
    modalOverlay.classList.remove('open');
    selectTramo(t.id);
    renderTramosList();
    // Clear seg inputs for fresh tramo
    segInicio.value = '0.000';
    segFin.value    = '';
    segMedia.value  = '';
});

modalNombre.addEventListener('keydown', e => { if (e.key === 'Enter') { modalHora.focus(); } });
modalHora.addEventListener('keydown',   e => { if (e.key === 'Enter') modalOk.click(); });
modalOverlay.addEventListener('click',  e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

// ---- Load from backend ----
async function loadTramos() {
    try {
        const host = window.location.host || 'localhost:8000';
        const res  = await fetch(`http://${host}/api/tramos`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            tramos = data;
            selectedId = tramos[0].id;
        }
    } catch (_) { /* sin backend = silencioso */ }

    // Cargar tramo activo
    try {
        const host = window.location.host || 'localhost:8000';
        const res  = await fetch(`http://${host}/api/tramos/active`);
        if (res.ok) {
            const data = await res.json();
            activeTramoId = data.id ?? null;
        }
    } catch (_) {}

    renderTramosList();
    renderSegmentos();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initFullscreen();
    initWakeLock();
    loadTramos();
});

window.addEventListener('spa-navigated', () => {
    initFullscreen();
    renderTramosList();
    renderSegmentos();
});
