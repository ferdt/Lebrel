import threading
import time
import asyncio
import struct
from core.gps_utils import GpsDistanceCalculator

try:
    from bleak import BleakScanner, BleakClient
    BLE_AVAILABLE = True
except ImportError:
    BLE_AVAILABLE = False

class GpsBleManager:
    def __init__(self, device_name="BL-1000GT"):
        self.device_name = device_name
        self.calc = GpsDistanceCalculator()
        self.status = "Not Installed" if not BLE_AVAILABLE else "Disconnected"
        self.is_running = False
        self._lock = threading.Lock()
        self.thread = None
        self.data = {
            "lat": 0.0, "lon": 0.0, "speed_kmh": 0.0, 
            "heading": 0.0, "sats": 0, "alt": 0.0, "fix": 0,
            "raw_hex": ""
        }
        self.log_file = "gps_raw.log"

    def start(self):
        if not BLE_AVAILABLE: return
        if self.is_running: return
        self.is_running = True
        self.thread = threading.Thread(target=self._run_async_loop, daemon=True)
        self.thread.start()

    def reset_distance(self):
        with self._lock: self.calc.reset()

    def get_distance(self):
        with self._lock:
            return self.calc.total_distance_m

    def get_delta(self):
        with self._lock:
            return self.calc.get_delta_m()

    def _run_async_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._main_task())

    async def _main_task(self):
        await asyncio.sleep(2)
        while self.is_running:
            try:
                self.status = "Scanning..."
                devices = await BleakScanner.discover(timeout=5.0)
                
                target = None
                for d in devices:
                    d_name = d.name or "Unknown"
                    if "qstarz" in d_name.lower() or self.device_name.lower() in d_name.lower():
                        target = d
                        break
                
                if target:
                    self.status = f"Found {target.name}"
                    try:
                        def on_disconnect(_):
                            self.status = "Disconnected"

                        async with BleakClient(target, timeout=20.0, disconnected_callback=on_disconnect) as client:
                            self.status = "Connected"
                            for s in client.services:
                                for c in s.characteristics:
                                    if "notify" in c.properties:
                                        await client.start_notify(c.uuid, self._notification_handler)
                            
                            while client.is_connected and self.is_running:
                                await asyncio.sleep(0.5)
                                
                    except Exception as e:
                        self.status = "Conn Error"
                        await asyncio.sleep(2)
                else:
                    self.status = "Searching..."
                    await asyncio.sleep(3)
            except Exception as e:
                err_msg = str(e)
                if "InProgress" in err_msg:
                    self.status = "Stack Busy"
                    await asyncio.sleep(10)
                else:
                    self.status = "Error"
                    await asyncio.sleep(5)

    def _notification_handler(self, sender, data):
        try:
            with self._lock:
                self.data["raw_hex"] = data.hex()
            
            # --- DECODIFICACIÓN BINARIA QSTARZ BL-1000GT ---
            
            # 1. Trama de Posición (RT Position)
            if data.startswith(b"\x03\x54") and len(data) >= 20:
                lat = struct.unpack('<d', data[4:12])[0]
                lon = struct.unpack('<f', data[16:20])[0]
                with self._lock:
                    if abs(lat) > 0.01:
                        self.data["lat"] = lat
                        self.data["lon"] = lon
                        # Usar velocidad actual para filtrar drift
                        cur_speed = self.data.get("speed_kmh", 0.0)
                        min_s = self.data.get("min_speed_threshold", 2.0)
                        self.calc.update(lat, lon, cur_speed, min_s)

            # 2. Trama de Dinámica (Speed, Alt, Heading) - Patrón F9 69
            elif len(data) >= 16 and data[2:4] == b"\xf9\x69":
                speed_ms = struct.unpack('<f', data[4:8])[0]
                alt = struct.unpack('<f', data[8:12])[0]
                heading = struct.unpack('<f', data[12:16])[0]
                with self._lock:
                    self.data["speed_kmh"] = max(0, speed_ms * 3.6)
                    self.data["alt"] = alt
                    self.data["heading"] = heading

            # 3. Trama de Estado (Sats, Fix)
            elif (data.startswith(b"\xfe") or data.startswith(b"\x13")) and len(data) >= 14:
                with self._lock:
                    self.data["sats"] = data[12]
                    self.data["fix"] = data[13]

        except:
            pass

gps_ble_manager = GpsBleManager()
