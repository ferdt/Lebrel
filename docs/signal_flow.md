# Lebrel — Flujo de Señales y Variables

Este documento describe el ciclo de vida completo de las señales de entrada de hardware (sensores de rueda y GPS) y su transformación en las métricas en tiempo real mostradas en las pantallas de la aplicación.

---

## 1. Captación de Entradas (Bajo Nivel)

El sistema de navegación Lebrel puede captar la distancia recorrida mediante tres fuentes distintas configurables: **Sensor de Rueda 1**, **Sensor de Rueda 2** y **GPS**.

### 1.1 Sensores de Rueda (Sondas Inductivas vía ESP32)
* **Captación Hardware**: Las sondas inductivas (de 12V) detectan el paso de imanes o tornillos en la rueda o cardán.
* **Procesamiento de Pulsos Avanzado (ESP32)**: Un microcontrolador ESP32 recibe la señal de las sondas (rebajada a 3.3V mediante optoacopladores). El firmware implementa un robusto sistema de filtrado de ruido y rebotes por software en tiempo real:
  * **Interrupciones en Modo `CHANGE`**: Configura interrupciones físicas (`IRAM_ATTR`) en los pines `34` (Sensor 1) y `35` (Sensor 2) para capturar cualquier flanco físico (tanto de subida como de bajada).
  * **Protección contra Tormentas de Interrupción (CPU Storm)**: El microcontrolador ignora cualquier cambio físico que ocurra en un intervalo menor a `100µs`, protegiendo la CPU frente a ráfagas de ruido electromagnético de alta frecuencia (>10 kHz).
  * **Filtro de Glitch/Ruido**: Al detectar un cambio de flanco, se ejecuta una máquina de estados que espera `VERIFY_MICROS = 500µs` (0.5 ms) y lee de nuevo el pin físico. Si el estado es estable y coincide con el flanco detectado, se confirma la transición. De lo contrario, se descarta como ruido transitorio.
  * **Filtro Antirrebote Adaptativo Dinámico**: Una vez validado un flanco, el pulso del odómetro se cuenta únicamente en la transición de bajada (`LOW`). Tras procesar el pulso, se calcula un tiempo de debounce dinámico fijado al **30% del período real del pulso anterior**, acotado de forma segura entre `1.5ms` (permite hasta 666 Hz en altas velocidades) y `40ms` (para arranques a baja velocidad). Esto evita cualquier rebote mecánico por vibraciones sin importar la velocidad del vehículo.
* **Transmisión de Alta Frecuencia (Serial/USB)**: El ESP32 transmite el estado completo de los sensores a la Raspberry Pi por USB a `115200` baudios 100 veces por segundo (cada `10ms`). Utiliza un protocolo extendido robusto en formato clave-valor:
  `S1:XXXX,S2:YYYY,P1:PPPP,P2:QQQQ,L1:LLLL,L2:MMMM,T:TTTT\n`
  * `S1` / `S2`: Cuenta absoluta y acumulada de pulsos validados para Sensor 1 y Sensor 2. El uso de acumuladores absolutos previene cualquier pérdida de distancia ante micro-cortes seriales.
  * `P1` / `P2`: Período en microsegundos entre los dos últimos pulsos físicos validados de cada sensor.
  * `L1` / `L2`: Marca de tiempo en microsegundos de la ocurrencia del último pulso validado.
  * `T`: Tiempo interno de reloj del ESP32 en microsegundos (útil para telemetría y diagnóstico de retardos).
* **Conversión a metros**: En el archivo `core/hardware.py`, un hilo en segundo plano (`ESP32Reader`) lee continuamente los valores seriales y los inyecta de forma atómicamente segura (candado `lock`) al bucle de telemetría. Se calcula la distancia final en metros usando los parámetros de calibración (`pulses_km_1` y `pulses_km_2`):

$$\text{Distancia (m)} = \frac{\text{Pulsos de Rueda Absolutos}}{\frac{\text{Pulsos/km}}{1000}}$$

### 1.2 GPS
* **Captación**: Antena de GPS en tiempo real.
* **Señal Cruda**: Coordenadas geográficas y distancia acumulada en metros (`dist_gps_m`).
* **Conversión a metros**: Se corrige la distancia para ajustarla a los hitos del roadbook multiplicándola por el factor de calibración de rally (`rally_factor`):

$$\text{Distancia (m)} = \text{dist\_gps\_m} \times \text{rally\_factor}$$

---

## 2. Bucle de Procesamiento y Cálculo (Backend)

En cada tick del bucle de telemetría a **50Hz** (`main.py` -> `hardware_loop`), se ejecutan las siguientes etapas:

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

$$\text{Delta Distancia (m)} = \frac{\text{Delta Pulsos}}{\frac{\text{Pulsos/km}}{1000}}$$

El odómetro del tramo acumulado siempre suma la distancia recorrida:

$$\text{dist\_m} = \text{dist\_m} + \text{Delta Distancia}$$

### 2.3 Cálculo de la Velocidad Instantánea (Hardware-Period Math)
Para evitar el efecto de aliasing y retrasos inherentes a la medición por delta de tiempo (frecuentes a bajas velocidades), la velocidad se calcula a partir de los períodos de alta resolución medidos directamente por el microcontrolador:

1. **Velocidad por Período de Hardware**:
   Si el sensor activo reporta un período válido ($\text{periodo\_us} > 0$):

   $$\text{frecuencia\_hz} = \frac{1\,000\,000}{\text{periodo\_us}}$$

   $$\text{velocidad\_inst\_kmh} = \frac{\text{frecuencia\_hz}}{\frac{\text{Pulsos/km}}{1000}} \times 3.6$$

2. **Decaimiento Matemático**:
   Si el vehículo está frenando, el tiempo transcurrido desde el último pulso validado ($\text{idle\_s}$) puede superar el período del último pulso activo ($\text{period\_s} = \text{periodo\_us} / 10^6$). Si $\text{idle\_s} > \text{period\_s} \times 1.5$, la velocidad se escala progresivamente a la baja:

   $$\text{decay\_factor} = \frac{\text{period\_s}}{\text{idle\_s}}$$

   $$\text{velocidad\_inst\_kmh} = \text{velocidad\_inst\_kmh} \times \text{decay\_factor}$$

3. **Filtro de Baja Frecuencia**:
   Se aplica un filtro paso bajo muy suave para suavizar la velocidad final frente a vibraciones del terreno:

   $$\text{velocidad\_kmh} = 0.75 \times \text{velocidad\_inst\_kmh} + 0.25 \times \text{velocidad\_kmh}$$

4. **Freno de Seguridad (Timeout)**:
   Si el vehículo se detiene por completo y no se detecta ningún pulso durante $\text{idle\_s} > 2.0$ segundos, la velocidad se clava a cero de forma absoluta ($\text{velocidad\_kmh} = 0.0$).

### 2.4 Cálculo de la Regularidad (Delta de Tiempo)
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
                [main.py (50Hz)] -> (Calcula wall_time_s, dist_m, diff_s)
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
* **`system_time`**: Hora rally en formato `HH:MM:SS.f` con precisión de décimas de segundo, corregida con el offset.
* **`distancia_m`**: Odómetro del tramo acumulado y calibrado (metros).
* **`diferencia_ideal_s`**: Delta de regularidad mostrado con precisión de centésimas/décimas de segundo (Ej. `+0.4s` o `-1.2s`).
* **`velocidad_kmh`**: Velocidad actual calculada mediante períodos hardware libres de aliasing.

