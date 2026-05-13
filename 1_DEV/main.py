from fastapi import FastAPI
app = FastAPI(title="Lebrel Backend")

import asyncio
import json
import os
import time
import base64
import subprocess
from datetime import datetime
from pathlib import Path

from core.hardware import setup_hardware_readers, esp32_reader
from core.logger import rally_logger
from core.rally import tramo_manager

# --- APP FASTAPI ---
from fastapi import WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GPS MODULES ---
try:
    from core.gps_tcp import gps_tcp_manager
except Exception as e:
    print(f"⚠️ Error al cargar gps_tcp: {e}")
    gps_tcp_manager = None

try:
    from core.gps_ble import gps_ble_manager
except Exception as e:
    print(f"⚠️ Error al cargar gps_ble: {e}")
    gps_ble_manager = None

# --- OCR ENGINE (RapidOCR - IA) ---
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

try:
    import numpy as np
    import cv2
    from rapidocr_onnxruntime import RapidOCR
    rapid_ocr_engine = RapidOCR()
    print("✅ RapidOCR (AI) y OpenCV inicializados correctamente con 1 hilo.", flush=True)
except Exception as e:
    rapid_ocr_engine = None
    print(f"⚠️ Error al cargar RapidOCR: {e}", flush=True)

# --- VARIABLES GLOBALES DE SIMULACIÓN (TEST) ---
test_speed_kmh = 0.0
test_pulses_1 = 0.0
test_pulses_2 = 0.0
test_dist_gps = 0.0
test_dist_m = 0.0

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

# --- PERSISTENCIA ---
SETTINGS_FILE = "settings.json"
TRAMOS_FILE = "tramos.json"
CALIBRACIONES_FILE = "calibraciones.json"

