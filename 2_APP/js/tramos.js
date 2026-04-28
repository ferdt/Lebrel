import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';

// ============================================================
// Data model:
//   tramos = [{ id, nombre, hora_inicio, segmentos: [...] }]
//   segmento = { inicio_m, fin_m, media_kmh }
// ============================================================

let tramos       = [];
let selectedId   = null;
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
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const d = Math.floor((secs % 1) * 10);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

/**
 * Parses a duration string "MM:SS.d", "HH:MM:SS.d" or plain seconds -> total seconds.
 * Returns null if invalid.
 */
function parseDuration(str) {
    if (!str) return null;
    str = str.trim();
    // HH:MM:SS.d
    let m = str.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d))?$/);
    if (m) return parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]) + (m[4] ? parseInt(m[4])*0.1 : 0);
    // MM:SS.d
    m = str.match(/^(\d{1,2}):(\d{2})(?:[.,](\d))?$/);
    if (m) return parseInt(m[1])*60 + parseInt(m[2]) + (m[3] ? parseInt(m[3])*0.1 : 0);
    // plain seconds
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
}

/**
 * Formats seconds as MM:SS.d (or HH:MM:SS.d if >= 1 hour)
 */
function formatDuration(secs) {
    if (secs == null || isNaN(secs)) return '--:--.-';
    secs = Math.abs(secs);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const d = Math.floor((secs % 1) * 10);
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

/**
 * Recalculates times for all segments using stored media_kmh values.
 * Optionally overrides duration or hora_fin for the segment at `fromIdx`,
 * updating its media_kmh in the data model before cascading.
 * Pass fromIdx = -1 for a pure read-only recalc (no model mutation).
 * Returns array of { hora_inicio, hora_fin, dur_secs } for every segment.
 */
function recalcFrom(tramo, fromIdx, _unused, overrideDurSecs, overrideHoraFin) {
    const segs     = tramo.segmentos;
    const horaBase = parseTime(tramo.hora_inicio);
    let cursor     = horaBase ?? 0;

    return segs.map((seg, i) => {
        const distKm = (seg.fin_m - seg.inicio_m) / 1000;
        let durSecs;

        if (i === fromIdx && overrideHoraFin != null) {
            const hIni = cursor;
            durSecs = overrideHoraFin - hIni;
            if (durSecs > 0 && distKm > 0) seg.media_kmh = (distKm / durSecs) * 3600;
        } else if (i === fromIdx && overrideDurSecs != null) {
            durSecs = overrideDurSecs;
            if (durSecs > 0 && distKm > 0) seg.media_kmh = (distKm / durSecs) * 3600;
        } else {
            durSecs = distKm > 0 && seg.media_kmh > 0 ? (distKm / seg.media_kmh) * 3600 : 0;
        }

        const h_ini = cursor;
        cursor += durSecs;
        return { hora_inicio: h_ini, hora_fin: cursor, dur_secs: durSecs };
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
const tramosList    = document.getElementById('tramos-list');
const tramosEmpty   = document.getElementById('tramos-empty');
const headerNombre  = document.getElementById('header-tramo-nombre');
const placeholderEl = document.getElementById('placeholder-noselect');
const segContent    = document.getElementById('seg-content');
const segTbody      = document.getElementById('seg-tbody');
const segEmpty      = document.getElementById('seg-empty');
const segCount      = document.getElementById('seg-count');
const segInicio     = document.getElementById('seg-inicio');
const segFin        = document.getElementById('seg-fin');
const segMedia      = document.getElementById('seg-media');
const btnAddSeg     = document.getElementById('btn-add-seg');
const btnSave       = document.getElementById('btn-save');
const btnLaunch     = document.getElementById('btn-launch');
const btnClearSegs  = document.getElementById('btn-clear-segs');
const saveStatus    = document.getElementById('save-status');
const modalOverlay  = document.getElementById('modal-nuevo-tramo');
const modalNombre   = document.getElementById('modal-nombre');
const modalHora     = document.getElementById('modal-hora');
const modalCancel   = document.getElementById('modal-cancel');
const modalOk       = document.getElementById('modal-ok');
const btnNuevoTramo = document.getElementById('btn-nuevo-tramo');

// ---- Status messages ----
function showStatus(msg, type = 'ok') {
    saveStatus.textContent = msg;
    saveStatus.className   = `save-msg ${type}`;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { saveStatus.className = 'save-msg'; }, 3500);
}

// ---- Render tramos list ----
function renderTramosList() {
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

    if (btnLaunch) {
        const isActive = tramo.id === activeTramoId;
        btnLaunch.classList.toggle('active-tramo', isActive);
        btnLaunch.textContent = isActive ? '✅ En curso' : '▶ Lanzar Tramo';
    }

    const segs     = tramo.segmentos;
    const computed = recalcFrom(tramo, -1, [], null, null);

    segEmpty.style.display = segs.length === 0 ? 'block' : 'none';
    segCount.textContent   = `${segs.length} seg.`;
    segTbody.innerHTML     = '';

    segs.forEach((seg, i) => {
        const info = computed[i];
        const tr   = document.createElement('tr');
        tr.dataset.idx = i;

        // Factory: creates a contentEditable td
        const makeTd = (displayText, type) => {
            const td           = document.createElement('td');
            td.className       = 'td-editable hora-cell';
            td.textContent     = displayText;
            td.contentEditable = 'true';
            td.spellcheck      = false;
            td.dataset.type    = type;
            td.dataset.idx     = i;
            return td;
        };

        // Row number (read-only)
        const tdNum = document.createElement('td');
        tdNum.className   = 'seg-num';
        tdNum.textContent = i + 1;

        // Editable data cells
        const tdIni   = makeTd((seg.inicio_m / 1000).toFixed(3), 'ini');
        const tdFin   = makeTd((seg.fin_m    / 1000).toFixed(3), 'fin');
        const tdDur   = makeTd(formatDuration(info.dur_secs),     'dur');
        const tdHIni  = makeTd(formatTime(info.hora_inicio),      'h_ini');
        const tdHFin  = makeTd(formatTime(info.hora_fin),         'h_fin');

        // Media: badge in display mode, raw number while editing
        const tdMedia = makeTd('', 'media');
        tdMedia.innerHTML = `<span class="media-badge">${seg.media_kmh.toFixed(1)}</span>`;

        // Delete button (not editable)
        const tdDel  = document.createElement('td');
        const btnDel = document.createElement('button');
        btnDel.className   = 'btn-del-seg';
        btnDel.dataset.idx = i;
        btnDel.title       = 'Eliminar';
        btnDel.textContent = '✕';
        tdDel.appendChild(btnDel);

        [tdNum, tdIni, tdFin, tdMedia, tdDur, tdHIni, tdHFin, tdDel].forEach(td => tr.appendChild(td));
        segTbody.appendChild(tr);

        // ---- Inline-edit event handlers (closure captures i, seg, info) ----
        [tdIni, tdFin, tdMedia, tdDur, tdHIni, tdHFin].forEach(td => {

            // Focus: swap badge/formatted value for the raw editable number
            td.addEventListener('focus', () => {
                const s = tramo.segmentos[i];
                const c = recalcFrom(tramo, -1, [], null, null)[i];
                switch (td.dataset.type) {
                    case 'ini':   td.textContent = (s.inicio_m / 1000).toFixed(3); break;
                    case 'fin':   td.textContent = (s.fin_m    / 1000).toFixed(3); break;
                    case 'media': td.textContent = s.media_kmh.toFixed(1);          break;
                    case 'dur':   td.textContent = formatDuration(c.dur_secs);       break;
                    case 'h_ini': td.textContent = formatTime(c.hora_inicio);        break;
                    case 'h_fin': td.textContent = formatTime(c.hora_fin);           break;
                }
                const range = document.createRange();
                range.selectNodeContents(td);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });

            // Enter = confirm (blur); Escape = discard
            td.addEventListener('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); td.blur(); }
                if (e.key === 'Escape') { e.preventDefault(); renderSegmentos(); }
            });

            // Blur: validate, update model, cascade, re-render
            td.addEventListener('blur', () => {
                const s   = tramo.segmentos[i];
                const raw = td.textContent.trim();

                switch (td.dataset.type) {

                    case 'ini': {
                        const val = parseFloat(raw);
                        // Must stay below fin and be non-negative
                        if (!isNaN(val) && val >= 0 && Math.round(val * 1000) < s.fin_m) {
                            s.inicio_m = Math.round(val * 1000);
                        }
                        break;
                    }

                    case 'fin': {
                        const val = parseFloat(raw);
                        if (!isNaN(val) && Math.round(val * 1000) > s.inicio_m) {
                            const oldFin = s.fin_m;
                            s.fin_m = Math.round(val * 1000);
                            // Keep chain: if next segment started at old fin, move it too
                            const next = tramo.segmentos[i + 1];
                            if (next && next.inicio_m === oldFin) next.inicio_m = s.fin_m;
                        }
                        break;
                    }

                    case 'media': {
                        const val = parseFloat(raw);
                        if (!isNaN(val) && val > 0 && val <= 250) s.media_kmh = val;
                        break;
                    }

                    case 'dur': {
                        const d      = parseDuration(raw);
                        const distKm = (s.fin_m - s.inicio_m) / 1000;
                        if (d != null && d > 0 && distKm > 0) {
                            // Updates media_kmh in model and cascades horas
                            recalcFrom(tramo, i, [], d, null);
                        }
                        break;
                    }

                    case 'h_ini': {
                        const t = parseTime(raw);
                        if (t != null) {
                            if (i === 0) {
                                // First segment: changing H.Inicio = changing tramo start
                                tramo.hora_inicio = formatTime(t);
                            } else {
                                // Other segments: H.Inicio[i] = H.Fin[i-1]
                                recalcFrom(tramo, i - 1, [], null, t);
                            }
                        }
                        break;
                    }

                    case 'h_fin': {
                        const t = parseTime(raw);
                        if (t != null) recalcFrom(tramo, i, [], null, t);
                        break;
                    }
                }

                renderSegmentos();
            });
        });
    });

    // Auto-fill inicio field for next segment to be added
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
            tramos     = data;
            selectedId = tramos[0].id;
        }
    } catch (_) { /* sin backend = silencioso */ }

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
