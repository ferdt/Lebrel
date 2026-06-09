# Lebrel — Referencia Técnica del Backend (v1.0.20)

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
      { "inicio_m": 0, "fin_m": 1500, "media_kmh": 49.9, "referencias_externas": true }
    ],
    "grabar_a_calcar": false
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
- `distcalcardelta`: Distancia para generación de medias al calcar tramo (m).
- `default_hitos`: Valor por defecto para generación de hitos.

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
- **POST `/api/tramos/generar-calcado/{id}`**: Genera un nuevo tramo a partir del recorrido grabado.

### 2.4 IA y OCR
- **POST `/ocr`**: Procesa una imagen base64 usando el motor **RapidOCR (AI)**. Devuelve el texto detectado y una imagen pre-procesada para validación.

---
## 3. Telemetría y WebSocket (50Hz)

Canal: `/ws/telemetry`. Envía un flujo constante de datos en tiempo real a una frecuencia ultra-sensible de **50Hz** (cada 20ms) para garantizar una actualización fluida del odómetro y delta en las pantallas táctiles.

### 3.1 Comandos WebSocket Soportados (Salientes):
- `ODO_RESET`: Pone a 0 el odómetro parcial/total y las variables simuladas o del GPS.
- `MILESTONE`: Registra un evento de hito manual.
- `DIST_ADJUST:delta`: Ajusta dinámicamente la distancia sumando o restando un delta en metros (ej. `DIST_ADJUST:10.0` o `DIST_ADJUST:-5.0`).
- `PREPARE_HITOS:count`: Prepara en el backend la inserción de un número determinado de hitos.
- `REF_EXT_ACTION`: Aplica el ajuste de referencias externas o genera los hitos previamente preparados.

### 3.2 Formato del Payload:

| Variable | Tipo | Unidad | Descripción |
| :--- | :--- | :--- | :--- |
| `tramo_nombre` | `string` | - | Nombre del tramo activo o de prueba. |
| `distancia_m` | `float` | metros | Distancia calibrada y acumulada según la fuente activa. |
| `dist_gps_m` | `float` | metros | Distancia cruda reportada por el receptor GPS (TCP o BLE). |
| `gps_tcp_status` | `string` | - | Estado de conexión con el GPS por TCP (ej. "Connected"). |
| `gps_ble_status` | `string` | - | Estado de conexión con el GPS por BLE. |
| `pulses_1` | `int` | pulsos | Contador absoluto acumulado de pulsos del Sensor 1. |
| `pulses_2` | `int` | pulsos | Contador absoluto acumulado de pulsos del Sensor 2. |
| `rally_factor` | `float` | ratio | Factor multiplicativo para la distancia GPS. |
| `pulses_km_1` | `int` | - | Parámetro de calibración (pulsos por km) para el Sensor 1. |
| `tiempo_tramo_s` | `float` | segundos | Tiempo de carrera transcurrido desde el inicio del tramo. |
| `velocidad_kmh` | `float` | km/h | Velocidad del vehículo, calculada mediante períodos hardware (sin aliasing). |
| `velocidad_objetivo_kmh` | `float` | km/h | Velocidad media objetivo que el piloto debe mantener en el segmento actual. |
| `diferencia_ideal_s` | `float` | segundos | Delta de regularidad (diferencia de tiempo con el ideal). |
| `proxima_media_kmh` | `float` | km/h | Velocidad media objetivo del siguiente segmento. |
| `distancia_cambio_m` | `float` | metros | Distancia en la que cambiará la velocidad media objetivo. |
| `odo_source` | `string` | - | Fuente activa de odómetro (`sensor1`, `sensor2`, `gps_tcp`, `gps_ble`, `test`). |
| `neutral_interval_s` | `float` | segundos | Margen neutro permitido para los cálculos de delta. |
| `tramo_tabla` | `array` | - | Lista de segmentos del tramo cargado. |
| `segment_idx` | `int` | - | Índice del segmento activo en el tramo. |
| `hora_inicio_tramo` | `string` | HH:MM:SS.f | Hora oficial de inicio del tramo regular. |
| `system_time` | `string` | HH:MM:SS.f | Hora oficial del rally corregida con el offset del usuario. |
| `gps_time` | `string` | HH:MM:SS.f | Hora pura del reloj del sistema / GPS. |
| `time_offset_s` | `float` | segundos | Offset de hora rally configurado. |
| `wall_time_s` | `float` | segundos | Marca de tiempo maestra (segundos desde medianoche + offset). |
| `tramo_id` | `string` | - | ID único del tramo activo. |

### 3.3 Protocolo de Comunicación Serial ESP32

El backend se conecta con el módulo de adquisición de rueda (ESP32) por puerto serie USB a **115200 baudios** con re-conexión automática en un hilo secundario (`ESP32Reader`). El microcontrolador envía los datos en ráfagas cada **10ms (100Hz)** en el siguiente formato robusto de clave-valor delimitado por comas:

`S1:XXXX,S2:YYYY,P1:PPPP,P2:QQQQ,L1:LLLL,L2:MMMM,T:TTTT\n`

* **`S1` / `S2`**: Cuenta absoluta y acumulada de pulsos validados en cada sensor de rueda.
* **`P1` / `P2`**: Período en microsegundos entre los dos últimos pulsos físicos confirmados de cada sensor.
* **`L1` / `L2`**: Timestamp físico (en microsegundos) registrado al ocurrir el último pulso validado.
* **`T`**: Timestamp físico interno de reloj del ESP32 en microsegundos, empleado para sincronización y diagnóstico de latencia.

---

## 4. Estándares de Interfaz (v1.0.20)

### 4.1 Unificación de Editores
Todos los inputs numéricos utilizan la clase `.cell-edit-bar` con un teclado táctil optimizado:
- **Teclado Integrado**: Evita que el sistema operativo despliegue el teclado nativo, tapando la pantalla.
- **Micro-ajustes**: Botones rápidos para sumar/restar metros o segundos.

### 4.2 Versionado de Caché
El sistema utiliza un sufijo `?v=N` en todos los archivos estáticos y un `CACHE_NAME` incremental en el `sw.js` para forzar la actualización en todos los dispositivos tras un despliegue.
