# Lebrel — Referencia Técnica del Backend (v1.0.19)

Documento de referencia para el sistema de navegación Lebrel. Describe el modelo de datos, las variables calculadas, la telemetría y los servicios de IA (OCR).

---

## 1. Modelo de Datos Persistido (JSON)

### 1.1 `tramos.json`
Array de tramos con segmentos de velocidad y hora de inicio.
```json
[
  {
    "id": "abc123",
    "nombre": "TC-1: La Puebla",
    "hora_inicio": "17:10:00.0",
    "segmentos": [
      { "inicio_m": 0, "fin_m": 1500, "media_kmh": 49.9 }
    ]
  }
]
```

### 1.2 `calibraciones.json`
Historial de calibraciones realizadas.
- `real_dist_km`: Distancia recorrida según hitos.
- `rally_factor`: Relación entre GPS y distancia real.
- `pulses_km_1/2`: Pulsos por kilómetro para sensores de rueda.

### 1.3 `settings.json`
Parámetros de configuración del sistema.
- `wheel_perimeter_m`: Perímetro de rueda para sensor (m).
- `theme`: Tema visual (`dark`, `light`).
- `font_size_offset`: Ajuste de fuente en píxeles.
- `neutral_interval_s`: Margen neutro para cálculos.
- `odometer_source`: Origen del odómetro (`test`, `wheel`, `gps`).
- `time_offset_s`: Ajuste de compensación de hora rally en segundos.

---

## 2. API REST (FastAPI)

### 2.1 Gestión de Ajustes
- **GET `/api/settings`**: Recupera los ajustes activos.
- **POST `/api/settings`**: Guarda nuevos ajustes (incluye el desfase horario).

### 2.2 Gestión de Calibración
- **GET `/api/calibraciones`**: Recupera el historial.
- **POST `/api/calibraciones`**: Guarda una nueva sesión de calibración.
- **POST `/api/calibraciones/apply`**: Aplica los ratios de una calibración a los ajustes activos.

### 2.3 Tramos y Navegación
- **GET `/api/tramos`**: Listado de tramos.
- **POST `/api/tramos/active`**: Activa un tramo por su ID.
- **POST `/api/tramos/import_tablitos`**: Importa segmentos procesados por OCR desde la aplicación móvil.

### 2.4 IA y OCR
- **POST `/ocr`**: Procesa una imagen base64 usando el motor **RapidOCR (AI)**. Devuelve el texto detectado y una imagen pre-procesada para validación.

---

## 3. Telemetría y WebSocket (10Hz)

Canal: `/ws/telemetry`. Envía un flujo constante de datos:

| Variable | Unidad | Descripción |
| :--- | :--- | :--- |
| `distancia_m` | metros | Odo activo (GPS o Sensores). |
| `velocidad_kmh` | km/h | Velocidad actual. |
| `diferencia_ideal_s` | segundos | Delta de regularidad (Delta). |
| `dist_gps_m` | metros | Odo puro de GPS (sin ratios). |
| `pulses_1` | pulsos | Contador acumulado sensor 1. |
| `system_time` | HH:MM:SS.f | Hora corregida con offset (Hora Rally). |
| `gps_time` | HH:MM:SS.f | Hora pura del sistema o GPS. |
| `time_offset_s` | segundos | Ajuste aplicado en el reloj de rally. |

---

## 4. Estándares de Interfaz (v1.0.19)

### 4.1 Unificación de Editores
Todos los inputs numéricos utilizan la clase `.cell-edit-bar` con un teclado táctil optimizado:
- **Teclado Integrado**: Evita que el sistema operativo despliegue el teclado nativo, tapando la pantalla.
- **Micro-ajustes**: Botones rápidos para sumar/restar metros o segundos.

### 4.2 Versionado de Caché
El sistema utiliza un sufijo `?v=N` en todos los archivos estáticos y un `CACHE_NAME` incremental en el `sw.js` para forzar la actualización en todos los dispositivos tras un despliegue.
