from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import json
from pioneer_sdk2 import ServoCamera, Pioneer

# Инициализируем камеру
try:
    servo_camera = ServoCamera()
except Exception as e:
    print(f"Ошибка инициализации камеры: {e}")
    servo_camera = None

# Инициализируем дрон
try:
    drone = Pioneer()
except Exception as e:
    print(f"Ошибка инициализации дрона: {e}")
    drone = None


class CameraControlHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Парсим URL
        parsed_url = urlparse(self.path)
        
        # --------------------------------------------------------
        # ЭНДПОИНТ 1: Управление камерой
        # --------------------------------------------------------
        if parsed_url.path == '/camera/set_angle':
            query_params = parse_qs(parsed_url.query)
            
            if 'angle' not in query_params:
                self.send_error_response(400, "Missing 'angle' parameter")
                return
            
            try:
                angle = int(query_params['angle'][0])
            except ValueError:
                self.send_error_response(400, "'angle' must be an integer")
                return
            
            # Валидация диапазона
            if not (-80 <= angle <= 30):
                self.send_error_response(400, "Angle must be between -80 and 30")
                return
                
            if servo_camera is None:
                self.send_error_response(500, "ServoCamera is not initialized")
                return
            
            # Управляем сервой
            try:
                servo_camera.set_angle(angle)
                self.send_success_response({"status": "success", "angle_set": angle})
            except Exception as e:
                self.send_error_response(500, f"Hardware error: {str(e)}")

        # --------------------------------------------------------
        # ЭНДПОИНТ 2: Получение координат LPS
        # --------------------------------------------------------
        elif parsed_url.path == '/drone/position':
            if drone is None:
                self.send_error_response(500, "Pioneer drone is not initialized")
                return
            
            try:
                # Получаем координаты
                position = drone.get_local_position_lps()
                
                # Если датчики еще не откалиброваны или нет данных, метод может вернуть None
                if position is None:
                    self.send_error_response(503, "LPS data is currently unavailable (None)")
                    return

                self.send_success_response({
                    "status": "success", 
                    "position": position
                })
            except Exception as e:
                self.send_error_response(500, f"Hardware error: {str(e)}")

        # --------------------------------------------------------
        # Если эндпоинт не найден
        # --------------------------------------------------------
        else:
            self.send_error_response(404, "Not Found")

    def send_success_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_response(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response = {"status": "error", "message": message}
        self.wfile.write(json.dumps(response).encode('utf-8'))

def run(port=8000):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, CameraControlHandler)
    print(f"Сервер управления запущен на порту {port}...")
    print("Доступные эндпоинты:")
    print(" - GET /camera/set_angle?angle=X")
    print(" - GET /drone/position")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
        # Аккуратно закрываем соединение с платой при остановке скрипта
        if drone is not None:
            drone.close_connection()
        httpd.server_close()

if __name__ == '__main__':
    run()
