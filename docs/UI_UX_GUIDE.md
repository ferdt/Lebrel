# Guía de Diseño y UX Lebrel (v1.0.8)

Esta guía define los estándares visuales y de interacción para asegurar una experiencia premium y funcional en condiciones de competición.

---

## 1. Sistema de Color y Temas

- **Fondo**: Gradiente radial `#1e293b` -> `#0f172a`.
- **Acento Principal**: Azul Brillante (`#3b82f6`).
- **Estados**:
  - `OK / Positivo`: Verde Esmeralda (`#22c55e`).
  - `Warning / Negativo`: Rojo Intenso (`#ef4444`).
  - `Secundario`: Gris Slate (`#94a3b8`).

---

## 2. Componentes Homogeneizados

### 2.1 Teclado Numérico (`.edit-keypad`)
Se prohíbe el uso de teclados nativos del SO. Todos los editores deben usar la barra `.cell-edit-bar`.
- **Botones**: 12.5vh de altura mínima para facilitar el toque.
- **Feedback**: Cambio de color de borde al pulsar.
- **Acciones**: Incluye siempre botón de retroceso (⌫) y borrado (C).

### 2.2 Cabecero Unificado (`.unified-header`)
Elemento fijo en la parte superior que contiene:
- **Logo**: Enlace a la pantalla de inicio.
- **Navegación**: Enlaces directos a Piloto/Copiloto y menú desplegable para el resto.
- **Reloj Maestro**: Hora del sistema sincronizada a 1Hz.
- **Versión**: Indicador `v1.0.x` para control de cambios.

---

## 3. Responsividad y Rotación

### 3.1 Soporte Multi-Orientación
La aplicación debe funcionar tanto en tablets horizontales como en móviles verticales.
- **Modo Piloto**: Maximiza el contraste y el tamaño de fuente.
- **Modo Copiloto**: Divide la pantalla en información crítica (izq) y tabla de referencia (der).

### 3.2 Service Worker y Caché
Cada cambio visual DEBE ir acompañado de un incremento de versión en `sw.js` y en las referencias de los archivos HTML (`?v=N`). Esto garantiza que el usuario siempre vea la interfaz correcta en dispositivos que suelen estar offline durante periodos largos.
