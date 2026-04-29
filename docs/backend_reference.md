# Lebrel — Referencia Técnica del Backend

Documento de referencia para el sistema de navegación Lebrel. Describe el modelo de datos, las variables calculadas en el backend, el payload de telemetría y la arquitectura de sincronización horaria.

---

## 1. Modelo de Datos Persistido

### 1.1 `tramos.json`
Array de tramos. Cada tramo contiene una lista de segmentos de velocidad y una hora de inicio absoluta.

```json
[
  {
    "id": "abc123",
    "nombre": "TC-1: La Puebla",
    "hora_inicio": "17:10:00.0",
    "segmentos": [
      { "inicio_m": 0,    "fin_m": 1500,  "media_kmh": 49.9 },
      { "inicio_m": 1500, "fin_m": 3500,  "media_kmh": 52.0 }
    ]
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador único (timestamp + random). |
| `nombre` | `string` | Nombre del tramo. |
| `hora_inicio` | `string` | Hora de salida programada (`HH:MM:SS.d`). |
| `segmentos` | `array` | Segmentos de velocidad media, ordenados por distancia. |

---

## 2. Telemetría en Tiempo Real (10Hz)

El backend emite un JSON a través de WebSockets (`/ws/telemetry`) con los siguientes campos:

| Variable | Unidad | Descripción |
| :--- | :--- | :--- |
| `distancia_m` | metros | Distancia actual del odómetro (incluyendo recalibraciones). |
| `velocidad_kmh` | km/h | Velocidad instantánea del vehículo. |
| `tiempo_tramo_s` | segundos | Tiempo transcurrido desde la salida. Negativo si falta para la salida. |
| `diferencia_ideal_s` | segundos | Intervalo (Regularidad). Positivo = tarde, Negativo = adelantado. |
| `velocidad_objetivo_kmh` | km/h | Media requerida en el segmento actual. |
| `tramo_nombre` | string | Nombre del tramo activo. |
| `tramo_id` | string | ID del tramo para sincronización y edición remota. |
| `tramo_tabla` | array | Lista de segmentos activa (para renderizar tablas en el cliente). |
| `segment_idx` | int | Índice del segmento en el que se encuentra el vehículo. |
| `system_time` | HH:MM:SS | Hora oficial de la Raspberry Pi (Fuente de Verdad). |

---

## 3. Sincronización Horaria y Lógica de Carrera

Lebrel utiliza un enfoque de **Reloj de Pared (Wall Clock)** para garantizar precisión profesional:

1.  **Sincronización**: La Raspberry Pi actúa como servidor de tiempo maestro. Todos los clientes (Pilot/Copilot) sincronizan sus relojes internos con el campo `system_time` recibido.
2.  **Tiempo de Tramo**: No es un cronómetro relativo. Se calcula como:
    `tiempo_tramo = hora_actual_pi - hora_inicio_tramo`
3.  **Cuenta Atrás**: Si la hora actual es menor que la de inicio, el tiempo se muestra en negativo, indicando cuánto falta para la salida.
4.  **Reactividad Total**: El backend detecta cambios en el archivo `tramos.json`. Si el copiloto edita una media o la hora de inicio, el motor de navegación recalcula todo instantáneamente sin detener el tramo.

---

## 4. Recalibración del Odómetro

Para corregir errores del sensor o diferencias con el Roadbook oficial:

- **Captura (Snap)**: Al tocar el odómetro, el sistema guarda la distancia actual exacta ($D_{captura}$).
- **Ajuste**: El copiloto introduce la cifra del Roadbook ($D_{real}$).
- **Offset**: El sistema calcula un $\Delta = D_{real} - D_{captura}$.
- **Aplicación**: Este $\Delta$ se aplica a todas las lecturas futuras de distancia, permitiendo "clavar" el odómetro con las referencias externas.

---

## 5. API REST

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/tramos` | Obtener todos los tramos. |
| `POST` | `/api/tramos` | Guardar/Actualizar tramos (detona recalculo en vivo). |
| `POST` | `/api/tramos/active` | Lanzar un tramo específico por su ID. |
| `GET` | `/api/settings` | Obtener configuración del sistema (perímetros, etc). |

---

## 6. Arquitectura de Hardware

- **Raspberry Pi**: Ejecuta `main.py` (FastAPI + WebSockets).
- **Sensor**: Sensor inductivo en la rueda conectado a GPIO (vía `hardware.py`).
- **Clientes**: Tablets/Móviles conectados vía WiFi al AP de la Raspberry Pi.
