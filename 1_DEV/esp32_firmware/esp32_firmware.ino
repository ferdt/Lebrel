// Firmware para ESP32 - Lebrel Odometer
// Lee pulsos de sondas inductivas y envía los contadores por Serial (USB) a la Raspberry Pi.

// --- DEFINICIÓN DE PINES ---
// Asegúrate de usar optoacopladores para bajar el voltaje de 12V (sonda) a 3.3V (ESP32)
const int SENSOR_1_PIN = 34; // Pin de entrada (pull-up/down externo requerido)
const int SENSOR_2_PIN = 35; // Pin de entrada (pull-up/down externo requerido)

// --- VARIABLES VOLÁTILES (para Interrupciones) ---
volatile unsigned long pulse_count_1 = 0;
volatile unsigned long pulse_count_2 = 0;

// Filtro antirrebote (Debounce) en microsegundos
// 500 us = 0.5 ms -> Permite hasta 2000 Hz, suficiente para cualquier sonda de rally
volatile unsigned long last_micros_1 = 0;
volatile unsigned long last_micros_2 = 0;
const unsigned long DEBOUNCE_MICROS = 500; 

// --- RUTINAS DE INTERRUPCIÓN (ISR) ---
// IRAM_ATTR carga la función en la RAM para máxima velocidad
void IRAM_ATTR isr_sensor_1() {
  unsigned long current_micros = micros();
  if (current_micros - last_micros_1 > DEBOUNCE_MICROS) {
    pulse_count_1++;
    last_micros_1 = current_micros;
  }
}

void IRAM_ATTR isr_sensor_2() {
  unsigned long current_micros = micros();
  if (current_micros - last_micros_2 > DEBOUNCE_MICROS) {
    pulse_count_2++;
    last_micros_2 = current_micros;
  }
}

// --- CONFIGURACIÓN ---
void setup() {
  // Velocidad a 115200 baudios (estándar rápido y estable)
  Serial.begin(115200);
  
  // Los pines 34 y 35 del ESP32 son solo de entrada y NO tienen pull-up interno.
  // El circuito optoacoplador debe proveer el nivel HIGH (3.3V) o LOW.
  pinMode(SENSOR_1_PIN, INPUT);
  pinMode(SENSOR_2_PIN, INPUT);

  // Adjuntar interrupciones en el flanco de bajada (FALLING) o subida (RISING)
  // Depende de cómo conectes el optoacoplador.
  attachInterrupt(digitalPinToInterrupt(SENSOR_1_PIN), isr_sensor_1, FALLING);
  attachInterrupt(digitalPinToInterrupt(SENSOR_2_PIN), isr_sensor_2, FALLING);
}

// --- BUCLE PRINCIPAL ---
unsigned long last_send_time = 0;
const unsigned long SEND_INTERVAL_MS = 50; // Enviar datos cada 50ms (20Hz)

void loop() {
  unsigned long current_time = millis();
  
  if (current_time - last_send_time >= SEND_INTERVAL_MS) {
    last_send_time = current_time;
    
    // Deshabilitar interrupciones brevemente para leer variables de 32 bits de forma segura
    noInterrupts();
    unsigned long p1 = pulse_count_1;
    unsigned long p2 = pulse_count_2;
    interrupts();
    
    // Formato de salida: S1:1234,S2:5678,T:987654321\n
    // Se incluye el timestamp micros() para que el receptor calcule deltas de tiempo sin jitter
    Serial.print("S1:");
    Serial.print(p1);
    Serial.print(",S2:");
    Serial.print(p2);
    Serial.print(",T:");
    Serial.println(micros());
  }
}
