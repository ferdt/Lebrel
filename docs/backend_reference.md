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

---

## 2. Gestión de Datos (CSV)

Lebrel utiliza **CSV** como formato preferido para la importación y exportación de tramos, facilitando el uso de Excel o Google Sheets.

### 2.1 Formato de Archivo
Las columnas requeridas son: `Tramo, Hora Inicio, KM Inicio, KM Fin, Media`.

### 2.2 Inteligencia de Importación
- **Auto-Delimitador**: El sistema detecta automáticamente si el archivo usa comas (`,`) o puntos y coma (`;`).
- **Agrupación**: Las filas se agrupan por el nombre del tramo.
- **Herencia de Hora**: Si solo la primera fila de un tramo tiene hora de inicio, el sistema la aplica a todos los segmentos de ese tramo.
- **Validación**: Si se detectan horas de inicio distintas para el mismo tramo, el sistema lanza un aviso (Warning) antes de proceder.

---

## 3. Telemetría en Tiempo Real (10Hz)

El backend emite un JSON a través de WebSockets (`/ws/telemetry`) con los siguientes campos clave:

| Variable | Unidad | Descripción |
| :--- | :--- | :--- |
| `distancia_m` | metros | Distancia actual del odómetro. |
| `velocidad_kmh` | km/h | Velocidad instantánea del vehículo. |
| `tiempo_tramo_s` | segundos | Tiempo transcurrido desde la salida. |
| `diferencia_ideal_s` | segundos | Intervalo de regularidad (Delta). |
| `velocidad_objetivo_kmh` | km/h | Media requerida actualmente. |
| `system_time` | HH:MM:SS | Hora oficial de la Raspberry Pi. |

---

## 4. Interfaz y Experiencia de Usuario (UX)

### 4.1 Modos de Pantalla
- **Piloto**: Prioriza la tarjeta de **Instrucciones de Conducción** (ACELERA / FRENA / OK) en tamaño gigante para lectura periférica.
- **Copiloto**: Proporciona la cifra de intervalo pura y herramientas de recalibración del odómetro.

### 4.2 Control de Rotación
El sistema permite alternar exclusivamente entre modo **Horizontal (0°)** y **Vertical (90°)** mediante un conmutador binario, optimizando el montaje en el salpicadero.

### 4.3 Navegación
Las funciones secundarias se agrupan en un menú desplegable (`•••`) en el cabecero para maximizar el espacio útil en pantallas verticales.

---

## 5. Sincronización Horaria

Lebrel utiliza un enfoque de **Reloj de Pared (Wall Clock)**:
1.  La Raspberry Pi es la fuente de verdad horaria.
2.  Los clientes sincronizan sus relojes internos con el campo `system_time`.
3.  El tiempo de tramo se calcula como: `T = Hora_Actual - Hora_Inicio`.
