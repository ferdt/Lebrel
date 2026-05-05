import socket
import threading
import time
from core.gps_utils import nmea_to_dec, GpsDistanceCalculator

class GpsTcpManager:
    def __init__(self, port=5000):
        self.port = port
        self.calc = GpsDistanceCalculator()
        self.is_running = False
        self.status = "Disconnected"
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
            self.calc.reset()

    def get_distance(self):
        with self._lock:
            return self.calc.total_distance_m

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

        if line.startswith('$GPRMC') or line.startswith('$GNRMC'):
            parts = line.split(',')
            if len(parts) < 7:
                return
            
            status = parts[2]
            if status != 'A':
                return
            
            try:
                lat_raw = parts[3]
                lat_dir = parts[4]
                lon_raw = parts[5]
                lon_dir = parts[6]
                
                if not lat_raw or not lon_raw:
                    return

                lat = nmea_to_dec(lat_raw, lat_dir)
                lon = nmea_to_dec(lon_raw, lon_dir)
                
                with self._lock:
                    self.calc.update(lat, lon)
            except:
                pass

gps_tcp_manager = GpsTcpManager()
