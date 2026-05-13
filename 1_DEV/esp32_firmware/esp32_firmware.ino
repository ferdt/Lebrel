// Firmware para ESP32 - Lebrel Odometer
// Lee pulsos de sondas inductivas y envía los contadores por Serial (USB) a la Raspberry Pi.

// --- DEFINICIÓN DE PINES ---
// Asegúrate de usar optoacopladores para bajar el voltaje de 12V (sonda) a 3.3V (ESP32)
const int SENSOR_1_PIN = 34; // Pin de entrada (pull-up/down externo requerido)
const int SENSOR_2_PIN = 35; // Pin de entrada (pull-up/down externo requerido)

// --- VARIABLES VOLÁTILES (para Interrupciones) ---
volatile unsigned long pulse_count_1 = 0;
volatile unsigned long pulse_count_2 = 0;

// Marca de tiempo del último pulso capturado (en microsegundos)
volatile unsigned long last_micros_1 = 0;
volatile unsigned long last_micros_2 = 0;

// Período en microsegundos entre los dos últimos pulsos
volatile unsigned long pulse_period_1 = 0;
volatile unsigned long pulse_period_2 = 0;

// Filtro antirrebote (Debounce) en microsegundos
// 500 us = 0.5 ms -> Permite hasta 2000 Hz, suficiente para cualquier sonda de rally
const unsigned long DEBOUNCE_MICROS = 500; 

// --- RUTINAS DE INTERRUPCIÓN (ISR) ---
// IRAM_ATTR carga la función en la RAM para máxima velocidad
void IRAM_ATTR isr_sensor_1() {
  unsigned long current_micros = micros();
  if (current_micros - last_micros_1 > DEBOUNCE_MICROS) {
    // Si es el primer pulso tras el inicio, no calculamos período
    if (last_micros_1 > 0) {
      pulse_period_1 = current_micros - last_micros_1;
    }
    pulse_count_1++;
    last_micros_1 = current_micros;
  }
}

void IRAM_ATTR isr_sensor_2() {
  unsigned long current_micros = micros();
  if (current_micros - last_micros_2 > DEBOUNCE_MICROS) {
    if (last_micros_2 > 0) {
      pulse_period_2 = current_micros - last_micros_2;
    }
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
const unsigned long SEND_INTERVAL_MS = 10; // Enviar datos cada 10ms (100Hz)

void loop() {
  unsigned long current_time = millis();
  
  if (current_time - last_send_time >= SEND_INTERVAL_MS) {
    last_send_time = current_time;
    
    // Deshabilitar interrupciones brevemente para leer variables volátiles de forma segura
    noInterrupts();
    unsigned long p1 = pulse_count_1;
    unsigned long p2 = pulse_count_2;
    unsigned long per1 = pulse_period_1;
    unsigned long per2 = pulse_period_2;
    unsigned long last1 = last_micros_1;
    unsigned long last2 = last_micros_2;
    interrupts();
    
    unsigned long now_micros = micros();
    
    // El timeout duro ha sido ELIMINADO para no destruir la velocidad a bajas frecuencias.
    // En su lugar, enviamos 'L1' y 'L2' (timestamp del último pulso) para que Python
    // gestione un decaimiento analógico progresivo e inteligente.
    
    // Formato de salida ampliado: S1:123,S2:456,P1:20000,P2:0,L1:12345,L2:0,T:987654321
    Serial.print("S1:");
    Serial.print(p1);
    Serial.print(",S2:");
    Serial.print(p2);
    Serial.print(",P1:");
    Serial.print(per1);
    Serial.print(",P2:");
    Serial.print(per2);
    Serial.print(",L1:");
    Serial.print(last1);
    Serial.print(",L2:");
    Serial.print(last2);
    Serial.print(",T:");
    Serial.println(now_micros);
  }
}
