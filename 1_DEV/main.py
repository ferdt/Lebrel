import asyncio
import json
import os
import time
import base64
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from core.hardware import setup_hardware_readers
from core.logger import rally_logger
from core.rally import tramo_manager

# --- OCR ENGINE (RapidOCR - IA) ---
try:
    import numpy as np
    import cv2
    from rapidocr_onnxruntime import RapidOCR
    rapid_ocr_engine = RapidOCR()
    print("✅ RapidOCR (AI) y OpenCV inicializados correctamente.", flush=True)
except Exception as e:
    rapid_ocr_engine = None
    print(f"⚠️ Error al cargar RapidOCR: {e}", flush=True)

# --- UTILIDADES OCR ---
def sort_boxes(dt_boxes, matched_texts, matched_scores):
    if dt_boxes is None or len(dt_boxes) == 0:
        return [], [], []
    items = []
    for i in range(len(dt_boxes)):
        box = np.array(dt_boxes[i], dtype=np.float32).reshape((4, 2))
        items.append({
            'box': box,
            'text': matched_texts[i],
            'score': matched_scores[i] if matched_scores else 1.0,
            'y_top': min(box[0][1], box[1][1]),
            'x_left': min(box[0][0], box[3][0])
        })
    items.sort(key=lambda x: x['y_top'])
    lines = []
    current_line = []
    if items:
        current_line.append(items[0])
        for i in range(1, len(items)):
            item = items[i]
            prev_item = current_line[-1]
            prev_height = abs(prev_item['box'][2][1] - prev_item['box'][0][1])
            if abs(item['y_top'] - prev_item['y_top']) < (prev_height * 0.5):
                current_line.append(item)
            else:
                lines.append(current_line); current_line = [item]
        lines.append(current_line)
    sorted_texts = []
    sorted_boxes = []
    for line in lines:
        line.sort(key=lambda x: x['x_left'])
        for it in line:
            sorted_texts.append(it['text'])
            sorted_boxes.append(it['box'])
    return sorted_boxes, sorted_texts, []

