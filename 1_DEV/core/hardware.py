import serial
import threading
import time

class ESP32Reader:
    def __init__(self, port='/dev/ttyUSB0', baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.serial = None
        self.running = False
        
        # Guardamos la cantidad TOTAL de pulsos enviados por el ESP32
        self.pulses_1 = 0
        self.pulses_2 = 0
        self.esp32_micros = 0
        self.period_1 = 0 # Período en microsegundos del último pulso
        self.period_2 = 0
        self.lock = threading.Lock() # Candado para lectura/escritura atómica de múltiples hilos
        
    def start(self):
        if self.running:
            return # Ya está corriendo, evitar duplicar hilos y saturar logs
        self.running = True
        threading.Thread(target=self._read_loop, daemon=True).start()
            
    def stop(self):
        self.running = False
        if self.serial:
            self.serial.close()

    def _find_esp32_port(self):
        import glob
        # Lista de puertos potenciales en Linux
        potential_ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
        if self.port in potential_ports:
            return self.port # Preferir el configurado
        if potential_ports:
            return potential_ports[0] # Devolver el primero encontrado
        return None

    def _read_loop(self):
        while self.running:
            if not self.serial or not self.serial.is_open:
                try:
                    # Auto-detección de puerto si el configurado falla
                    current_port = self._find_esp32_port()
                    if not current_port:
                        # Si no hay ningún puerto, esperar pacientemente sin saturar los logs
                        print(f"⚠️ No se detecta ningún ESP32 (ttyUSB/ttyACM) conectado...")
                        time.sleep(5)
                        continue
                    
                    self.serial = serial.Serial(current_port, self.baudrate, timeout=1)
                    print(f"✅ Conectado al ESP32 en {current_port}")
                except Exception as e:
                    print(f"⚠️ Esperando al ESP32... ({e})")
                    time.sleep(5) # Dormir 5 segundos para evitar flood de logs
                    continue

            try:
                line = self.serial.readline()
                if line:
                    decoded = line.decode('utf-8').strip()
                    self._parse_line(decoded)
            except Exception as e:
                print(f"⚠️ Error leyendo del ESP32: {e}")
                self.serial.close()
                self.serial = None
                time.sleep(1)

    def get_latest_data(self):
        # Devolvemos los 7 valores atómicamente protegidos por el candado
        with self.lock:
            return self.pulses_1, self.pulses_2, self.esp32_micros, self.period_1, self.period_2, getattr(self, "last_micros_1", 0), getattr(self, "last_micros_2", 0)

    def _parse_line(self, line):
        # Formato esperado ampliado: S1:123,S2:456,P1:20000,P2:0,L1:12345,L2:0,T:987654321
        try:
            # Parseo robusto basado en clave-valor
            parsed = {}
            parts = line.split(',')
            for part in parts:
                if ':' in part:
                    kv = part.split(':', 1)
                    parsed[kv[0]] = int(kv[1])
            
            # Extraemos los contadores obligatorios
            if "S1" in parsed and "S2" in parsed:
                p1 = parsed["S1"]
                p2 = parsed["S2"]
                
                # Extraemos los opcionales con fallback seguro
                p_micros = parsed.get("T", self.esp32_micros)
                per1 = parsed.get("P1", 0)
                per2 = parsed.get("P2", 0)
                l1 = parsed.get("L1", 0)
                l2 = parsed.get("L2", 0)

                # Asignación atómica absoluta garantizada
                with self.lock:
                    self.pulses_1 = p1
                    self.pulses_2 = p2
                    self.esp32_micros = p_micros
                    self.period_1 = per1
                    self.period_2 = per2
                    self.last_micros_1 = l1
                    self.last_micros_2 = l2
        except Exception as e:
            pass # Ignorar líneas corruptas

# Instancia global para ser usada en main.py
esp32_reader = ESP32Reader()

def setup_hardware_readers():
    # Inicializar el lector del ESP32 en un hilo en background
    print("Inicializando comunicación con ESP32 (Sondas Odómetro)...")
    esp32_reader.start()

class Odometer:
    def __init__(self):
        self.distance = 0.0
        self.calibration_factor = 1.0
        
    def add_ticks(self, count):
        self.distance += count * self.calibration_factor
        
    def set_calibration(self, factor):
        self.calibration_factor = factor
        
    def get_distance(self):
        return self.distance
