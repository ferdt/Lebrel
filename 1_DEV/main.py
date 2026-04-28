import asyncio
import json
import os
import time
import base64
import numpy as np
import cv2
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.hardware import setup_hardware_readers
from core.logger import rally_logger
from core.rally import tramo_manager

# OCR Engines
try:
    from rapidocr_onnxruntime import RapidOCR
    rapid_ocr_engine = RapidOCR()
    print("RapidOCR inicializado correctamente.")
except ImportError:
    rapid_ocr_engine = None
    print("ADVERTENCIA: rapidocr_onnxruntime no instalado. El OCR no funcionará.")

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
    "font_size_offset": 0,
    "neutral_interval_s": 0.1,
    "odometer_source": "test"
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
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(s, f, indent=2)
    except Exception as e:
        print(f"Error guardando ajustes: {e}")


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

# Variables para el simulador de test
test_speed_kmh = 0.0
test_dist_m = 0.0

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    global test_dist_m
    await manager.connect(websocket)
    try:
        while True:
            # Receive commands from client (pilot/copilot)
            data = await websocket.receive_text()
            print(f"Received: {data}")
            if data == "ODO_RESET":
                test_dist_m = 0.0
                rally_logger.log_event("RECALIBRACION_RESET")
            elif data.startswith("DIST_ADJUST:"):
                try:
                    delta = float(data.split(":")[1])
                    test_dist_m += delta
                    rally_logger.log_event(f"AJUSTE_DISTANCIA:{delta}")
                except:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/settings")
async def get_settings():
    return load_settings()

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

@app.post("/ocr")
async def process_ocr(request: Request):
    if not rapid_ocr_engine:
        return {"error": "OCR engine not available on this server"}
    
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
    
    execution_time = time.time() - start_time
    
    # Debug image (opcional, para Tablitos)
    _, buffer = cv2.imencode('.jpg', img)
    processed_image_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        'text': detected_text,
        'processed_image': f"data:image/jpeg;base64,{processed_image_b64}",
        'execution_time': execution_time
    }

@app.post("/api/settings")
async def update_settings(request: Request):
    new_settings = await request.json()
    save_settings(new_settings)
    return {"status": "ok"}

@app.post("/api/tramos/import_tablitos")
async def import_tablitos(request: Request):
    """
    Recibe una lista de cambios de velocidad de Tablitos:
    [{dist_from: 0, dist_to: 1.2, speed: 45}, ...]
    Y lo convierte en segmentos de un tramo llamado 'Tablas'.
    """
    changes = await request.json()
    tramos = load_tramos()
    
    # Buscar o crear el tramo de tablas
    tramo_tablas = next((t for t in tramos if t["nombre"].upper() == "TABLAS"), None)
    if not tramo_tablas:
        tramo_tablas = {
            "id": "tablas_ocr",
            "nombre": "Tablas",
            "hora_inicio": "00:00:00.0",
            "segmentos": []
        }
        tramos.append(tramo_tablas)
    
    # Convertir cambios a segmentos
    new_segments = []
    for c in changes:
        new_segments.append({
            "inicio_m": round(float(c["dist_from"]) * 1000),
            "fin_m": round(float(c["dist_to"]) * 1000),
            "media_kmh": float(c["speed"])
        })
    
    tramo_tablas["segmentos"] = new_segments
    save_tramos(tramos)
    return {"status": "ok", "count": len(new_segments)}

@app.post("/api/test/speed")
async def set_test_speed(request: Request):
    global test_speed_kmh
    body = await request.json()
    test_speed_kmh = float(body.get("speed", 0.0))
    return {"status": "ok", "speed": test_speed_kmh}

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

from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

# Configurar CORS para permitir peticiones desde el mismo host o Tablitos
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas de frontend
current_file = Path(__file__).resolve()
repo_root = current_file.parent.parent.parent # c:\repo
app_dir = repo_root / "Lebrel" / "2_APP"
tablitos_dir = repo_root / "Tablitos" / "public"

if tablitos_dir.exists():
    print(f"Montando Tablitos desde: {tablitos_dir}")
    app.mount("/tablitos", StaticFiles(directory=str(tablitos_dir), html=True), name="tablitos")
else:
    print(f"ERROR: No se encontró Tablitos en {tablitos_dir}")

app.mount("/", StaticFiles(directory=str(app_dir), html=True), name="static")


@app.on_event("startup")
async def startup_event():
    # Initialize background process that simulates reading telemetry at 10Hz
    # In reality, this communicates with hardware threads
    asyncio.create_task(hardware_loop())

async def hardware_loop():
    global test_dist_m
    # 10 Hz telemetry loop (0.1s interval)
    print("Iniciando bucle de telemetría por hardware a 10Hz...")
    setup_hardware_readers()
    rally_logger.start_tramo("test")
    
    # distance and time for the actual calculation
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
        settings = load_settings()
        odo_source = settings.get("odometer_source", "test") # default test for convenience

        # Usar segmentos del tramo activo si existe, si no el mock
        segmentos = active_tramo["segmentos"] if active_tramo and active_tramo.get("segmentos") else tramo_mock
        tramo_nombre = active_tramo["nombre"] if active_tramo else "TC-DEMO"
        dist_max = segmentos[-1]["fin_m"] if segmentos else 12000

        # Sincronizar tramo_manager con los segmentos actuales
        if not tramo_manager.active_tramo or tramo_manager.get_segmentos() != segmentos:
            tramo_manager.set_active_tramo({"segmentos": segmentos})

        if odo_source == "test":
            # Incremento basado en velocidad de test (km/h -> m/s * 0.1s)
            delta_dist = (test_speed_kmh / 3.6) * 0.1
            test_dist_m += delta_dist
            dist_m = test_dist_m
            velocidad_kmh = test_speed_kmh
        else:
            # Mock de hardware real (o GPS/Ruedas)
            dist_m += 10.0
            if dist_m > dist_max: dist_m = 0.0
            velocidad_kmh = 36.0 # Mock

        tiempo_tramo_s += 0.1

        # ---- Cálculos de navegación ----
        seg_info = tramo_manager.get_current_segment_info(dist_m)
        diferencia_ideal_s = tramo_manager.calculate_interval(dist_m, tiempo_tramo_s)

        telemetry = {
            "tramo_nombre": tramo_nombre,
            "hora_inicio_tramo": active_tramo.get("hora_inicio", "") if active_tramo else "",
            "distancia_m": dist_m,
            "tiempo_tramo_s": tiempo_tramo_s,
            "velocidad_kmh": velocidad_kmh,
            "velocidad_objetivo_kmh": seg_info["velocidad_obj"],
            "diferencia_ideal_s": diferencia_ideal_s,
            "proxima_media_kmh": seg_info["proxima_media"],
            "distancia_cambio_m": seg_info["distancia_cambio_m"],
            "segment_idx": seg_info["idx"],
            "tramo_tabla": segmentos,
            "odo_source": odo_source,
            "neutral_interval_s": settings.get("neutral_interval_s", 0.1)
        }
        
        rally_logger.log_telemetry(dist_m, diferencia_ideal_s, velocidad_kmh)
        await manager.broadcast(telemetry)
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    import uvicorn
    # En el coche probablemente quieres hostear esto en 0.0.0.0
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
