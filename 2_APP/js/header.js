import { LEBREL_CONFIG } from './config.js';
/**
 * Componente de Cabecero Global para Lebrel
 * Centraliza la navegación y los controles comunes.
 */
export function initHeader(currentPage) {
    console.log('Iniciando Header para:', currentPage);
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) {
        console.warn('No se encontró #header-container');
        return;
    }

    const navLinks = [
        { id: 'piloto',   label: 'Piloto',   url: 'piloto.html' },
        { id: 'copiloto', label: 'Copiloto', url: 'copiloto.html' }
    ];

    const moreLinks = [
        { id: 'botonera',   label: 'Botonera',    url: 'botonera.html' },
        { id: 'calibracion', label: 'Calibración', url: 'calibracion.html' },
        { id: 'sincronizacion', label: 'Sincro Reloj', url: 'sincronizacion.html' },
        { id: 'config',     label: 'Config',      url: 'config.html' },
        { id: 'tramos',     label: 'Tramos',      url: 'tramos.html' },
        { id: 'test',       label: 'Test',        url: 'test.html' }
    ];

    const APP_VERSION = LEBREL_CONFIG.VERSION;
    const isMuted = localStorage.getItem('lebrel_mute_sounds') === 'true';
    const muteIcon = isMuted ? `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
    ` : `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
    `;

    headerContainer.innerHTML = `
        <header class="unified-header">
            <a href="index.html" class="header-logo-link" onclick="window.navigateSPA('index.html'); return false;">
                <img src="icon.svg" alt="L" class="header-logo-img">
            </a>
            <nav class="main-nav">
                ${navLinks.map(link => `
                    <a href="#" onclick="window.navigateSPA('${link.url}'); return false;" 
                       class="nav-link ${currentPage === link.id ? 'active' : ''}">${link.label}</a>
                `).join('')}
                
                <div class="nav-dropdown">
                    <button class="btn-more">•••</button>
                    <div class="dropdown-content">
                        ${moreLinks.map(link => `
                            <a href="#" onclick="window.navigateSPA('${link.url}'); return false;"
                               class="${currentPage === link.id ? 'active' : ''}">${link.label}</a>
                        `).join('')}
                    </div>
                </div>
            </nav>

            <div class="stage-info">
                <span id="val_tramo_nombre">--</span>
                <span class="separator">|</span>
                <span id="val_hora">00:00:00</span>
            </div>

            <div class="header-right">
                <span style="font-size: 0.6rem; color: var(--text-secondary); opacity: 0.5; margin-right: 5px;">v${APP_VERSION}</span>
                <button id="btn-mute" class="icon-btn" title="${isMuted ? 'Activar Sonidos' : 'Silenciar Sonidos'}">
                    ${muteIcon}
                </button>
                <button id="btn-rotate" class="icon-btn" title="Girar Pantalla">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 4v6h-6"></path>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
                <button id="btn-fullscreen" class="icon-btn" title="Pantalla Completa">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                </button>
                <div id="status-indicator" class="status-dot disconnected" title="Desconectado"></div>
            </div>
        </header>
    `;

    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
        btnMute.addEventListener('click', () => {
            const currentMuted = localStorage.getItem('lebrel_mute_sounds') === 'true';
            localStorage.setItem('lebrel_mute_sounds', currentMuted ? 'false' : 'true');
            initHeader(currentPage);
        });
    }
}