default_settings = {
    "wheel_perimeter_m": 1.95,
    "theme": "dark",
    "font_size_offset": 0,
    "neutral_interval_s": 0.1,
    "test_mode": False,
    "odometer_source": "sensor1",
    "rally_factor": 1.0,
    "pulses_km_1": 1540,
    "pulses_km_2": 1520,
    "time_offset_s": 0.0,
    "distcalcardelta": 100.0,
    "default_hitos": 5,
    "gps_min_speed_kmh": 2.0
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

_settings_cache = None

def load_settings():
    global _settings_cache
    if _settings_cache is not None:
        return _settings_cache
        
    settings = default_settings.copy()
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                loaded = json.load(f)
                settings.update(loaded)
        except:
            pass
    _settings_cache = settings
    return settings

def save_settings(s):
    global _settings_cache
    _settings_cache = s # Actualizar caché en memoria instantáneamente
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(s, f, indent=2)
    except Exception as e:
        print(f"Error guardando ajustes: {e}")

RECORDED_POINTS_FILE = "recorded_points.json"
recorded_points_dict = {}

def load_recorded_points():
    global recorded_points_dict
    try:
        if os.path.exists(RECORDED_POINTS_FILE):
            with open(RECORDED_POINTS_FILE, "r") as f:
                recorded_points_dict = json.load(f)
        else:
            recorded_points_dict = {}
    except:
        recorded_points_dict = {}

def save_recorded_points():
    global recorded_points_dict
    try:
        with open(RECORDED_POINTS_FILE, "w") as f:
            json.dump(recorded_points_dict, f, indent=2)
    except:
        pass

load_recorded_points()
pending_hitos_count = 0

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
test_pulses_1 = 0.0
test_pulses_2 = 0.0
test_dist_gps = 0.0
current_dist_m = 0.0

# --- ENDPOINTS API ---

@app.get("/")
async def root():
    return RedirectResponse(url="/piloto.html")

@app.get("/api/system/stats")
def get_system_stats():
    try:
        # Carga de CPU (1 min, 5 min, 15 min)
        load = [0.0, 0.0, 0.0]
        if os.path.exists("/proc/loadavg"):
            with open("/proc/loadavg", "r") as f:
                load = f.read().strip().split()[:3]
        
        # Temperatura de la Pi
        temp = 0.0
        if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                temp = float(f.read().strip()) / 1000.0
                
        # Memoria RAM
        mem_total = 0
        mem_free = 0
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if "MemTotal" in line:
                        mem_total = int(line.split()[1])
                    elif "MemAvailable" in line:
                        mem_free = int(line.split()[1])
                    elif "MemFree" in line and mem_free == 0:
                        mem_free = int(line.split()[1])
                        
        mem_used = mem_total - mem_free
        mem_pct = (mem_used / mem_total * 100) if mem_total > 0 else 0

        return {
            "cpu_load_1m": float(load[0]),
            "cpu_load_5m": float(load[1]),
            "cpu_load_15m": float(load[2]),
            "cpu_temp_c": round(temp, 1),
            "ram_used_pct": round(mem_pct, 1),
            "ram_total_mb": round(mem_total / 1024, 1)
        }
    except Exception as e:
        return {"error": str(e)}

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

@app.put("/api/calibraciones/{cal_id}")
async def update_calibracion(cal_id: int, data: dict):
    calibraciones = load_calibraciones()
    for i, c in enumerate(calibraciones):
        if c.get("id") == cal_id:
            data["id"] = cal_id  # Mantener el mismo ID
            if "timestamp" not in data:
                data["timestamp"] = c.get("timestamp")
            calibraciones[i] = data
            save_calibraciones(calibraciones)
            return data
    return {"error": "Calibración no encontrada"}

@app.delete("/api/calibraciones/{cal_id}")
async def delete_calibracion(cal_id: int):
    calibraciones = load_calibraciones()
    new_cal = [c for c in calibraciones if c.get("id") != cal_id]
    save_calibraciones(new_cal)
    return {"status": "ok"}

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

@app.post("/api/tramos/generar-calcado/{tramo_id}")
async def generar_tramo_calcado(tramo_id: str):
    global recorded_points_dict
    load_recorded_points()
    if tramo_id not in recorded_points_dict or len(recorded_points_dict[tramo_id]) < 2:
        return JSONResponse(status_code=400, content={"error": "No hay suficientes puntos grabados para este tramo. Intenta lanzarlo y recorrerlo primero."})
    
    tramos = load_tramos()
    found = next((t for t in tramos if t.get("id") == tramo_id), None)
    if not found:
        return JSONResponse(status_code=404, content={"error": "El tramo original no existe"})
        
    pts = recorded_points_dict[tramo_id]
    segmentos_calcados = []
    
    for i in range(len(pts) - 1):
        p_ini = pts[i]
        p_fin = pts[i+1]
        
        ini_m = p_ini["dist_m"]
        fin_m = p_fin["dist_m"]
        dt = p_fin["time_s"] - p_ini["time_s"]
        
        longitud_km = (fin_m - ini_m) / 1000.0
        if dt > 0 and longitud_km > 0:
            media_kmh = (longitud_km) / (dt / 3600.0)
        else:
            media_kmh = 50.0
            
        segmentos_calcados.append({
            "inicio_m": round(ini_m, 2),
            "fin_m": round(fin_m, 2),
            "media_kmh": round(media_kmh, 1),
            "referencias_externas": False
        })
        
    import uuid
    new_tramo = {
        "id": str(uuid.uuid4()),
        "nombre": f"{found.get('nombre', 'Tramo')} - CALCADO",
        "hora_inicio": found.get("hora_inicio", "00:00:00.0"),
        "segmentos": segmentos_calcados,
        "grabar_a_calcar": False
    }
    
    tramos.append(new_tramo)
    save_tramos(tramos)
    return {"success": True, "new_tramo": new_tramo}

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
    global active_tramo
    changes = await request.json()
    tramos = load_tramos()
    
    # Encontrar el tramo objetivo: el activo si existe, o el tramo "Tablas"
    target_tramo = None
    if active_tramo:
        target_tramo = next((t for t in tramos if t["id"] == active_tramo.get("id")), None)
        if not target_tramo:
            target_tramo = next((t for t in tramos if t["nombre"].upper() == active_tramo.get("nombre", "").upper()), None)
            
    if not target_tramo:
        target_tramo = next((t for t in tramos if t["nombre"].upper() == "TABLAS"), None)
        if not target_tramo:
            target_tramo = {"id": "tablas_ocr", "nombre": "Tablas", "hora_inicio": "00:00:00.0", "segmentos": []}
            tramos.append(target_tramo)
    
    new_segments = []
    for c in changes:
        speed = float(c["speed"])
        if speed <= 0: speed = 1.0 # Evitar división por cero en cálculos posteriores
        new_segments.append({
            "inicio_m": round(float(c["dist_from"]) * 1000),
            "fin_m": round(float(c["dist_to"]) * 1000),
            "media_kmh": round(speed, 2),
            "referencias_externas": False
        })
    target_tramo["segmentos"] = new_segments
    save_tramos(tramos)

    # Actualizar y refrescar el tramo activo en tiempo real
    active_tramo = target_tramo
    tramo_manager.set_active_tramo(target_tramo)

    return {"status": "ok", "count": len(new_segments)}

@app.post("/api/test/speed")
async def set_test_speed(request: Request):
    global test_speed_kmh
    body = await request.json()
    test_speed_kmh = float(body.get("speed", 0.0))
    
    settings = load_settings()
    settings["test_mode"] = True
    save_settings(settings)
    
    return {"status": "ok"}

def apply_sharpening(image):
    kernel = np.array([[0, -1, 0], 
                       [-1, 5,-1], 
                       [0, -1, 0]])
    return cv2.filter2D(image, -1, kernel)

def detect_and_crop_to_content(image):
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 75, 200)
        cnts = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        
        if not cnts:
            return False, image

        min_area = 1000 
        large_cnts = [c for c in cnts if cv2.contourArea(c) > min_area]

        if not large_cnts:
             return False, image

        x_min, y_min = np.inf, np.inf
        x_max, y_max = -np.inf, -np.inf

        for c in large_cnts:
            x, y, w, h = cv2.boundingRect(c)
            x_min = min(x_min, x)
            y_min = min(y_min, y)
            x_max = max(x_max, x + w)
            y_max = max(y_max, y + h)

        padding = 10
        h_img, w_img = image.shape[:2]
        
        x_min = max(0, x_min - padding)
        y_min = max(0, y_min - padding)
        x_max = min(w_img, x_max + padding)
        y_max = min(h_img, y_max + padding)

        cropped = image[int(y_min):int(y_max), int(x_min):int(x_max)]
        return True, cropped

    except Exception as e:
        return False, image