# --- APP FASTAPI ---
app = FastAPI(title="Lebrel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PERSISTENCIA ---
SETTINGS_FILE = "settings.json"
TRAMOS_FILE = "tramos.json"
CALIBRACIONES_FILE = "calibraciones.json"

default_settings = {
    "wheel_perimeter_m": 1.95,
    "theme": "dark",
    "font_size_offset": 0,
    "neutral_interval_s": 0.1,
    "odometer_source": "test",
    "rally_factor": 1.0,
    "pulses_km_1": 1540,
    "pulses_km_2": 1520
}

def load_tramos():
    if os.path.exists(TRAMOS_FILE):
        with open(TRAMOS_FILE, "r") as f:
            return json.load(f)
    return []

def save_tramos(t):
    with open(TRAMOS_FILE, "w") as f:
        json.dump(t, f, indent=2)

def load_calibraciones():
    if os.path.exists(CALIBRACIONES_FILE):
        with open(CALIBRACIONES_FILE, "r") as f:
            return json.load(f)
    return []

def save_calibraciones(c):
    with open(CALIBRACIONES_FILE, "w") as f:
        json.dump(c, f, indent=2)

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return default_settings

def save_settings(s):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(s, f, indent=2)
    except Exception as e:
        print(f"Error guardando ajustes: {e}")

# --- WEBSOCKETS ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# --- ESTADO GLOBAL ---
active_tramo: dict | None = None
test_speed_kmh = 0.0
test_dist_m = 0.0

# --- ENDPOINTS API ---

@app.get("/")
async def root():
    return RedirectResponse(url="/piloto.html")

@app.get("/api/settings")
async def get_settings():
    return load_settings()

@app.post("/api/settings")
async def update_settings(request: Request):
    new_settings = await request.json()
    save_settings(new_settings)
    return {"status": "ok"}

@app.get("/api/calibraciones")
async def get_calibraciones():
    return load_calibraciones()

@app.post("/api/calibraciones")
async def post_calibracion(data: dict):
    calibraciones = load_calibraciones()
    data["id"] = int(time.time())
    data["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    calibraciones.append(data)
    save_calibraciones(calibraciones)
    return data

@app.post("/api/calibraciones/apply")
async def apply_calibracion(data: dict):
    settings = load_settings()
    settings["rally_factor"] = data.get("rally_factor", 1.0)
    settings["pulses_km_1"] = data.get("pulses_km_1", 1540)
    settings["pulses_km_2"] = data.get("pulses_km_2", 1520)
    save_settings(settings)
    return {"status": "ok"}

@app.get("/api/tramos")
async def get_tramos():
    return load_tramos()

@app.post("/api/tramos")
async def update_tramos(request: Request):
    global active_tramo
    new_tramos = await request.json()
    for tramo in new_tramos:
        if "segmentos" in tramo:
            tramo["segmentos"].sort(key=lambda s: s.get("inicio_m", 0))
    save_tramos(new_tramos)
    
    # Si el tramo que acabamos de guardar es el que está activo, refrescarlo
    if active_tramo:
        refreshed = next((t for t in new_tramos if t.get("id") == active_tramo.get("id")), None)
        if refreshed:
            active_tramo = refreshed
            tramo_manager.set_active_tramo(refreshed)
            
    return {"status": "ok"}

@app.get("/api/tramos/active")
async def get_active_tramo():
    return {"id": active_tramo.get("id") if active_tramo else None}

@app.post("/api/tramos/active")
async def set_active_tramo(request: Request):
    global active_tramo
    body = await request.json()
    tramo_id = body.get("id")
    all_tramos = load_tramos()
    found = next((t for t in all_tramos if t.get("id") == tramo_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Tramo no encontrado")
    active_tramo = found
    tramo_manager.set_active_tramo(found)
    return {"status": "ok", "nombre": found.get("nombre")}

@app.post("/api/tramos/import_tablitos")
async def import_tablitos(request: Request):
    changes = await request.json()
    tramos = load_tramos()
    tramo_tablas = next((t for t in tramos if t["nombre"].upper() == "TABLAS"), None)
    if not tramo_tablas:
        tramo_tablas = {"id": "tablas_ocr", "nombre": "Tablas", "hora_inicio": "00:00:00.0", "segmentos": []}
        tramos.append(tramo_tablas)
    
    new_segments = []
    for c in changes:
        new_segments.append({
            "inicio_m": round(float(c["dist_from"]) * 1000),
            "fin_m": round(float(c["dist_to"]) * 1000),
            "media_kmh": float(c["speed"])
        })
    tramo_tablas["segmentos"] = new_segments
    save_tramos(tramos)

    # Si estamos en el tramo de "Tablas", refrescar el motor activo
    if active_tramo and active_tramo.get("nombre").upper() == "TABLAS":
        active_tramo = tramo_tablas
        tramo_manager.set_active_tramo(tramo_tablas)

    return {"status": "ok", "count": len(new_segments)}

@app.post("/api/test/speed")
async def set_test_speed(request: Request):
    global test_speed_kmh
    body = await request.json()
    test_speed_kmh = float(body.get("speed", 0.0))
    return {"status": "ok"}

@app.post("/ocr")
async def process_ocr(request: Request):
    if not rapid_ocr_engine:
        return {"error": "RapidOCR AI engine not available [v6-AI]"}
    
    try:
        data = await request.json()
        image_data = data.get('image', '')
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"error": "Failed to decode image"}

        start_time = time.time()
        result, elapse = rapid_ocr_engine(img)
        
        detected_text = ""
        if result:
            boxes = [line[0] for line in result]
            texts = [line[1] for line in result]
            scores = [line[2] for line in result]
            _, sorted_texts, _ = sort_boxes(boxes, texts, scores)
            detected_text = "\n".join(sorted_texts)
        
        _, buffer = cv2.imencode('.jpg', img)
        processed_image_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            'text': detected_text,
            'processed_image': f"data:image/jpeg;base64,{processed_image_b64}",
            'execution_time': time.time() - start_time
        }
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    global test_dist_m
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ODO_RESET":
                test_dist_m = 0.0
                rally_logger.log_event("RECALIBRACION_RESET")
            elif data == "MILESTONE":
                rally_logger.log_event("HITO_MANUAL")
            elif data.startswith("DIST_ADJUST:"):
                try:
                    delta = float(data.split(":")[1])
                    test_dist_m += delta
                    rally_logger.log_event(f"AJUSTE_DISTANCIA:{delta}")
                except:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- MONTAR FRONTEND ---
current_file = Path(__file__).resolve()
repo_root = current_file.parent.parent.parent
app_dir = repo_root / "Lebrel" / "2_APP"
tablitos_dir = repo_root / "Tablitos" / "public"

if tablitos_dir.exists():
    app.mount("/tablitos", StaticFiles(directory=str(tablitos_dir), html=True), name="tablitos")

app.mount("/", StaticFiles(directory=str(app_dir), html=True), name="static")

# --- BUCLE DE HARDWARE ---
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(hardware_loop())

async def hardware_loop():
    global test_dist_m
    print("🚀 Iniciando bucle de telemetría a 10Hz...", flush=True)
    setup_hardware_readers()
    rally_logger.start_tramo("test")
    
    dist_m = 0.0
    tiempo_tramo_s = 0.0
    tramo_mock = [{"inicio_m": 0, "fin_m": 12000, "media_kmh": 45.0}]

    while True:
        # 1. Obtener Hora Actual del Sistema (segundos desde medianoche)
        now = datetime.now()
        wall_time_s = now.hour * 3600 + now.minute * 60 + now.second + now.microsecond / 1_000_000

        settings = load_settings()
        odo_source = settings.get("odometer_source", "test")
        
        segmentos = active_tramo["segmentos"] if active_tramo and active_tramo.get("segmentos") else tramo_mock
        tramo_nombre = active_tramo["nombre"] if active_tramo else "TC-DEMO"
        hora_inicio_str = active_tramo.get("hora_inicio", "00:00:00.0") if active_tramo else "00:00:00.0"
        
        if not tramo_manager.active_tramo or tramo_manager.get_segmentos() != segmentos:
            tramo_manager.set_active_tramo({"segmentos": segmentos})

        # 2. Calcular Distancia y Tiempo elapsado real
        settings = load_settings()
        rally_factor = settings.get("rally_factor", 1.0)
        p_km_1 = settings.get("pulses_km_1", 1540)
        
        if odo_source == "test":
            test_dist_m += (test_speed_kmh / 3.6) * 0.1
            # Mocks para calibración (datos brutos)
            dist_gps_m = test_dist_m * 0.998
            pulses_1 = int(test_dist_m * 1.54)
            pulses_2 = int(test_dist_m * 1.52)
            
            # Aplicar calibración para obtener la distancia del rally
            # Si usamos GPS como base:
            dist_m = dist_gps_m * rally_factor
        else:
            # Simulación hardware real
            dist_m += 1.0  
            velocidad_kmh = 36.0
            dist_gps_m = dist_m / rally_factor
            pulses_1 = int(dist_m * (p_km_1 / 1000))
            pulses_2 = int(dist_m * 1.53)

        # El tiempo elapsado ahora es dinámico respecto a la salida
        start_seconds = tramo_manager.parse_time_to_seconds(hora_inicio_str)
        tiempo_tramo_s = wall_time_s - start_seconds

        seg_info = tramo_manager.get_current_segment_info(dist_m)
        diff_s = tramo_manager.calculate_interval(dist_m, wall_time_s, hora_inicio_str)

        telemetry = {
            "tramo_nombre": tramo_nombre,
            "distancia_m": dist_m,
            "dist_gps_m": dist_gps_m,
            "pulses_1": pulses_1,
            "pulses_2": pulses_2,
            "rally_factor": rally_factor,
            "pulses_km_1": p_km_1,
            "tiempo_tramo_s": tiempo_tramo_s,
            "velocidad_kmh": velocidad_kmh,
            "velocidad_objetivo_kmh": seg_info["velocidad_obj"],
            "diferencia_ideal_s": diff_s,
            "proxima_media_kmh": seg_info["proxima_media"],
            "distancia_cambio_m": seg_info["distancia_cambio_m"],
            "odo_source": odo_source,
            "neutral_interval_s": settings.get("neutral_interval_s", 0.1),
            "tramo_tabla": segmentos,
            "segment_idx": seg_info["idx"],
            "hora_inicio_tramo": active_tramo.get("hora_inicio", "00:00:00.0") if active_tramo else "00:00:00.0",
            "system_time": now.strftime("%H:%M:%S"),
            "tramo_id": active_tramo.get("id") if active_tramo else None
        }
        
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
