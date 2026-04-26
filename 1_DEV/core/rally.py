class TramoManager:
    def __init__(self):
        self.tramos = []
        self.active_tramo = None
        
    def load_tramos(self, file_path):
        # Pandas for processing CSV or standard Python for JSON/XML
        pass
        
    def calculate_ideal_time(self, current_distance):
        # Calculate expected time based on current_distance vs medias del tramo
        if not self.active_tramo:
            return 0.0
        return 0.0
