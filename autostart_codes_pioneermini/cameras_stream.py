

#!/usr/bin/env python3
import cv2
import numpy as np
import base64
import json
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pioneer_sdk2 import Camera, CameraType


class ThermalCamera:
    """Класс для работы с V4L2 тепловизором, исправления ориентации и генерации тепловых карт."""
    def __init__(self, device_id: int):
        self.video_path = f'/dev/video{device_id}'
        self.cap = cv2.VideoCapture(self.video_path, cv2.CAP_V4L)
        self.cap.set(cv2.CAP_PROP_CONVERT_RGB, 0)

    def get_temperature_map(self):
        """Чтение сырого кадра, конвертация в °C и исправление ориентации матрицы."""
        ret, raw = self.cap.read()
        if not ret or raw is None:
            return None
        
        # Разделение сырого кадра на видео и термодату
        _, thermal_data = np.array_split(raw, 2)
        
        # Конвертация через float32 для точности
        hi = thermal_data[:, :, 0].astype(np.float32)
        lo = thermal_data[:, :, 1].astype(np.float32)
        temp = (hi + lo * 256.0) / 64.0 - 273.15
        
        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Поворот на 180 градусов
        # (Используйте 0, если нужно отразить только по вертикали, или -1 для поворота на 180°)
        temp = cv2.flip(temp, -1)
        
        return np.round(temp, 2)

    @staticmethod
    def to_absolute_heatmap(temp_map: np.ndarray, min_temp: float = 15.0, max_temp: float = 38.0) -> np.ndarray:
        """Генерация тепловой карты с фиксированным диапазоном (по умолчанию под тело человека)."""
        if max_temp <= min_temp:
            max_temp = min_temp + 1e-5
            
        clipped = np.clip(temp_map, min_temp, max_temp)
        norm_img = ((clipped - min_temp) / (max_temp - min_temp) * 255.0).astype(np.uint8)
        
        # INFERNO дает максимальный контраст. Если хочется "радугу", замените на cv2.COLORMAP_TURBO
        return cv2.applyColorMap(norm_img, cv2.COLORMAP_INFERNO)

    @staticmethod
    def to_relative_heatmap(temp_map: np.ndarray) -> np.ndarray:
        """Динамическая карта с отсечением аномальных пикселей по процентилям."""
        # Отсекаем 1% самых холодных и 1% самых горячих пикселей (защита от шума сенсора)
        vmin, vmax = np.percentile(temp_map, [1.0, 99.0])
        
        if vmax <= vmin:
            vmax = vmin + 1e-5
            
        clipped = np.clip(temp_map, vmin, vmax)
        norm_img = ((clipped - vmin) / (vmax - vmin) * 255.0).astype(np.uint8)
        
        # Легкое размытие (3x3) убирает сетчатый шум неохлаждаемой матрицы
        smooth_img = cv2.GaussianBlur(norm_img, (3, 3), 0)
        
        return cv2.applyColorMap(smooth_img, cv2.COLORMAP_INFERNO)


def frame_to_base64(frame: np.ndarray, quality: int = 75) -> str:
    """Кодирование OpenCV-кадра в Base64 строку (качество JPEG повышено до 75)."""
    if frame is None:
        return None
    success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not success:
        return None
    return base64.b64encode(buffer).decode('utf-8')


# --- ИНИЦИАЛИЗАЦИЯ ОБОРУДОВАНИЯ ---
thermal_cam = ThermalCamera(device_id=49)
main_camera = Camera(CameraType.MAIN)
opt_camera = Camera(CameraType.OPT)


# --- HTTP СЕРВЕР ---
class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        routes = {
            "/thermal_absolute": self.handle_thermal_absolute,
            "/thermal_relative": self.handle_thermal_relative,
            "/main_camera": lambda: self.send_camera_frame(main_camera.get_cv_frame()),
            "/opt_camera": lambda: self.send_camera_frame(opt_camera.get_cv_frame()),
            "/cameras": self.handle_all_cameras
        }

        handler = routes.get(self.path)
        if handler:
            handler()
        else:
            self.send_json({"message": "Use /thermal_absolute, /thermal_relative, /main_camera, /opt_camera or /cameras"}, 404)

    def handle_thermal_absolute(self):
        temp_map = thermal_cam.get_temperature_map()
        if temp_map is None:
            return self.send_json({"error": "Thermal camera not ready"}, 503)
        
        heatmap = ThermalCamera.to_absolute_heatmap(temp_map, min_temp=15.0, max_temp=38.0)
        self.send_image_json(heatmap)

    def handle_thermal_relative(self):
        temp_map = thermal_cam.get_temperature_map()
        if temp_map is None:
            return self.send_json({"error": "Thermal camera not ready"}, 503)
        
        heatmap = ThermalCamera.to_relative_heatmap(temp_map)
        self.send_image_json(heatmap)

    def send_camera_frame(self, frame):
        if frame is None:
            self.send_json({"error": "Camera not ready"}, 503)
        else:
            self.send_image_json(frame)

    def handle_all_cameras(self):
        temp_map = thermal_cam.get_temperature_map()
        main_frame = main_camera.get_cv_frame()

        if temp_map is not None and main_frame is not None:
            abs_heat = ThermalCamera.to_absolute_heatmap(temp_map, 15.0, 38.0)
            rel_heat = ThermalCamera.to_relative_heatmap(temp_map)

            self.send_json({
                "main_camera": frame_to_base64(main_frame),
                "thermal_absolute": frame_to_base64(abs_heat),
                "thermal_relative": frame_to_base64(rel_heat)
            })
        else:
            self.send_json({"error": "One or more cameras not ready"}, 503)

    def send_image_json(self, frame):
        b64_str = frame_to_base64(frame)
        if b64_str:
            self.send_json({"image": b64_str})
        else:
            self.send_json({"error": "Failed to encode image"}, 500)

    def send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, format, *args):
        # Подавляем спам в консоли
        pass


def run_server(port=6767):
    server = ThreadingHTTPServer(('0.0.0.0', port), RequestHandler)
    print(f"Сервер запущен на порту {port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановка сервера...")
        server.server_close()


if __name__ == '__main__':
    run_server(7000)
