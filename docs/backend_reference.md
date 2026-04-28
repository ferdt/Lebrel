# Lebrel — Referencia Técnica del Backend

Documento de referencia para el sistema de navegación Lebrel. Describe el modelo de datos, las variables calculadas en el backend, el payload enviado al frontend y la API REST disponible.

---

## 1. Modelo de Datos Persistido

### 1.1 `tramos.json`

Array de tramos. Cada tramo contiene una lista de segmentos de velocidad.

```json
[
  {
    "id": "abc123",
    "nombre": "TC-1: La Puebla",
    "hora_inicio": "10:30:00.0",
    "segmentos": [
      { "inicio_m": 0,    "fin_m": 1500,  "media_kmh": 49.9 },
      { "inicio_m": 1500, "fin_m": 3500,  "media_kmh": 52.0 },
      { "inicio_m": 3500, "fin_m": 8000,  "media_kmh": 45.0 },
      { "inicio_m": 8000, "fin_m": 12000, "media_kmh": 60.0 }
    ]
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador único generado en el frontend (timestamp + random) |
| `nombre` | `string` | Nombre del tramo (ej: "TC-1: La Puebla") |
| `hora_inicio` | `string` | Hora de inicio del cronómetro del tramo (`HH:MM:SS.d`) |
| `segmentos` | `array` | Lista de segmentos de velocidad media, ordenados por `inicio_m` |
| `segmentos[].inicio_m` | `float` | Kilómetro de inicio del segmento, **en metros** |
| `segmentos[].fin_m` | `float` | Kilómetro de fin del segmento, **en metros** |
| `segmentos[].media_kmh` | `float` | Velocidad media requerida en este segmento (km/h) |

### 1.2 `settings.json`

Configuración general del sistema.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `wheel_perimeter_m` | `float` | `1.95` | Perímetro de la rueda en metros para el odómetro |
| `theme` | `string` | `"dark"` | Tema de la interfaz |
| `font_size_offset` | `int` | `0` | Ajuste de tamaño de fuente (px) |

---

## 2. Variables Calculadas en el Backend

Todas las variables se calculan en el **bucle de hardware** (`hardware_loop`) a **10 Hz** y se distribuyen a través de WebSocket.

### 2.1 Variables de entrada (hardware real o simulado)

| Variable | Origen | Descripción |
|---|---|---|
| `dist_m` | Odómetro hardware / simulado | Distancia recorrida desde el inicio del tramo, en metros. Proviene de contar los pulsos del sensor de rueda multiplicados por el perímetro. |
| `tiempo_tramo_s` | Cronómetro interno | Tiempo transcurrido desde el inicio del tramo, en segundos. Se incrementa 0.1 s por iteración (10 Hz). |
| `velocidad_kmh` | Sensor de velocidad / calculado | Velocidad instantánea del vehículo en km/h. Actualmente simulada en 36.0 km/h. En producción, se calcula como `(pulsos / tiempo) × perímetro × 3.6`. |
| `segmentos` | `active_tramo["segmentos"]` | Tabla de medias del tramo activo. Si no hay tramo lanzado, se usa el tramo de demostración. |

### 2.2 Variables calculadas por `TramoManager` (`core/rally.py`)

#### `tiempo_ideal` *(variable interna, no enviada al frontend)*

**Fórmula:**
```
Para cada segmento completado:
    t_ideal += (fin_m - inicio_m) / 1000 / media_kmh × 3600

Para el segmento actual (parcial):
    t_ideal += (dist_m - inicio_m) / 1000 / media_kmh × 3600
