import asyncio
import json
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.hardware import setup_hardware_readers
from core.logger import rally_logger

app = FastAPI(title="Lebrel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SETTINGS_FILE = "settings.json"
default_settings = {
    "wheel_perimeter_m": 1.95,
    "theme": "dark",
    "font_size_offset": 0
}

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return default_settings

def save_settings(s):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(s, f)


# Maintain a list of active websocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Broadcast message to all connected clients
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass


manager = ConnectionManager()

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive commands from client (pilot/copilot)
            data = await websocket.receive_text()
            print(f"Received: {data}")
            if data == "ODO_RESET":
                rally_logger.log_event("RECALIBRACION_RESET")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/settings")
async def get_settings():
    return load_settings()

@app.post("/api/settings")
async def update_settings(request: Request):
    new_settings = await request.json()
    save_settings(new_settings)
    return {"status": "ok"}

# Montar frontend para que la Raspberry Pi lo sirva en la misma IP
app_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "2_APP")
app.mount("/", StaticFiles(directory=app_dir, html=True), name="static")


@app.on_event("startup")
async def startup_event():
    # Initialize background process that simulates reading telemetry at 10Hz
    # In reality, this communicates with hardware threads
    asyncio.create_task(hardware_loop())

async def hardware_loop():
    # 10 Hz telemetry loop (0.1s interval)
    print("Iniciando bucle de telemetría por hardware a 10Hz...")
    setup_hardware_readers()
    rally_logger.start_tramo("test")
    # Dummy variables for stage simulate
    dist_m = 0.0
    tiempo_tramo_s = 0.0
    
    # Mock de un tramo completo
    tramo_mock = [
        {"inicio_m": 0, "fin_m": 1500, "media_kmh": 49.9},
        {"inicio_m": 1500, "fin_m": 3500, "media_kmh": 52.0},
        {"inicio_m": 3500, "fin_m": 8000, "media_kmh": 45.0},
        {"inicio_m": 8000, "fin_m": 12000, "media_kmh": 60.0}
    ]
    
    while True:
        # Aquí recogerías los valores reales (odometría, velocidad, tiempo ideal, etc.)
        dist_m += 10.0 # Más rápido para que se vea cambiar (10m por iteración = rápido)
        if dist_m > 12000: dist_m = 0.0
        
        # Encontrar sector actual
        segment_idx = 0
        velocidad_objetivo_kmh = 0.0
        proxima_media_kmh = 0.0
        distancia_cambio_m = 0.0
        
        for i, sector in enumerate(tramo_mock):
            if dist_m >= sector["inicio_m"] and dist_m < sector["fin_m"]:
                segment_idx = i
                velocidad_objetivo_kmh = sector["media_kmh"]
                if i + 1 < len(tramo_mock):
                    proxima_media_kmh = tramo_mock[i+1]["media_kmh"]
                    distancia_cambio_m = sector["fin_m"] - dist_m
                break
                
        velocidad_kmh = 36.0
        diferencia_ideal_s = 0.5
        tiempo_tramo_s += 0.1
        
        telemetry = {
            "tramo_nombre": "TC-1: La Puebla",
            "distancia_m": dist_m,
            "tiempo_tramo_s": tiempo_tramo_s,
            "velocidad_kmh": velocidad_kmh,
            "velocidad_objetivo_kmh": velocidad_objetivo_kmh,
            "diferencia_ideal_s": diferencia_ideal_s,
            "proxima_media_kmh": proxima_media_kmh,
            "distancia_cambio_m": distancia_cambio_m,
            "segment_idx": segment_idx,
            "tramo_tabla": tramo_mock, # Puede optimizarse y no enviarse cada frame, sino solo 1 vez
        }
        
        rally_logger.log_telemetry(dist_m, diferencia_ideal_s, velocidad_kmh)
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    import uvicorn
    # En el coche probablemente quieres hostear esto en 0.0.0.0
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
