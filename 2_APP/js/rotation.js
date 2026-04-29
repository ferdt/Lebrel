/**
 * Gestión de la rotación manual de la pantalla mediante CSS.
 * Cicla entre 0, 90, 180 y 270 grados.
 */
export function initRotation() {
    const btn = document.getElementById('btn-rotate');
    if (!btn) return;

    // Recuperar rotación guardada
    let rotation = parseInt(localStorage.getItem('lebrel_rotation')) || 0;
    applyRotation(rotation);

    btn.addEventListener('click', () => {
        // Alternar solo entre 0 y 90
        rotation = (rotation === 0) ? 90 : 0;
        localStorage.setItem('lebrel_rotation', rotation);
        applyRotation(rotation);
    });
}

function applyRotation(deg) {
    // Solo manejamos 0 y 90
    if (deg === 90) {
        document.body.classList.add('rotate-90');
    } else {
        document.body.classList.remove('rotate-90');
    }
    console.log(`Rotación: ${deg === 90 ? 'Vertical' : 'Horizontal'}`);
}
