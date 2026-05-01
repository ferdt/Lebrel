# Lebrel — Flujo de Señales y Variables

Este documento describe el ciclo de vida completo de las señales de entrada de hardware (sensores de rueda y GPS) y su transformación en las métricas en tiempo real mostradas en las pantallas de la aplicación.

---

## 1. Captación de Entradas (Bajo Nivel)

El sistema de navegación Lebrel puede captar la distancia recorrida mediante tres fuentes distintas configurables: **Sensor de Rueda 1**, **Sensor de Rueda 2** y **GPS**.

### 1.1 Sensores de Rueda (Pulsos)
* **Captación**: Un lector de pulsos electrónico registra el paso de imanes en las ruedas o en el cardán.
* **Señal Cruda**: Un contador acumulativo de pulsos (`pulses_1` y `pulses_2`).
* **Conversión a metros**: Se calcula la distancia en metros mediante los parámetros de calibración (`pulses_km_1` y `pulses_km_2`):

$$\text{Distancia (m)} = \frac{\text{Pulsos de Rueda}}{\frac{\text{Pulsos/km}}{1000}}$$

### 1.2 GPS
* **Captación**: Antena de GPS en tiempo real.
* **Señal Cruda**: Coordenadas geográficas y distancia acumulada en metros (`dist_gps_m`).
* **Conversión a metros**: Se corrige la distancia para ajustarla a los hitos del roadbook multiplicándola por el factor de calibración de rally (`rally_factor`):

$$\text{Distancia (m)} = \text{dist\_gps\_m} \times \text{rally\_factor}$$

---

## 2. Bucle de Procesamiento y Cálculo (Backend)

En cada tick del bucle de telemetría a 10Hz (`main.py` -> `hardware_loop`), se ejecutan las siguientes etapas:

### 2.1 Lectura de la Hora Maestra
1. Se obtiene la hora actual del sistema operativo (`datetime.now()`).
2. Se le añade la compensación de segundos ajustada por el usuario (`time_offset_s`) para sincronizar con la organización del rally:

$$\text{wall\_time\_s} = \text{Segundos desde medianoche} + \text{time\_offset\_s}$$

### 2.2 Cálculo de la Distancia Activa
Dependiendo de la fuente seleccionada por el usuario (`odometer_source`):
* Si es `sensor1`: Se usa la calibración del Sensor 1 para convertir `pulses_1` en metros.
* Si es `sensor2`: Se usa la calibración del Sensor 2 para convertir `pulses_2` en metros.
* Si es `gps`: Se usa la distancia del GPS multiplicada por el `rally_factor`.
* Si es `test`: Se utiliza un incremento simulado basado en la velocidad seleccionada en la pantalla de pruebas.

### 2.3 Cálculo de la Regularidad (Delta de Tiempo)
El `TramoManager` calcula el tiempo ideal en el que el vehículo debería pasar por la distancia actual `dist_m` según la velocidad media establecida para cada tramo:
1. Se obtiene el segmento activo del tramo mediante la distancia actual.
2. Se calcula el tiempo ideal requerido para recorrer esa distancia.
3. Se compara el tiempo real transcurrido (`tiempo_tramo_s`) con el tiempo ideal:

$$\text{diferencia\_ideal\_s} = \text{tiempo\_real\_elapsado} - \text{tiempo\_ideal\_calculado}$$

* **Resultado Positivo**: El piloto va adelantado (frenar).
* **Resultado Negativo**: El piloto va retrasado (acelerar).

---

## 3. Distribución y Visualización (Frontend)

Una vez calculadas todas las variables, el backend las empaqueta en una trama JSON de telemetría y las transmite vía **WebSockets** a las pantallas del navegador.

```
[Hardware/GPS] -> (Pulsos o metros)
                      |
                      v
                [main.py (10Hz)] -> (Calcula wall_time_s, dist_m, diff_s)
                      |
                      v
          [WebSocket /ws/telemetry]
                      |
        +-------------+-------------+
        |                           |
        v                           v
[Pantalla Piloto]            [Pantalla Copiloto]
(Muestra: Delta,              (Muestra: Tablas de media,
Velocidad, Odo,              Odo parcial y total,
Hora Rally)                  Gráfica de regularidad)
```

### 3.1 Variables Clave del Payload
* **`system_time`**: Hora rally en formato `HH:MM:SS` mostrada como referencia principal.
* **`distancia_m`**: Odómetro del tramo acumulado y calibrado, formateado como `XX.XXX km`.
* **`diferencia_ideal_s`**: Delta de regularidad mostrado con precisión de décimas de segundo (Ej. `+0.4s` o `-1.2s`).
* **`velocidad_kmh`**: Velocidad actual para validación y control de velocidad media.
