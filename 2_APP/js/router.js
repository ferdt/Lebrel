/**
 * router.js — SPA router para Lebrel.
 * Expone window.navigateSPA(url) para cambiar de vista sin recargar la página
 * y sin salir del modo pantalla completa.
 */
export function initRouter() {
    window.navigateSPA = async function (url) {
        // Evitar recargar la misma página
        const currentPage = window.location.pathname.split('/').pop() || 'piloto.html';
        if (currentPage === url) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();

            // Parsear el HTML recibido
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Reemplazar <main>
            const newMain = doc.querySelector('main');
            const curMain = document.querySelector('main');
            if (newMain && curMain) curMain.replaceWith(newMain);

            // Reemplazar header (para actualizar info de tramo, reloj, etc)
            const newHeader = doc.querySelector('.unified-header');
            const curHeader = document.querySelector('.unified-header');
            if (newHeader && curHeader) curHeader.replaceWith(newHeader);

            // Actualizar URL sin recargar
            window.history.pushState({}, '', url);

            // Cargar el módulo JS de la nueva página y ejecutarlo
            // Cada página define su propio script type="module", pero como el DOM
            // ya está cargado y los módulos no se re-ejecutan, cargamos
            // el script de la nueva página dinámicamente.
            const newScriptSrc = doc.querySelector('script[type="module"]')?.getAttribute('src');
            if (newScriptSrc) {
                // Forzar recarga añadiendo timestamp (evita caché)
                await import(newScriptSrc + '?t=' + Date.now());
            }

            // Avisar al resto de módulos que hemos navegado
            window.dispatchEvent(new CustomEvent('spa-navigated', { detail: { url } }));

        } catch (err) {
            console.warn('SPA routing falló, navegando normalmente:', err);
            window.location.href = url;
        }
    };

    // Botón "atrás" del navegador
    window.addEventListener('popstate', () => {
        const url = window.location.pathname.split('/').pop() || 'piloto.html';
        window.navigateSPA(url);
    });
}
