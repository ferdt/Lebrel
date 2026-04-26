def setup_hardware_readers():
    # Aquí iría el código real para inicializar serial ports, gps, GPIO...
    pass

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