```

El resultado es el tiempo teórico, en segundos, que debería haber tardado el vehículo en recorrer `dist_m` metros siguiendo exactamente las medias definidas. No se envía al frontend; se usa para calcular `diferencia_ideal_s`.

#### `diferencia_ideal_s`

**Fórmula:**
```
diferencia_ideal_s = tiempo_tramo_s - tiempo_ideal
```

| Valor | Significado | Color en UI |
|---|---|---|
| `> 0` | El coche va **tarde** (más lento de lo requerido) | 🟢 Verde |
| `< 0` | El coche va **adelantado** (más rápido de lo requerido) |🔴 Rojo  |
| `= 0` | Perfecto, en el tiempo exacto | — |

**Unidad:** segundos (float, redondeado a 2 decimales)

#### `velocidad_objetivo_kmh`

Media requerida en el **segmento actual** según la tabla del tramo.

**Fórmula:** Se busca el segmento `s` donde `s.inicio_m ≤ dist_m < s.fin_m` y se devuelve su `media_kmh`.

**Unidad:** km/h (float)

#### `proxima_media_kmh`

Media requerida en el **siguiente segmento** (el que viene después del actual).
Vale `0.0` si el vehículo está en el último segmento del tramo.

**Unidad:** km/h (float)

#### `distancia_cambio_m`

Metros restantes hasta el **fin del segmento actual** (= inicio del siguiente cambio de media).

**Fórmula:**
```
distancia_cambio_m = segmento_actual.fin_m - dist_m
```

Vale `0.0` si el vehículo está en el último segmento. **Unidad:** metros (float)

#### `segment_idx`

Índice (base 0) del segmento en el que se encuentra el vehículo dentro del array `segmentos`.
**Uso en el frontend:** la tabla de medias del copiloto resalta la fila activa usando este índice.

---

## 3. Payload WebSocket — Telemetría al Frontend

**Endpoint:** `ws://<ip>:8000/ws/telemetry`
**Frecuencia:** 10 Hz (cada 100 ms)
**Formato:** JSON serializado como texto

```json
{
  "tramo_nombre":           "TC-1: La Puebla",
  "distancia_m":            1253.0,
  "tiempo_tramo_s":         94.3,
  "velocidad_kmh":          36.0,
  "velocidad_objetivo_kmh": 49.9,
  "diferencia_ideal_s":     3.74,
  "proxima_media_kmh":      52.0,
  "distancia_cambio_m":     247.0,
  "segment_idx":            0,
  "tramo_tabla":            [...]
}
```

### Tabla de campos del payload

| Campo | Tipo | Unidad | Pantalla | Descripción |
|---|---|---|---|---|
| `tramo_nombre` | `string` | — | Piloto + Copiloto | Nombre del tramo activo. Se muestra en el header. |
| `distancia_m` | `float` | metros | Piloto + Copiloto | Distancia acumulada desde el inicio del tramo. Se muestra en el **Odómetro**. |
| `tiempo_tramo_s` | `float` | segundos | Piloto | Tiempo transcurrido desde el inicio del tramo. Se muestra en **Tiempo Tramo**. |
| `velocidad_kmh` | `float` | km/h | Piloto + Copiloto | Velocidad instantánea del vehículo. Se muestra en **Velocidad Actual**. |
| `velocidad_objetivo_kmh` | `float` | km/h | Piloto + Copiloto | Velocidad media requerida por el reglamento en el segmento actual. Se muestra en **Velocidad Objetivo**. |
| `diferencia_ideal_s` | `float` | segundos | Piloto + Copiloto | Diferencia entre tiempo real y tiempo ideal. Positivo = tarde, Negativo = adelantado. Se muestra como **Intervalo**. |
| `proxima_media_kmh` | `float` | km/h | Piloto | Velocidad media del siguiente segmento. Se muestra en **Próximo Cambio de Media**. |
| `distancia_cambio_m` | `float` | metros | Piloto | Distancia hasta el próximo cambio de media. Se muestra en **Distancia hasta cambio**. |
| `segment_idx` | `int` | — | Copiloto (interno) | Índice del segmento activo (base 0). Resalta la fila activa en la tabla del copiloto. |
| `tramo_tabla` | `array` | — | Copiloto | Copia completa del array de segmentos. Permite al copiloto renderizar la tabla sin llamada REST adicional. |

