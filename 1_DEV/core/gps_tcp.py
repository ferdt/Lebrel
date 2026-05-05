import socket
import threading
import math
import time

class GpsTcpManager:
    def __init__(self, port=5000):
        self.port = port
        self.total_distance_m = 0.0
        self.last_lat = None
        self.last_lon = None
        self.is_running = False
        self.status = "Disconnected"
        self.last_update = 0
        self._lock = threading.Lock()
        self.thread = None

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._server_loop, daemon=True)
        self.thread.start()
        print(f"📡 GPS TCP Server started on port {self.port}")

    def stop(self):
        self.is_running = False

    def reset_distance(self):
        with self._lock:
            self.total_distance_m = 0.0
            # No reseteamos last_lat/lon para evitar saltos en el siguiente punto
            # Pero si queremos un reset total "borrón y cuenta nueva":
            # self.last_lat = None
            # self.last_lon = None

    def get_distance(self):
        with self._lock:
            return self.total_distance_m

    def _server_loop(self):
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server_socket.bind(('0.0.0.0', self.port))
            server_socket.listen(1)
            server_socket.settimeout(2.0)
        except Exception as e:
            print(f"❌ Error binding GPS TCP port {self.port}: {e}")
            self.status = f"Error: {e}"
            return

        while self.is_running:
            try:
                client_socket, addr = server_socket.accept()
                print(f"✅ GPS Tablet connected from {addr}")
                self.status = "Connected"
                client_socket.settimeout(5.0)
                
                buffer = ""
                while self.is_running:
                    try:
                        data = client_socket.recv(4096).decode('utf-8', errors='ignore')
                        if not data:
                            break
                        
                        buffer += data
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            self._parse_nmea(line.strip())
                            
                    except socket.timeout:
                        continue
                    except Exception as e:
                        print(f"⚠️ GPS Socket error: {e}")
                        break
                
                client_socket.close()
                print(f"❌ GPS Tablet disconnected")
                self.status = "Disconnected"
                
            except socket.timeout:
                continue
            except Exception as e:
                if self.is_running:
                    print(f"⚠️ GPS Server loop error: {e}")
                time.sleep(1)

        server_socket.close()

    def _parse_nmea(self, line):
        if not line.startswith('$'):
            return

        # Solo nos interesa GPRMC para posición y validez
        # $GPRMC,hhmmss.ss,A,llll.ll,a,yyyyy.yy,a,v.v,d.d,ddmmyy,,,a*hh
        if line.startswith('$GPRMC') or line.startswith('$GNRMC'):
            parts = line.split(',')
            if len(parts) < 7:
                return
            
            status = parts[2]
            if status != 'A': # A = Active (Valid), V = Void (Invalid)
                return
            
            try:
                lat_raw = parts[3]
                lat_dir = parts[4]
                lon_raw = parts[5]
                lon_dir = parts[6]
                
                if not lat_raw or not lon_raw:
                    return

                lat = self._nmea_to_dec(lat_raw, lat_dir)
                lon = self._nmea_to_dec(lon_raw, lon_dir)
                
                self._update_position(lat, lon)
            except Exception as e:
                # print(f"Error parsing NMEA: {e}")
                pass

    def _nmea_to_dec(self, value, direction):
        if not value: return 0.0
        # Lat: DDMM.MMMMM -> 2 digits for degrees
        # Lon: DDDMM.MMMMM -> 3 digits for degrees
        # We detect based on decimal point position or string length
        dot_idx = value.find('.')
        if dot_idx < 0: return 0.0
        
        deg_len = dot_idx - 2
        degrees = float(value[:deg_len])
        minutes = float(value[deg_len:])
        
        decimal = degrees + (minutes / 60.0)
        if direction in ['S', 'W']:
            decimal = -decimal
        return decimal

    def _update_position(self, lat, lon):
        with self._lock:
            now = time.time()
            if self.last_lat is not None and self.last_lon is not None:
                # Calcular distancia Haversine
                dist = self._haversine(self.last_lat, self.last_lon, lat, lon)
                
                # Filtrar ruido (si es menos de 0.5m o velocidad absurda, ignorar)
                dt = now - self.last_update
                if dt > 0:
                    speed = dist / dt
                    if dist > 0.3 and speed < 60: # Menos de 216 km/h (60 m/s)
                        self.total_distance_m += dist
                
            self.last_lat = lat
            self.last_lon = lon
            self.last_update = now

    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371000.0 # Metros
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        
        a = math.sin(dphi / 2)**2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

gps_tcp_manager = GpsTcpManager()
