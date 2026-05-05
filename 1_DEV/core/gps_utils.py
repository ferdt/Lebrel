import math
import time

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0  # Metros
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    
    a = math.sin(dphi / 2)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def nmea_to_dec(value, direction):
    if not value: return 0.0
    try:
        dot_idx = value.find('.')
        if dot_idx < 0: return 0.0
        
        deg_len = dot_idx - 2
        degrees = float(value[:deg_len])
        minutes = float(value[deg_len:])
        
        decimal = degrees + (minutes / 60.0)
        if direction in ['S', 'W']:
            decimal = -decimal
        return decimal
    except:
        return 0.0

class GpsDistanceCalculator:
    def __init__(self):
        self.total_distance_m = 0.0
        self.delta_distance_m = 0.0
        self.last_lat = None
        self.last_lon = None
        self.last_update = 0

    def reset(self):
        self.total_distance_m = 0.0
        self.delta_distance_m = 0.0

    def get_delta_m(self):
        d = self.delta_distance_m
        self.delta_distance_m = 0.0
        return d

    def update(self, lat, lon, current_speed_kmh=0.0, min_speed_kmh=2.0):
        now = time.time()
        dist_added = 0.0
        
        if current_speed_kmh < min_speed_kmh:
            self.last_lat = lat
            self.last_lon = lon
            self.last_update = now
            return 0.0

        if self.last_lat is not None and self.last_lon is not None:
            dist = haversine(self.last_lat, self.last_lon, lat, lon)
            dt = now - self.last_update
            if dt > 0:
                speed_calc = dist / dt
                if dist > 0.1 and speed_calc < 60:
                    self.total_distance_m += dist
                    self.delta_distance_m += dist
                    dist_added = dist
                    
        self.last_lat = lat
        self.last_lon = lon
        self.last_update = now
        return dist_added
