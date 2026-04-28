class TramoManager:
    """
    Gestiona el tramo activo y realiza los cálculos de tiempo ideal e intervalo.

    Un tramo está compuesto por N segmentos con diferentes medias:
        segmento = { "inicio_m": float, "fin_m": float, "media_kmh": float }

    La distancia dentro del tramo siempre se mide desde el kilómetro 0
    del tramo (inicio del primer segmento).
    """

    def __init__(self):
        self.active_tramo: dict | None = None  # tramo completo con "segmentos"

    def set_active_tramo(self, tramo: dict):
        """Establece el tramo activo para los cálculos."""
        self.active_tramo = tramo

    def get_segmentos(self) -> list:
        """Devuelve la lista de segmentos del tramo activo (ordenada por inicio_m)."""
        if not self.active_tramo:
            return []
        segs = self.active_tramo.get("segmentos", [])
        return sorted(segs, key=lambda s: s.get("inicio_m", 0))

    def calculate_ideal_time(self, dist_m: float) -> float:
        """
        Calcula el tiempo ideal (en segundos) para haber recorrido dist_m metros,
        siguiendo exactamente las medias de cada segmento.

        Algoritmo:
          1. Para cada segmento completado: sumar (longitud_km / media_kmh) * 3600 s
          2. Para el segmento actual (parcial): sumar (distancia_recorrida_km / media_kmh) * 3600 s
          3. Si dist_m está antes del primer segmento o más allá del último, extrapolar
             con la media del segmento más cercano.

        Returns: tiempo ideal en segundos (float)
        """
        segmentos = self.get_segmentos()
        if not segmentos:
            return 0.0

        tiempo_ideal = 0.0
        dist_restante = dist_m

        for seg in segmentos:
            inicio_m = seg.get("inicio_m", 0.0)
            fin_m    = seg.get("fin_m",    0.0)
            media    = seg.get("media_kmh", 1.0)
            if media <= 0:
                media = 1.0  # evitar división por cero

            longitud_m = fin_m - inicio_m
            if longitud_m <= 0:
                continue

            if dist_m <= inicio_m:
                # dist_m está antes de este segmento → paramos
                break

            if dist_m >= fin_m:
                # Segmento completado → sumamos su tiempo completo
                tiempo_ideal += (longitud_m / 1000.0) / media * 3600.0
            else:
                # Estamos dentro de este segmento → suma parcial
                distancia_en_seg_m = dist_m - inicio_m
                tiempo_ideal += (distancia_en_seg_m / 1000.0) / media * 3600.0
                break  # ya no hay más segmentos que procesar

        return tiempo_ideal

    def calculate_interval(self, dist_m: float, tiempo_tramo_s: float) -> float:
        """
        Calcula el intervalo respecto al tiempo ideal.

        intervalo = tiempo_real - tiempo_ideal
          > 0  → vas TARDE  (más lento de lo necesario)
          < 0  → vas ADELANTADO (más rápido de lo necesario)
          = 0  → perfecto

        Returns: diferencia en segundos (float)
        """
        tiempo_ideal = self.calculate_ideal_time(dist_m)
        return round(tiempo_tramo_s - tiempo_ideal, 2)

    def get_current_segment_info(self, dist_m: float) -> dict:
        """
        Devuelve información del segmento en el que se encuentra dist_m:
          - idx            → índice en la lista de segmentos
          - velocidad_obj  → media requerida en el segmento actual (km/h)
          - proxima_media  → media del siguiente segmento (km/h), 0 si es el último
          - distancia_cambio_m → metros restantes hasta el cambio de media
        """
        segmentos = self.get_segmentos()
        result = {
            "idx": 0,
            "velocidad_obj": 0.0,
            "proxima_media": 0.0,
            "distancia_cambio_m": 0.0,
        }

        for i, seg in enumerate(segmentos):
            if dist_m >= seg["inicio_m"] and dist_m < seg["fin_m"]:
                result["idx"]            = i
                result["velocidad_obj"]  = seg["media_kmh"]
                if i + 1 < len(segmentos):
                    result["proxima_media"]       = segmentos[i + 1]["media_kmh"]
                    result["distancia_cambio_m"]  = seg["fin_m"] - dist_m
                break

        return result


# Instancia global usada desde main.py
tramo_manager = TramoManager()