def run_ocr_sync(img, prep_config: dict = None):
    if prep_config is None:
        prep_config = {}
        
    img_to_process = img.copy()

    # 1. Deskew / Crop
    if prep_config.get('apply_deskew', False):
         success, cropped_img = detect_and_crop_to_content(img_to_process)
         if success:
             img_to_process = cropped_img

    # 1.5 Resize
    if prep_config.get('apply_resize', False):
        target_h = int(prep_config.get('resize_height', 2000))
        h, w = img_to_process.shape[:2]
        if h > target_h:
            scale = target_h / h
            new_w = int(w * scale)
            img_to_process = cv2.resize(img_to_process, (new_w, target_h), interpolation=cv2.INTER_CUBIC)

    # 2. Contrast
    if prep_config.get('apply_contrast', False):
        alpha = float(prep_config.get('contrast_alpha', 1.5))
        beta = float(prep_config.get('contrast_beta', 0))
        img_to_process = cv2.convertScaleAbs(img_to_process, alpha=alpha, beta=beta)

    # 3. Sharpening
    if prep_config.get('apply_sharpening', False):
        img_to_process = apply_sharpening(img_to_process)

    # 4. Grayscale
    if prep_config.get('apply_gray', False):
         if len(img_to_process.shape) == 3:
            img_to_process = cv2.cvtColor(img_to_process, cv2.COLOR_BGR2GRAY)
            img_to_process = cv2.cvtColor(img_to_process, cv2.COLOR_GRAY2BGR)

    # 5. Thresholding
    if prep_config.get('apply_threshold', False):
        gray_for_thresh = cv2.cvtColor(img_to_process, cv2.COLOR_BGR2GRAY)
        block_size = int(prep_config.get('threshold_block_size', 15))
        c_val = int(prep_config.get('threshold_c', 5))
        if block_size % 2 == 0: block_size += 1
        img_to_process = cv2.adaptiveThreshold(
            gray_for_thresh, 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 
            block_size, 
            c_val
        )
        img_to_process = cv2.cvtColor(img_to_process, cv2.COLOR_GRAY2BGR)

    result, elapse = rapid_ocr_engine(img_to_process)
    detected_text = ""
    debug_img = img_to_process.copy()
    if result:
        boxes = [line[0] for line in result]
        texts = [line[1] for line in result]
        scores = [line[2] for line in result]
        sorted_boxes, sorted_texts, _ = sort_boxes(boxes, texts, scores)
        detected_text = "\n".join(sorted_texts)
        
        for i in range(len(sorted_texts)):
            box = sorted_boxes[i]
            points = np.array(box, dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(debug_img, [points], isClosed=True, color=(0, 0, 255), thickness=2)
    
    _, buffer = cv2.imencode('.jpg', debug_img)
    processed_image_b64 = base64.b64encode(buffer).decode('utf-8')
    return detected_text, processed_image_b64

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
        prep_config = data.get('preprocessing', {})
        
        # Ejecutar en un hilo separado para que no bloquee el bucle principal de asyncio
        loop = asyncio.get_event_loop()
        detected_text, processed_image_b64 = await loop.run_in_executor(None, run_ocr_sync, img, prep_config)

        return {
            'text': detected_text,
            'processed_image': f"data:image/jpeg;base64,{processed_image_b64}",
            'execution_time': time.time() - start_time
        }
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    global test_dist_m, test_pulses_1, test_pulses_2, test_dist_gps, current_dist_m, active_tramo, pending_hitos_count
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ODO_RESET":
                current_dist_m = 0.0
                test_dist_m = 0.0
                test_pulses_1 = 0.0
                test_pulses_2 = 0.0
                test_dist_gps = 0.0
                if gps_tcp_manager: gps_tcp_manager.reset_distance()
                if gps_ble_manager: gps_ble_manager.reset_distance()
                rally_logger.log_event("RECALIBRACION_RESET")
            elif data == "MILESTONE":
                rally_logger.log_event("HITO_MANUAL")
            elif data.startswith("DIST_ADJUST:"):
                try:
                    delta = float(data.split(":")[1])
                    current_dist_m += delta
                    test_dist_m += delta
                    settings = load_settings()
                    p_km_1 = settings.get("pulses_km_1", 1540)
                    test_pulses_1 += delta * (p_km_1 / 1000)
                    rally_logger.log_event(f"AJUSTE_DISTANCIA:{delta}")
                except:
                    pass
            elif data.startswith("PREPARE_HITOS:"):
                try:
                    pending_hitos_count = int(data.split(":")[1])
                    rally_logger.log_event(f"PREPARAR_HITOS:{pending_hitos_count}")
                except:
                    pass
            elif data == "REF_EXT_ACTION":
                try:
                    if active_tramo and "segmentos" in active_tramo:
                        if pending_hitos_count > 0:
                            settings = load_settings()
                            rf = float(settings.get("rally_factor", 1.0))
                            if rf <= 0:
                                rf = 1.0
                            
                            current_start_m = current_dist_m
                            filtered = []
                            for s in active_tramo.get("segmentos", []):
                                if s.get("fin_m", 0) <= current_start_m:
                                    filtered.append(s)
                                elif s.get("inicio_m", 0) < current_start_m:
                                    s["fin_m"] = current_start_m
                                    filtered.append(s)
                            
                            for _ in range(pending_hitos_count):
                                next_fin_m = current_start_m + (1000.0 * rf)
                                filtered.append({
                                    "inicio_m": round(current_start_m, 2),
                                    "fin_m": round(next_fin_m, 2),
                                    "media_kmh": 50.0,
                                    "referencias_externas": True
                                })
                                current_start_m = next_fin_m
                            
                            active_tramo["segmentos"] = filtered
                            
                            all_tramos = load_tramos()
                            found = next((t for t in all_tramos if t.get("id") == active_tramo.get("id")), None)
                            if found:
                                found["segmentos"] = filtered
                                save_tramos(all_tramos)
                                active_tramo = found
                                tramo_manager.set_active_tramo(found)
                            
                            pending_hitos_count = 0
                            rally_logger.log_event(f"HITOS_GENERADOS:{current_dist_m}")
                        else:
                            seg_info = tramo_manager.get_current_segment_info(current_dist_m)
                            idx = seg_info.get("idx", 0)
                            segs = active_tramo["segmentos"]
                            if 0 <= idx < len(segs):
                                cur_seg = segs[idx]
                                if cur_seg.get("referencias_externas") or active_tramo.get("referencias_externas"):
                                    cur_seg["fin_m"] = current_dist_m
                                    if idx + 1 < len(segs):
                                        segs[idx + 1]["inicio_m"] = current_dist_m
                                    
                                    all_tramos = load_tramos()
                                    found = next((t for t in all_tramos if t.get("id") == active_tramo.get("id")), None)
                                    if found:
                                        found["segmentos"] = segs
                                        save_tramos(all_tramos)
                                        active_tramo = found
                                        tramo_manager.set_active_tramo(found)
                                    rally_logger.log_event(f"REF_EXT_APLICADO:{current_dist_m}")
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
@app.get("/api/gps/log")
async def get_gps_log():
    log_path = Path("1_DEV/gps_raw.log")
    if not log_path.exists():
        # Intentar ruta relativa directa si estamos en CWD
        log_path = Path("gps_raw.log")
        
    if log_path.exists():
        from fastapi.responses import FileResponse
        return FileResponse(log_path, filename="gps_raw.log", media_type="text/plain")
    else:
        return {"error": "Archivo de log no encontrado"}

@app.on_event("startup")
async def startup_event():
    if gps_tcp_manager: gps_tcp_manager.start()
    if gps_ble_manager: gps_ble_manager.start()
    asyncio.create_task(hardware_loop())

async def hardware_loop():
    global test_dist_m, current_dist_m, test_pulses_1, test_pulses_2, test_dist_gps
    print("🚀 Iniciando bucle de telemetría a 50Hz...", flush=True)
    setup_hardware_readers()
    rally_logger.start_tramo("test")
    
    dist_m = 0.0
    tiempo_tramo_s = 0.0
    pulses_1 = 0
    pulses_2 = 0
    last_esp32_micros = 0
    velocidad_kmh = 0.0
    tramo_mock = [{"inicio_m": 0, "fin_m": 12000, "media_kmh": 45.0}]
    import time
    last_test_time = time.time()

    while True:
        loop_start = time.time()
        # 1. Obtener Hora Actual del Sistema (segundos desde medianoche)
        now = datetime.now()
        settings = load_settings()
        time_offset_s = settings.get("time_offset_s", 0.0)
        wall_time_s = now.hour * 3600 + now.minute * 60 + now.second + now.microsecond / 1_000_000 + time_offset_s

        test_mode = settings.get("test_mode", False)
        odo_source = settings.get("odometer_source", "sensor1")
        
        segmentos = active_tramo["segmentos"] if active_tramo and active_tramo.get("segmentos") else tramo_mock
        tramo_nombre = active_tramo["nombre"] if active_tramo else "TC-DEMO"
        hora_inicio_str = active_tramo.get("hora_inicio", "00:00:00.0") if active_tramo else "00:00:00.0"
        
        if not tramo_manager.active_tramo or tramo_manager.get_segmentos() != segmentos:
            tramo_manager.set_active_tramo({"segmentos": segmentos})

        # 2. Calcular Distancia y Tiempo elapsado real
        settings = load_settings()
        rally_factor = settings.get("rally_factor", 1.0)
        p_km_1 = settings.get("pulses_km_1", 1540)
        p_km_2 = settings.get("pulses_km_2", 1520)
        
        delta_odo_m = 0.0
        
        if test_mode:
            # --- MODO SIMULADOR ---
            current_test_time = time.time()
            elapsed_test_s = current_test_time - last_test_time
            last_test_time = current_test_time
            
            delta_odo_m = (test_speed_kmh / 3.6) * elapsed_test_s
            velocidad_kmh = test_speed_kmh
            
            test_pulses_1 += delta_odo_m * (p_km_1 / 1000.0)
            test_pulses_2 += delta_odo_m * (p_km_2 / 1000.0)
            pulses_1 = int(test_pulses_1)
            pulses_2 = int(test_pulses_2)

        elif "gps" in odo_source:
            # --- MODO GPS REAL ---
            current_real_time = time.time()
            elapsed_real_s = current_real_time - last_test_time
            last_test_time = current_real_time
            
            delta_gps = 0.0
            if odo_source == "gps_tcp" and gps_tcp_manager:
                delta_gps = gps_tcp_manager.get_delta()
                velocidad_kmh = gps_tcp_manager.data.get("speed_kmh", 0.0)
            elif odo_source == "gps_ble" and gps_ble_manager:
                gps_ble_manager.data["min_speed_threshold"] = settings.get("gps_min_speed_kmh", 2.0)
                delta_gps = gps_ble_manager.get_delta()
                velocidad_kmh = gps_ble_manager.data.get("speed_kmh", 0.0)
            
            delta_odo_m = delta_gps * rally_factor
            
            pulses_1 = esp32_reader.pulses_1
            pulses_2 = esp32_reader.pulses_2

        else:
            # --- MODO SENSORES REALES (ESP32) ---
            current_real_time = time.time()
            elapsed_real_s = current_real_time - last_test_time
            last_test_time = current_real_time
            
            # Lectura atómica total que incluye los períodos calculados por el microcontrolador
            new_pulses_1, new_pulses_2, new_micros, per_1, per_2, l1, l2 = esp32_reader.get_latest_data()
            
            # 1. Seleccionar datos del sensor activo
            if odo_source == "sensor2":
                delta_p = new_pulses_2 - pulses_2
                factor = (p_km_2 / 1000.0) if p_km_2 > 0 else 1.52
                sensor_period = per_2
                last_pulse_micros = l2
            else: # sensor1 por defecto
                delta_p = new_pulses_1 - pulses_1
                factor = (p_km_1 / 1000.0) if p_km_1 > 0 else 1.54
                sensor_period = per_1
                last_pulse_micros = l1

            # 2. Convertir a metros incrementales para el total acumulado
            # EL ODÓMETRO SIEMPRE SUMA LA DISTANCIA, INDEPENDIENTEMENTE DE LA VELOCIDAD
            delta_odo_m = delta_p / factor if factor > 0 else 0.0
            
            # 3. CALCULAR VELOCIDAD FÍSICA REAL USANDO PERIODO ENTRE PULSOS (SIN ALIASING)
            # Primero calculamos el tiempo inactivo exacto desde el último pulso físico
            idle_s = 0.0
            if last_pulse_micros > 0 and new_micros >= last_pulse_micros:
                idle_s = (new_micros - last_pulse_micros) / 1000000.0
            elif new_micros < last_pulse_micros: # Rollover protection
                idle_s = 0.0
                
            # Si el microcontrolador reporta un período válido y no estamos en un timeout masivo
            if sensor_period > 0 and factor > 0 and idle_s < 2.0:
                # Hz = 1,000,000 us / Periodo_us
                frecuencia_hz = 1000000.0 / float(sensor_period)
                inst_speed = (frecuencia_hz / factor) * 3.6
                
                # Si el tiempo inactivo es mayor que el periodo reportado, el vehículo está frenando.
                # Simulamos la caída de velocidad matemáticamente.
                period_s = sensor_period / 1000000.0
                if idle_s > period_s * 1.5:
                    # El pulso debería haber llegado y no lo hizo. Decaemos la velocidad.
                    decay_factor = period_s / idle_s
                    inst_speed = inst_speed * decay_factor
                
                # Filtro ultra leve solo para vibración mecánica en baja frecuencia
                alpha = 0.75
                velocidad_kmh = (alpha * inst_speed) + ((1.0 - alpha) * velocidad_kmh)
                
            else:
                # Si el periodo es 0 (vehículo detenido) o ha superado el timeout masivo de 2 segundos.
                if delta_odo_m > 0 and elapsed_real_s > 0:
                    # Fallback de seguridad a muy baja velocidad por si se genera un pulso aislado
                    inst_speed = (delta_odo_m / elapsed_real_s) * 3.6
                    velocidad_kmh = 0.5 * inst_speed + 0.5 * velocidad_kmh
                elif idle_s > 2.0:
                    # Freno absoluto si han pasado más de 2 segundos exactos sin pulsos
                    velocidad_kmh = 0.0
                else:
                    # Decaimiento suave
                    velocidad_kmh = 0.8 * velocidad_kmh
            
            # 4. Actualizar estado base para la próxima iteración
            pulses_1 = new_pulses_1
            pulses_2 = new_pulses_2
            if new_micros > last_esp32_micros:
                last_esp32_micros = new_micros

        # ACUMULADOR UNIFICADO
        current_dist_m += delta_odo_m
        dist_m = current_dist_m


        if active_tramo and active_tramo.get("grabar_a_calcar"):
            t_id = active_tramo.get("id")
            if t_id:
                if t_id not in recorded_points_dict:
                    recorded_points_dict[t_id] = [{"dist_m": 0.0, "time_s": wall_time_s}]
                
                settings = load_settings()
                delta = float(settings.get("distcalcardelta", 100.0))
                if delta <= 0:
                    delta = 100.0
                    
                next_dist = (len(recorded_points_dict[t_id])) * delta
                if dist_m >= next_dist:
                    recorded_points_dict[t_id].append({"dist_m": dist_m, "time_s": wall_time_s})
                    save_recorded_points()

                # Comprobar si hemos llegado al final del tramo
                if active_tramo.get("segmentos"):
                    last_seg = active_tramo["segmentos"][-1]
                    total_dist_m = last_seg.get("fin_m", 0.0)
                    if dist_m >= total_dist_m:
                        if not recorded_points_dict[t_id] or recorded_points_dict[t_id][-1]["dist_m"] < dist_m:
                            recorded_points_dict[t_id].append({"dist_m": dist_m, "time_s": wall_time_s})
                            save_recorded_points()

                        active_tramo["grabar_a_calcar"] = False
                        
                        pts = recorded_points_dict[t_id]
                        if len(pts) >= 2:
                            segmentos_calcados = []
                            for i in range(len(pts) - 1):
                                p_ini = pts[i]
                                p_fin = pts[i+1]
                                ini_m = p_ini["dist_m"]
                                fin_m = p_fin["dist_m"]
                                dt = p_fin["time_s"] - p_ini["time_s"]
                                longitud_km = (fin_m - ini_m) / 1000.0
                                if dt > 0 and longitud_km > 0:
                                    media_kmh = (longitud_km) / (dt / 3600.0)
                                else:
                                    media_kmh = 50.0
                                
                                segmentos_calcados.append({
                                    "inicio_m": round(ini_m, 2),
                                    "fin_m": round(fin_m, 2),
                                    "media_kmh": round(media_kmh, 1),
                                    "referencias_externas": False
                                })
                            
                            import uuid
                            new_tramo = {
                                "id": str(uuid.uuid4()),
                                "nombre": f"{active_tramo.get('nombre', 'Tramo')} - CALCADO",
                                "hora_inicio": active_tramo.get("hora_inicio", "00:00:00.0"),
                                "segmentos": segmentos_calcados,
                                "grabar_a_calcar": False
                            }
                            
                            tramos_all = load_tramos()
                            for t in tramos_all:
                                if t.get("id") == t_id:
                                    t["grabar_a_calcar"] = False
                            tramos_all.append(new_tramo)
                            save_tramos(tramos_all)

        # El tiempo elapsado ahora es dinámico respecto a la salida
        start_seconds = tramo_manager.parse_time_to_seconds(hora_inicio_str)
        tiempo_tramo_s = wall_time_s - start_seconds

        seg_info = tramo_manager.get_current_segment_info(dist_m)
        diff_s = tramo_manager.calculate_interval(dist_m, wall_time_s, hora_inicio_str)

        telemetry = {
            "tramo_nombre": tramo_nombre,
            "distancia_m": dist_m,
            "dist_gps_m": gps_ble_manager.get_distance() if gps_ble_manager else (gps_tcp_manager.get_distance() if gps_tcp_manager else 0.0),
            "gps_tcp_status": gps_tcp_manager.status if gps_tcp_manager else "Not Available",
            "gps_ble_status": gps_ble_manager.status if gps_ble_manager else "Not Available",
            "gps_ble_data": gps_ble_manager.data if gps_ble_manager else {},
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
            "system_time": f"{int(wall_time_s // 3600) % 24:02d}:{int((wall_time_s % 3600) // 60):02d}:{int(wall_time_s % 60):02d}.{int((wall_time_s * 10) % 10):01d}",
            "gps_time": now.strftime("%H:%M:%S.%f")[:-5],
            "time_offset_s": time_offset_s,
            "wall_time_s": wall_time_s,
            "tramo_id": active_tramo.get("id") if active_tramo else None,
            "gps_ble_data": gps_ble_manager.data if gps_ble_manager else {}
        }
        
        await manager.broadcast(telemetry)
        # Compensación dinámica de sueño para fijar la iteración a exactamente 50Hz (0.02s)
        elapsed = time.time() - loop_start
        sleep_time = max(0.001, 0.02 - elapsed)
        await asyncio.sleep(sleep_time)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
