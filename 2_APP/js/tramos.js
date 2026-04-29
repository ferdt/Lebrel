import { initFullscreen } from './fullscreen.js';
import { initWakeLock } from './wakelock.js';
import { initRouter } from './router.js';
import { initRotation } from './rotation.js';

let tramos        = [];
let selectedId    = null;
let activeTramoId = null;

// ---- Time helpers ----
function parseTime(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d))?$/);
    if (!m) return null;
    return parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]) + (m[4] ? parseInt(m[4])*0.1 : 0);
}
function parseTimeCompact(str) {
    if (!str) return null;
    str = str.trim();
    const m6 = str.match(/^(\d{2})(\d{2})(\d{2})(?:[.,](\d))?$/);
    if (m6) return parseInt(m6[1])*3600 + parseInt(m6[2])*60 + parseInt(m6[3]) + (m6[4] ? parseInt(m6[4])*0.1 : 0);
    const m4 = str.match(/^(\d{2})(\d{2})$/);
    if (m4) return parseInt(m4[1])*3600 + parseInt(m4[2])*60;
    return null;
}
function parseTimeAny(str) { return parseTime(str) ?? parseTimeCompact(str); }

function formatTime(secs) {
    if (secs == null || isNaN(secs)) return '--:--:--.--';
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60),
          s = Math.floor(secs%60),   d = Math.floor((secs%1)*10);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}
function parseDuration(str) {
    if (!str) return null;
    str = str.trim();
    let m = str.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d))?$/);
    if (m) return parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]) + (m[4] ? parseInt(m[4])*0.1 : 0);
    m = str.match(/^(\d{1,2}):(\d{2})(?:[.,](\d))?$/);
    if (m) return parseInt(m[1])*60 + parseInt(m[2]) + (m[3] ? parseInt(m[3])*0.1 : 0);
    const n = parseFloat(str); return isNaN(n) ? null : n;
}
function formatDuration(secs) {
    if (secs == null || isNaN(secs)) return '--:--.-';
    secs = Math.abs(secs);
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60),
          s = Math.floor(secs%60),   d = Math.floor((secs%1)*10);
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

