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
        // Ciclo de 90 grados
        rotation = (rotation + 90) % 360;
        localStorage.setItem('lebrel_rotation', rotation);
        applyRotation(rotation);
    });
}

function applyRotation(deg) {
    // Eliminar clases previas
    document.body.classList.remove('rotate-90', 'rotate-180', 'rotate-270');
    
    // Aplicar clase según grados
    if (deg === 90) document.body.classList.add('rotate-90');
    else if (deg === 180) document.body.classList.add('rotate-180');
    else if (deg === 270) document.body.classList.add('rotate-270');
    
    console.log(`Rotación aplicada: ${deg}deg`);
}
