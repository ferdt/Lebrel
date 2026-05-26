// Firmware para ESP32 - Lebrel Odometer
// Lee pulsos de sondas inductivas y envía los contadores por Serial (USB) a la Raspberry Pi.

// --- DEFINICIÓN DE PINES ---
// Asegúrate de usar optoacopladores para bajar el voltaje de 12V (sonda) a 3.3V (ESP32)
const int SENSOR_1_PIN = 34; // Pin de entrada (pull-up/down externo requerido)
const int SENSOR_2_PIN = 35; // Pin de entrada (pull-up/down externo requerido)

// --- VARIABLES VOLÁTILES (para Interrupciones) ---
volatile unsigned long pulse_count_1 = 0;
volatile unsigned long pulse_count_2 = 0;

// Marca de tiempo del último pulso VALIDADO (en microsegundos)
volatile unsigned long last_micros_1 = 0;
volatile unsigned long last_micros_2 = 0;

// Período en microsegundos entre los dos últimos pulsos validados
volatile unsigned long pulse_period_1 = 0;
volatile unsigned long pulse_period_2 = 0;

// Filtro antirrebote adaptativo dinámico en microsegundos (inicia en 40ms)
volatile unsigned long debounce_micros_1 = 40000;
volatile unsigned long debounce_micros_2 = 40000;

// Constante de verificación de estabilidad para el filtro de ruido (glitch filter)
// Exige que la señal se mantenga estable durante 500 us (0.5 ms) en su nuevo estado
const unsigned long VERIFY_MICROS = 500;

// Variables para el registro de flancos mediante CHANGE
volatile unsigned long last_edge_micros_1 = 0;
volatile unsigned long last_edge_micros_2 = 0;
volatile int last_edge_state_1 = HIGH;
volatile int last_edge_state_2 = HIGH;
volatile bool edge_pending_1 = false;
volatile bool edge_pending_2 = false;

// Estado lógico filtrado (debouncificado) de los sensores
volatile int debounced_state_1 = HIGH;
volatile int debounced_state_2 = HIGH;

// --- RUTINAS DE INTERRUPCIÓN (ISR) ---
// IRAM_ATTR carga la función en la RAM para máxima velocidad
void IRAM_ATTR isr_sensor_1() {
  unsigned long current_micros = micros();
  
  // Evitar sobrecarga de la CPU (interrupt storms) por ráfagas de ruido extremo (>10 kHz)
  if (current_micros - last_edge_micros_1 < 100) {
    return;
  }
  
  last_edge_micros_1 = current_micros;
  last_edge_state_1 = digitalRead(SENSOR_1_PIN);
  edge_pending_1 = true;
}

void IRAM_ATTR isr_sensor_2() {
  unsigned long current_micros = micros();
  
  if (current_micros - last_edge_micros_2 < 100) {
    return;
  }
  
  last_edge_micros_2 = current_micros;
  last_edge_state_2 = digitalRead(SENSOR_2_PIN);
  edge_pending_2 = true;
}

// --- CONFIGURACIÓN ---
void setup() {
  // Velocidad a 115200 baudios (estándar rápido y estable)
  Serial.begin(115200);
  
  // Los pines 34 y 35 del ESP32 son solo de entrada y NO tienen pull-up interno.
  // El circuito optoacoplador debe proveer el nivel HIGH (3.3V) o LOW.
  pinMode(SENSOR_1_PIN, INPUT);
  pinMode(SENSOR_2_PIN, INPUT);

  // Inicializar los estados debouncificados a los valores físicos actuales
  debounced_state_1 = digitalRead(SENSOR_1_PIN);
  debounced_state_2 = digitalRead(SENSOR_2_PIN);

  // Adjuntar interrupciones en modo CHANGE para capturar todos los flancos de subida y bajada
  attachInterrupt(digitalPinToInterrupt(SENSOR_1_PIN), isr_sensor_1, CHANGE);
  attachInterrupt(digitalPinToInterrupt(SENSOR_2_PIN), isr_sensor_2, CHANGE);
}

// --- BUCLE PRINCIPAL ---
unsigned long last_send_time = 0;
const unsigned long SEND_INTERVAL_MS = 10; // Enviar datos cada 10ms (100Hz)

void loop() {
  unsigned long current_time = millis();
  unsigned long current_micros = micros();
  
  // --- MÁQUINA DE ESTADOS Y GLITCH FILTER - SONDA 1 ---
  if (edge_pending_1) {
    if (current_micros - last_edge_micros_1 >= VERIFY_MICROS) {
      int confirmed_state = digitalRead(SENSOR_1_PIN);
      
      // Confirmar estabilidad: si el estado físico coincide con el registrado por el flanco
      if (confirmed_state == last_edge_state_1) {
        // Si hay una transición real en el estado debouncificado
        if (confirmed_state != debounced_state_1) {
          debounced_state_1 = confirmed_state;
          
          // Solo contamos el flanco de bajada (FALLING) como pulso del odómetro
          if (debounced_state_1 == LOW) {
            if (last_micros_1 > 0) {
              pulse_period_1 = last_edge_micros_1 - last_micros_1;
              
              // Adaptar el debounce: 30% del periodo real, acotado entre 1.5ms y 40ms
              unsigned long next_debounce = pulse_period_1 / 3;
              if (next_debounce > 40000) next_debounce = 40000;
              if (next_debounce < 1500) next_debounce = 1500;
              debounce_micros_1 = next_debounce;
            }
            pulse_count_1++;
            last_micros_1 = last_edge_micros_1;
          }
        }
      }
      edge_pending_1 = false;
    }
  }

  // --- MÁQUINA DE ESTADOS Y GLITCH FILTER - SONDA 2 ---
  if (edge_pending_2) {
    if (current_micros - last_edge_micros_2 >= VERIFY_MICROS) {
      int confirmed_state = digitalRead(SENSOR_2_PIN);
      
      if (confirmed_state == last_edge_state_2) {
        if (confirmed_state != debounced_state_2) {
          debounced_state_2 = confirmed_state;
          
          if (debounced_state_2 == LOW) {
            if (last_micros_2 > 0) {
              pulse_period_2 = last_edge_micros_2 - last_micros_2;
              
              // Adaptar el debounce: 30% del periodo real, acotado entre 1.5ms y 40ms
              unsigned long next_debounce = pulse_period_2 / 3;
              if (next_debounce > 40000) next_debounce = 40000;
              if (next_debounce < 1500) next_debounce = 1500;
              debounce_micros_2 = next_debounce;
            }
            pulse_count_2++;
            last_micros_2 = last_edge_micros_2;
          }
        }
      }
      edge_pending_2 = false;
    }
  }

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