function recalcFrom(tramo, fromIdx, _u, overrideDur, overrideHFin) {
    const segs = tramo.segmentos;
    let cursor = parseTime(tramo.hora_inicio) ?? 0;
    return segs.map((seg, i) => {
        const distKm = (seg.fin_m - seg.inicio_m) / 1000;
        let dur;
        if (i === fromIdx && overrideHFin != null) {
            dur = overrideHFin - cursor;
            if (dur > 0 && distKm > 0) seg.media_kmh = (distKm / dur) * 3600;
        } else if (i === fromIdx && overrideDur != null) {
            dur = overrideDur;
            if (dur > 0 && distKm > 0) seg.media_kmh = (distKm / dur) * 3600;
        } else {
            dur = distKm > 0 && seg.media_kmh > 0 ? (distKm / seg.media_kmh) * 3600 : 0;
        }
        const h_ini = cursor; cursor += dur;
        return { hora_inicio: h_ini, hora_fin: cursor, dur_secs: dur };
    });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function escHtml(s) { return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getSelected() { return tramos.find(t => t.id === selectedId) ?? null; }

// ---- DOM refs ----
const tramosList    = document.getElementById('tramos-list');
const tramosEmpty   = document.getElementById('tramos-empty');
const headerNombre  = document.getElementById('val_tramo_nombre');
const placeholderEl = document.getElementById('placeholder-noselect');
const segContent    = document.getElementById('seg-content');
const segTbody      = document.getElementById('seg-tbody');
const segEmpty      = document.getElementById('seg-empty');
const segCount      = document.getElementById('seg-count');
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
// Info card
const infoNombre    = document.getElementById('info-nombre');
const infoHoraIni   = document.getElementById('info-hora-inicio');
const infoHoraFin   = document.getElementById('info-hora-fin');
const infoDistTotal = document.getElementById('info-dist-total');
const infoDurTotal  = document.getElementById('info-dur-total');

// ---- Save All Logic ----
async function saveAllTramos() {
    if (tramos.length === 0) {
        if (typeof showStatus === 'function') showStatus('No hay tramos que guardar', 'err');
        return;
    }
    try {
        const res = await fetch(`/api/tramos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tramos)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (typeof showStatus === 'function') showStatus('✓ Guardado correctamente', 'ok');
        return true;
    } catch (err) {
        console.error("Error saving:", err);
        if (typeof showStatus === 'function') showStatus('Error al guardar: ' + err.message, 'err');
        return false;
    }
}
window.saveAllTramos = saveAllTramos; // Asegurar disponibilidad global

// Import/Export (CSV)
const btnExport = document.getElementById('btn-export');
const btnImportTrigger = document.getElementById('btn-import-trigger');
const importFile = document.getElementById('import-file');

btnExport.addEventListener('click', () => {
    let csv = "Tramo,Hora Inicio,KM Inicio,KM Fin,Media\n";
    tramos.forEach(t => {
        t.segmentos.forEach(s => {
            csv += `"${t.nombre}","${t.hora_inicio}",${(s.inicio_m/1000).toFixed(3)},${(s.fin_m/1000).toFixed(3)},${s.media_kmh.toFixed(1)}\n`;
        });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "lebrel_tramos.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

btnImportTrigger.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const text = event.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
            if (lines.length < 2) throw new Error("Archivo vacío o sin datos.");

            const rows = lines.slice(1).map(l => {
                // Parser simple de CSV (considerando comas y posibles comillas)
                const parts = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, '').trim());
                return { tramo: parts[0], hora: parts[1], ini: parseFloat(parts[2]), fin: parseFloat(parts[3]), media: parseFloat(parts[4]) };
            });

            // Agrupar por nombre de tramo
            const groups = {};
            rows.forEach(r => {
                if (!groups[r.tramo]) groups[r.tramo] = { rows: [], horas: new Set() };
                groups[r.tramo].rows.push(r);
                if (r.hora) groups[r.tramo].horas.add(r.hora);
            });

            const newTramos = [];
            const warnings = [];

            for (const name in groups) {
                const g = groups[name];
                const distinctHoras = Array.from(g.horas);
                
                if (distinctHoras.length > 1) {
                    warnings.push(`Tramo "${name}" tiene múltiples horas de inicio: ${distinctHoras.join(", ")}. Usando la primera.`);
                }
                
                const horaFinal = distinctHoras[0] || "00:00:00.0";
                
                newTramos.push({
                    id: uid(),
                    nombre: name,
                    hora_inicio: horaFinal,
                    segmentos: g.rows.map(r => ({
                        inicio_m: (r.ini || 0) * 1000,
                        fin_m: (r.fin || 0) * 1000,
                        media_kmh: r.media || 0
                    })).sort((a,b) => a.inicio_m - b.inicio_m)
                });
            }

            if (warnings.length > 0) {
                alert("AVISO:\n" + warnings.join("\n"));
            }

            if (!confirm(`¿Importar ${newTramos.length} tramos desde CSV? Se sobrescribirá la lista actual.`)) return;
            
            tramos = newTramos;
            await saveAllTramos();
            renderTramosList();
            renderSegmentos();
            alert("Tramos importados correctamente.");
        } catch (err) {
            alert("Error al importar CSV: " + err.message);
        }
        importFile.value = '';
    };
    reader.readAsText(file);
});

// ---- Cell editor bar ----
const cellEditBar   = document.getElementById('cell-edit-bar');
const cellEditLabel = document.getElementById('cell-edit-label');
const cellEditInput = document.getElementById('cell-edit-input');
const cellEditOk    = document.getElementById('cell-edit-ok');
const cellEditCancel= document.getElementById('cell-edit-cancel');

const CELL_LABELS = {
    ini:'Inicio (km)', fin:'Fin (km)', media:'Media (km/h)',
    dur:'Duración (MM:SS.d o segundos)',
    h_ini:'H. Inicio (HH:MM:SS o HHMMSS)',
    h_fin:'H. Fin   (HH:MM:SS o HHMMSS)',
    tramo_hora_ini: 'Hora Inicio del Tramo (HH:MM:SS o HHMMSS)',
};

let _editCell = null, _editTramo = null, _editSpecial = null;

function openCellEditor(td, tramo, special) {
    _editCell    = td;
    _editTramo   = tramo;
    _editSpecial = special ?? null;

    let label, value;

    if (special === 'tramo_hora_ini') {
        label = CELL_LABELS.tramo_hora_ini;
        value = tramo.hora_inicio || '';
    } else {
        const type = td.dataset.type;
        const idx  = parseInt(td.dataset.idx, 10);
        const seg  = tramo.segmentos[idx];
        const c    = recalcFrom(tramo, -1, [], null, null)[idx];
        label = CELL_LABELS[type] || type;
        switch (type) {
            case 'ini':   value = (seg.inicio_m/1000).toFixed(3); break;
            case 'fin':   value = (seg.fin_m/1000).toFixed(3);    break;
            case 'media': value = seg.media_kmh.toFixed(1);        break;
            case 'dur':   value = formatDuration(c.dur_secs);       break;
            case 'h_ini': value = formatTime(c.hora_inicio);        break;
            case 'h_fin': value = formatTime(c.hora_fin);           break;
            default:      value = '';
        }
    }

    cellEditLabel.textContent = label;
    cellEditInput.value       = value;
    document.querySelectorAll('.td-editable.editing, .tramo-info-value.editing')
        .forEach(el => el.classList.remove('editing'));
    td.classList.add('editing');

    cellEditBar.classList.add('open');
    setTimeout(() => { cellEditInput.select(); cellEditInput.focus(); }, 60);
}

function closeCellEditor() {
    cellEditBar.classList.remove('open');
    document.querySelectorAll('.td-editable.editing, .tramo-info-value.editing')
        .forEach(el => el.classList.remove('editing'));
    _editCell = _editTramo = _editSpecial = null;
}

function applyCellEdit() {
    if (!_editCell || !_editTramo) { closeCellEditor(); return; }
    const raw = cellEditInput.value.trim();

    if (_editSpecial === 'tramo_hora_ini') {
        const t = parseTimeAny(raw);
        if (t != null) _editTramo.hora_inicio = formatTime(t);
        closeCellEditor();
        renderSegmentos();
        return;
    }

    const type = _editCell.dataset.type;
    const idx  = parseInt(_editCell.dataset.idx, 10);
    const s    = _editTramo.segmentos[idx];

    switch (type) {
        case 'ini': {
            const val = parseFloat(raw);
            if (!isNaN(val) && val >= 0 && Math.round(val*1000) < s.fin_m)
                s.inicio_m = Math.round(val*1000);
            break;
        }
        case 'fin': {
            const val = parseFloat(raw);
            if (!isNaN(val) && Math.round(val*1000) > s.inicio_m) {
                const old = s.fin_m;
                s.fin_m = Math.round(val*1000);
                const next = _editTramo.segmentos[idx+1];
                if (next && next.inicio_m === old) next.inicio_m = s.fin_m;
            }
            break;
        }
        case 'media': {
            const val = parseFloat(raw);
            if (!isNaN(val) && val > 0 && val <= 250) s.media_kmh = val;
            break;
        }
        case 'dur': {
            const d = parseDuration(raw), distKm = (s.fin_m-s.inicio_m)/1000;
            if (d != null && d > 0 && distKm > 0) recalcFrom(_editTramo, idx, [], d, null);
            break;
        }
        case 'h_ini': {
            const t = parseTimeAny(raw);
            if (t != null) {
                if (idx === 0) _editTramo.hora_inicio = formatTime(t);
                else recalcFrom(_editTramo, idx-1, [], null, t);
            }
            break;
        }
        case 'h_fin': {
            const t = parseTimeAny(raw);
            if (t != null) recalcFrom(_editTramo, idx, [], null, t);
            break;
        }
    }
    closeCellEditor();
    renderSegmentos();
}

cellEditOk.addEventListener('click', applyCellEdit);
cellEditCancel.addEventListener('click', () => { closeCellEditor(); renderSegmentos(); });
cellEditInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); applyCellEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); closeCellEditor(); renderSegmentos(); }
});

// ---- Add / insert segment helpers ----
function defaultMedia(tramo) {
    const segs = tramo.segmentos;
    return segs.length > 0 ? segs[segs.length-1].media_kmh : 50;
}

function addSegmentAtEnd(tramo) {
    const segs  = tramo.segmentos;
    const ini   = segs.length > 0 ? segs[segs.length-1].fin_m : 0;
    const fin   = ini + 1000; // 1 km default
    const media = defaultMedia(tramo);
    const seg   = { inicio_m: ini, fin_m: fin, media_kmh: media };
    segs.push(seg);
    renderSegmentos();
    // Open editor on fin_m of new row immediately
    setTimeout(() => {
        const rows = segTbody.querySelectorAll('tr');
        const lastRow = rows[rows.length-1];
        if (lastRow) {
            const finTd = lastRow.querySelector('[data-type="fin"]');
            if (finTd) openCellEditor(finTd, tramo);
        }
    }, 30);
}

function insertSegmentAbove(tramo, idx) {
    const segs   = tramo.segmentos;
    const iniM   = idx > 0 ? segs[idx-1].fin_m : 0;
    const finM   = segs[idx].inicio_m > iniM ? segs[idx].inicio_m : iniM + 1000;
    const media  = defaultMedia(tramo);
    const newSeg = { inicio_m: iniM, fin_m: finM, media_kmh: media };
    segs.splice(idx, 0, newSeg);
    renderSegmentos();
    // Open editor on fin_m of inserted row
    setTimeout(() => {
        const rows = segTbody.querySelectorAll('tr');
        const row  = rows[idx];
        if (row) {
            const finTd = row.querySelector('[data-type="fin"]');
            if (finTd) openCellEditor(finTd, tramo);
        }
    }, 30);
}

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

// ---- Render segmentos ----
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
    const startSecs = parseTime(tramo.hora_inicio) || 0;

    // ---- Info card ----
    infoNombre.textContent = escHtml(tramo.nombre);
    infoHoraIni.textContent = tramo.hora_inicio || '--:--:--.--';
    if (segs.length > 0) {
        const last = computed[computed.length-1];
        const distTotal = segs.reduce((acc, s) => acc + (s.fin_m - s.inicio_m), 0) / 1000;
        const durTotal  = computed.reduce((acc, c) => acc + c.dur_secs, 0);
        infoHoraFin.textContent  = formatTime(last.hora_fin);
        infoDistTotal.textContent = distTotal.toFixed(3) + ' km';
        infoDurTotal.textContent  = formatDuration(durTotal);
    } else {
        infoHoraFin.textContent  = '--:--:--.--';
        infoDistTotal.textContent = '0.000 km';
        infoDurTotal.textContent  = '--:--.-';
    }

    // ---- Table ----
    segEmpty.style.display = segs.length === 0 ? 'block' : 'none';
    segCount.textContent   = `${segs.length} seg.`;
    segTbody.innerHTML     = '';

    segs.forEach((seg, i) => {
        const info = computed[i];
        const tr   = document.createElement('tr');
        tr.dataset.idx = i;

        const makeTd = (text, type) => {
            const td        = document.createElement('td');
            td.className    = 'td-editable hora-cell';
            td.textContent  = text;
            td.dataset.type = type;
            td.dataset.idx  = i;
            td.addEventListener('click', () => openCellEditor(td, tramo));
            return td;
        };

        const tdNum = document.createElement('td');
        tdNum.className   = 'seg-num';
        tdNum.textContent = i + 1;

        const tdIni   = makeTd((seg.inicio_m/1000).toFixed(3), 'ini');
        const tdFin   = makeTd((seg.fin_m/1000).toFixed(3),    'fin');
        const tdDur   = makeTd(formatDuration(info.dur_secs),   'dur');
        
        // Tiempos relativos al inicio (00:00.0)
        const relIni = info.hora_inicio - startSecs;
        const relFin = info.hora_fin - startSecs;
        const tdTIni = makeTd(formatTime(relIni), 'h_ini');
        const tdTFin = makeTd(formatTime(relFin), 'h_fin');

        const tdMedia = makeTd('', 'media');
        tdMedia.innerHTML = `<span class="media-badge">${seg.media_kmh.toFixed(1)}</span>`;
        tdMedia.addEventListener('click', () => openCellEditor(tdMedia, tramo));

        const tdAct = document.createElement('td');
        tdAct.innerHTML = `
            <div class="row-actions">
                <button class="btn-ins-seg" data-idx="${i}" title="Insertar segmento encima">↑</button>
                <button class="btn-del-seg" data-idx="${i}" title="Eliminar">✕</button>
            </div>
        `;

        [tdNum, tdIni, tdFin, tdMedia, tdDur, tdTIni, tdTFin, tdAct].forEach(td => tr.appendChild(td));
        segTbody.appendChild(tr);
    });
}

// ---- Select tramo ----
function selectTramo(id) {
    closeCellEditor();
    selectedId = id;
    renderTramosList();
    renderSegmentos();
}

// ---- Tramos list click ----
tramosList.addEventListener('click', e => {
    const delBtn = e.target.closest('.btn-delete-tramo');
    if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.id;
        const t  = tramos.find(x => x.id === id);
        if (!confirm(`¿Eliminar el tramo "${t?.nombre}"?\nSe eliminarán todos sus segmentos.`)) return;
        tramos = tramos.filter(x => x.id !== id);
        if (selectedId === id) selectedId = tramos[0]?.id ?? null;
        renderTramosList(); renderSegmentos(); return;
    }
    const item = e.target.closest('.tramo-item');
    if (item) selectTramo(item.dataset.id);
});

// ---- Table actions delegation (insert + delete) ----
segTbody.addEventListener('click', e => {
    const tramo = getSelected();
    if (!tramo) return;

    const delBtn = e.target.closest('.btn-del-seg');
    if (delBtn) {
        const idx = parseInt(delBtn.dataset.idx, 10);
        tramo.segmentos.splice(idx, 1);
        closeCellEditor();
        renderSegmentos();
        return;
    }

    const insBtn = e.target.closest('.btn-ins-seg');
    if (insBtn) {
        const idx = parseInt(insBtn.dataset.idx, 10);
        insertSegmentAbove(tramo, idx);
        return;
    }
});

// ---- Add segment button ----
btnAddSeg.addEventListener('click', () => {
    const tramo = getSelected();
    if (!tramo) return;
    addSegmentAtEnd(tramo);
});

// ---- Info card: edit hora inicio ----
infoHoraIni.addEventListener('click', () => {
    const tramo = getSelected();
    if (!tramo) return;
    openCellEditor(infoHoraIni, tramo, 'tramo_hora_ini');
});

// ---- Clear segments ----
btnClearSegs.addEventListener('click', () => {
    const tramo = getSelected();
    if (!tramo || tramo.segmentos.length === 0) return;
    if (!confirm('¿Eliminar todos los segmentos de este tramo?')) return;
    tramo.segmentos = [];
    closeCellEditor();
    renderSegmentos();
});

// ---- Launch tramo ----
if (btnLaunch) {
    btnLaunch.addEventListener('click', async () => {
        const tramo = getSelected();
        if (!tramo) return;
        if (tramo.segmentos.length === 0) { showStatus('El tramo no tiene segmentos definidos', 'err'); return; }
        try {
            const res  = await fetch(`/api/tramos/active`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ id: tramo.id })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            activeTramoId = tramo.id;
            showStatus(`▶ "${tramo.nombre}" lanzado`, 'ok');
            renderTramosList(); renderSegmentos();
        } catch (err) { showStatus('Error al lanzar: ' + err.message, 'err'); }
    });
}

btnSave.addEventListener('click', saveAllTramos);

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
});
modalNombre.addEventListener('keydown', e => { if (e.key === 'Enter') modalHora.focus(); });
modalHora.addEventListener('keydown',   e => { if (e.key === 'Enter') modalOk.click(); });
modalOverlay.addEventListener('click',  e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

// ---- Load from backend ----
async function loadTramos() {
    try {
        const res  = await fetch(`/api/tramos`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) { tramos = data; selectedId = tramos[0].id; }
        }
    } catch (_) {}
    try {
        const res  = await fetch(`/api/tramos/active`);
        if (res.ok) { const d = await res.json(); activeTramoId = d.id ?? null; }
    } catch (_) {}
    renderTramosList();
    renderSegmentos();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initRouter(); initFullscreen(); initWakeLock(); initRotation(); loadTramos();
});
window.addEventListener('spa-navigated', () => {
    initFullscreen(); renderTramosList(); renderSegmentos();
});
