import asyncio
import json
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.hardware import setup_hardware_readers
from core.logger import rally_logger
from core.rally import tramo_manager

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

TRAMOS_FILE = "tramos.json"

def load_tramos():
    if os.path.exists(TRAMOS_FILE):
        with open(TRAMOS_FILE, "r") as f:
            return json.load(f)
    return []

def save_tramos(t):
    with open(TRAMOS_FILE, "w") as f:
        json.dump(t, f, indent=2)

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

# Tramo activo para cálculos en tiempo real
active_tramo: dict | None = None

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

@app.get("/api/tramos/active")
async def get_active_tramo():
    if active_tramo is None:
        return {"id": None}
    return {"id": active_tramo.get("id")}

@app.post("/api/tramos/active")
async def set_active_tramo(request: Request):
    global active_tramo
    body = await request.json()
    tramo_id = body.get("id")
    # Buscar el tramo completo en tramos.json
    all_tramos = load_tramos()
    found = next((t for t in all_tramos if t.get("id") == tramo_id), None)
    if not found:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Tramo no encontrado")
    active_tramo = found
    tramo_manager.set_active_tramo(found)  # Sincronizar con el motor de cálculo
    return {"status": "ok", "nombre": found.get("nombre")}

@app.get("/api/tramos")
async def get_tramos():
    return load_tramos()

@app.post("/api/tramos")
async def update_tramos(request: Request):
    new_tramos = await request.json()
    # Ordenar segmentos de cada tramo por inicio_m
    for tramo in new_tramos:
        if "segmentos" in tramo:
            tramo["segmentos"].sort(key=lambda s: s.get("inicio_m", 0))
    save_tramos(new_tramos)
    return {"status": "ok", "tramos": len(new_tramos)}


from fastapi.responses import RedirectResponse

@app.get("/")
async def root():
    return RedirectResponse(url="/piloto.html")

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
    dist_m = 0.0
    tiempo_tramo_s = 0.0

    # Mock de fallback si no hay tramo activo
    tramo_mock = [
        {"inicio_m": 0,    "fin_m": 1500,  "media_kmh": 49.9},
        {"inicio_m": 1500, "fin_m": 3500,  "media_kmh": 52.0},
        {"inicio_m": 3500, "fin_m": 8000,  "media_kmh": 45.0},
        {"inicio_m": 8000, "fin_m": 12000, "media_kmh": 60.0}
    ]

    while True:
        # Usar segmentos del tramo activo si existe, si no el mock
        segmentos = active_tramo["segmentos"] if active_tramo and active_tramo.get("segmentos") else tramo_mock
        tramo_nombre = active_tramo["nombre"] if active_tramo else "TC-DEMO"
        dist_max = segmentos[-1]["fin_m"] if segmentos else 12000

        # Sincronizar tramo_manager con los segmentos actuales
        if not tramo_manager.active_tramo or tramo_manager.get_segmentos() != segmentos:
            tramo_manager.set_active_tramo({"segmentos": segmentos})

        dist_m += 10.0
        if dist_m > dist_max: dist_m = 0.0
        tiempo_tramo_s += 0.1

        # ---- Cálculos de navegación ----
        seg_info = tramo_manager.get_current_segment_info(dist_m)
        diferencia_ideal_s = tramo_manager.calculate_interval(dist_m, tiempo_tramo_s)

        velocidad_kmh          = 36.0  # TODO: reemplazar con lectura real del hardware
        velocidad_objetivo_kmh = seg_info["velocidad_obj"]
        proxima_media_kmh      = seg_info["proxima_media"]
        distancia_cambio_m     = seg_info["distancia_cambio_m"]
        segment_idx            = seg_info["idx"]

        telemetry = {
            "tramo_nombre": tramo_nombre,
            "distancia_m": dist_m,
            "tiempo_tramo_s": tiempo_tramo_s,
            "velocidad_kmh": velocidad_kmh,
            "velocidad_objetivo_kmh": velocidad_objetivo_kmh,
            "diferencia_ideal_s": diferencia_ideal_s,
            "proxima_media_kmh": proxima_media_kmh,
            "distancia_cambio_m": distancia_cambio_m,
            "segment_idx": segment_idx,
            "tramo_tabla": segmentos,
        }
        
        rally_logger.log_telemetry(dist_m, diferencia_ideal_s, velocidad_kmh)
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    import uvicorn
    # En el coche probablemente quieres hostear esto en 0.0.0.0
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
