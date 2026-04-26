import csv
import os
import time
from datetime import datetime

class RallyLogger:
    def __init__(self, logs_dir="logs"):
        self.logs_dir = logs_dir
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)
            
        self.current_tramo_log = None
        self.log_file = None
        self.csv_writer = None

    def start_tramo(self, tramo_id="default"):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_tramo_log = os.path.join(self.logs_dir, f"tramo_{tramo_id}_{timestamp}.csv")
        
        self.log_file = open(self.current_tramo_log, 'w', newline='')
        self.csv_writer = csv.writer(self.log_file)
        # Headers del log
        self.csv_writer.writerow(["Timestamp", "Evento", "Distancia_m", "Diferencia_Ideal_s", "Velocidad_kmh", "Detalles"])
        self.log_file.flush()

    def log_telemetry(self, dist, diff, vel):
        if self.csv_writer:
            ts = datetime.now().isoformat()
            self.csv_writer.writerow([ts, "TELEMETRY", f"{dist:.2f}", f"{diff:.2f}", f"{vel:.1f}", ""])
            # Flush frequently or let close handle it? We flush periodically to avoid data loss on crash
            self.log_file.flush()

    def log_event(self, event_name, dist=0.0, diff=0.0, vel=0.0, details=""):
        if self.csv_writer:
            ts = datetime.now().isoformat()
            self.csv_writer.writerow([ts, event_name, f"{dist:.2f}", f"{diff:.2f}", f"{vel:.1f}", details])
            self.log_file.flush()

    def stop_tramo(self):
        if self.log_file:
            self.log_file.close()
            self.log_file = None
            self.csv_writer = None

rally_logger = RallyLogger()