> **Nota:** `tramo_tabla` se envía en cada frame. En una optimización futura se puede enviar solo cuando cambie (al lanzar un tramo nuevo).

---

## 4. Comandos WebSocket — Frontend → Backend

El frontend puede enviar texto plano por el WebSocket para ejecutar comandos:

| Comando | Estado | Acción |
|---|---|---|
| `ODO_RESET` | ✅ Implementado | Registra un evento de recalibración en el log CSV. |
| `ODO_PLUS_10m` | ⏳ Pendiente | Suma 10 m al odómetro real. |
| `ODO_MINUS_10m` | ⏳ Pendiente | Resta 10 m al odómetro real. |

---

## 5. API REST

**Base URL:** `http://<ip>:8000`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/settings` | Devuelve la configuración general |
| `POST` | `/api/settings` | Guarda la configuración general |
| `GET` | `/api/tramos` | Devuelve el array completo de tramos con sus segmentos |
| `POST` | `/api/tramos` | Guarda el array de tramos (sobrescribe). Ordena segmentos por `inicio_m`. |
| `GET` | `/api/tramos/active` | Devuelve `{ "id": "<id>" }` del tramo activo, o `{ "id": null }` |
| `POST` | `/api/tramos/active` | Lanza un tramo: `{ "id": "<id>" }`. Lo carga en memoria y lo usa para los cálculos. |

---

## 6. Flujo de Datos Completo

```
┌──────────────────────────────────────────────────────────────┐
│                  Raspberry Pi (backend)                       │
│                                                              │
│  Hardware (sensor pulsos)                                    │
│       │  ticks × calibración → dist_m                        │
│       ▼                                                      │
│  hardware_loop() @ 10 Hz                                     │
│       │                                                      │
│       ├── dist_m, tiempo_tramo_s                             │
│       │         │                                            │
│       │         ▼  core/rally.py                             │
│       │   TramoManager.calculate_interval()                   │
│       │       → tiempo_ideal (interno)                       │
│       │       → diferencia_ideal_s                           │
│       │                                                      │
│       │   TramoManager.get_current_segment_info()            │
│       │       → velocidad_objetivo_kmh                       │
│       │       → proxima_media_kmh                            │
│       │       → distancia_cambio_m                           │
│       │       → segment_idx                                  │
│       │                                                      │
│       └── JSON payload → WebSocket broadcast                 │
└─────────────────────────────┬────────────────────────────────┘
                              │ ws://ip:8000/ws/telemetry @ 10 Hz
              ┌───────────────┴─────────────────┐
              ▼                                 ▼
    ┌──────────────────┐             ┌────────────────────┐
    │  piloto.html     │             │  copiloto.html     │
    │  app_piloto.js   │             │  app_copiloto.js   │
    │                  │             │                    │
    │ • Intervalo      │             │ • Intervalo        │
    │ • Odómetro       │             │ • Odómetro         │
    │ • Tiempo Tramo   │             │ • Velocidades      │
    │ • Velocidades    │             │ • Tabla de medias  │
    │ • Próx. media    │             │ • Botones ODO      │
    └──────────────────┘             └────────────────────┘
```

---

## 7. Pendiente de Implementación

| Componente | Descripción |
|---|---|
| `hardware.py` | Leer pulsos reales desde GPIO de la Raspberry Pi y calcular `dist_m` y `velocidad_kmh`. |
| `hardware_loop` | Usar `Odometer.get_distance()` en lugar del acumulador de simulación. |
| `ODO_PLUS_10m` / `ODO_MINUS_10m` | Aplicar corrección al odómetro cuando el copiloto pulsa los botones. |
| `tiempo_tramo_s` | Arrancar el cronómetro de forma sincronizada con la señal de inicio del tramo (en lugar de al arrancar el proceso). |
| `tramo_tabla` | Enviar solo al conectar un cliente nuevo o al cambiar de tramo, no en cada frame. |
| `pandas` | Procesamiento de CSVs de libreta de ruta para importar segmentos automáticamente. |
