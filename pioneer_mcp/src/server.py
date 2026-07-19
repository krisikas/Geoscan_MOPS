"""MCP-сервер для управления дроном Pioneer Mini 2."""

from __future__ import annotations
import os
import time

from mcp.server.fastmcp import FastMCP, Image
from .drone_runtime import DroneRuntime

mcp = FastMCP("pioneer-mcp", streamable_http_path="/sse")
_r = DroneRuntime()

# --- подключение ---

@mcp.tool()
async def connect(tcp: str | None = None, serial: str | None = None, baudrate: int | None = None) -> str:
    """Подключиться к дрону Pioneer Mini 2. По умолчанию в функции используются верные параметры"""
    return await _r.cmd_connect(tcp, serial, baudrate)

@mcp.tool()
async def disconnect() -> str:
    """Отключиться от дрона."""
    return await _r.cmd_disconnect()

# --- моторы / полёт ---

@mcp.tool()
async def arm(timeout: int = 5, retries: int = 0) -> str:
    """Запустить моторы дрона."""
    return await _r.cmd_arm(timeout, retries)

@mcp.tool()
async def disarm() -> str:
    """Остановить моторы дрона."""
    return await _r.cmd_disarm()

@mcp.tool()
async def takeoff() -> str:
    """Выполнить взлёт дрона."""
    return await _r.cmd_takeoff()

@mcp.tool()
async def land() -> str:
    """Выполнить посадку дрона."""
    return await _r.cmd_land()

@mcp.tool()
async def return_to_home() -> str:
    """Вернуть дрон на точку взлёта (RTL)."""
    return await _r.cmd_rtl()

@mcp.tool()
async def emergency_land() -> str:
    """Экстренная посадка — БЕЗ проверок безопасности."""
    return await _r.cmd_emergency_land()

# --- навигация ---

@mcp.tool()
async def go_to_local_point(x: float, y: float, z: float, yaw: float | None = None, speed: float = 0.6) -> str:
    """
    Отправить дрон к локальной точке. Максимальная высота 10м.
    Параметр speed задает скорость перемещения. Стандартная безопасная скорость это 0.6 м/с.
    """
    return await _r.cmd_go_to_local_point(x, y, z, yaw, speed)

@mcp.tool()
async def go_to_local_point_relative(dx: float, dy: float, dz: float, dyaw: float | None = None, speed: float = 0.6) -> str:
    """
    Отправить дрон к точке относительно его текущего положения и направления.
    """
    return await _r.cmd_go_to_local_point_relative(dx, dy, dz, dyaw, speed)

@mcp.tool()
async def set_velocity(vx: float, vy: float, vz: float, yaw_rate: float) -> str:
    """Задать скорость дрона в глобальной системе координат."""
    return await _r.cmd_set_velocity(vx, vy, vz, yaw_rate)

@mcp.tool()
async def set_velocity_body_fixed(vx: float, vy: float, vz: float, yaw_rate: float) -> str:
    """Задать скорость дрона относительно тела дрона."""
    return await _r.cmd_set_velocity_bf(vx, vy, vz, yaw_rate)

@mcp.tool()
async def hold_position() -> str:
    """Остановить движение дрона (зависнуть на месте)."""
    return await _r.cmd_hold_position()

@mcp.tool()
async def set_yaw(angle_deg: float) -> str:
    """Установить угол рыскания дрона."""
    return await _r.cmd_set_yaw(angle_deg)

# --- камера ---

@mcp.tool()
async def get_single_camera_frame() -> Image:
    """Получить один кадр с камеры дрона без изменения угла наклона (возвращает изображение)."""
    data = _r.get_frame_jpeg()
    if not data:
        return "Ошибка: Не удалось получить кадр с камеры"
    
    # Папка для истории
    history_dir = os.path.abspath("frames_history")
    os.makedirs(history_dir, exist_ok=True)
    
    # Папка для последнего кадра (для модели)
    latest_dir = os.path.abspath("frames_latest")
    os.makedirs(latest_dir, exist_ok=True)
    
    timestamp = int(time.time())
    
    # Сохраняем в историю
    history_path = os.path.join(history_dir, f"frame_{timestamp}.jpg")
    with open(history_path, "wb") as f:
        f.write(data)
        
    # Сохраняем как latest
    latest_path = os.path.join(latest_dir, "latest_frame.jpg")
    with open(latest_path, "wb") as f:
        f.write(data)
        
    return Image(data=data, format="jpeg")

@mcp.tool()
async def get_opt_camera_frame() -> Image:
    """Получить кадр с нижней камеры оптического потока (OPT). (возвращает изображение)"""
    data = _r.get_opt_frame_jpeg()
    if not data:
        return "Ошибка: Не удалось получить кадр с камеры"
    
    # Папка для истории
    history_dir = os.path.abspath("frames_history")
    os.makedirs(history_dir, exist_ok=True)
    
    # Папка для последнего кадра (для модели)
    latest_dir = os.path.abspath("frames_latest")
    os.makedirs(latest_dir, exist_ok=True)
    
    timestamp = int(time.time())
    
    # Сохраняем в историю
    history_path = os.path.join(history_dir, f"opt_frame_{timestamp}.jpg")
    with open(history_path, "wb") as f:
        f.write(data)
        
    # Сохраняем как latest
    latest_path = os.path.join(latest_dir, "latest_opt_frame.jpg")
    with open(latest_path, "wb") as f:
        f.write(data)
        
    return Image(data=data, format="jpeg")

@mcp.tool()
async def get_multiframe() -> Image:
    """Получить композитное изображение из 4 кадров (+30, 0, -40, -80 градусов) для глобального обзора (возвращает само изображение)."""
    data = await _r.cmd_get_multiframe_jpeg()
    if not data:
        return "Ошибка: Не удалось собрать композитный кадр"
    
    # Папка для истории
    history_dir = os.path.abspath("frames_history")
    os.makedirs(history_dir, exist_ok=True)
    
    # Папка для последнего кадра (для модели)
    latest_dir = os.path.abspath("frames_latest")
    os.makedirs(latest_dir, exist_ok=True)
    
    timestamp = int(time.time())
    
    # Сохраняем в историю
    history_path = os.path.join(history_dir, f"multiframe_{timestamp}.jpg")
    with open(history_path, "wb") as f:
        f.write(data)
        
    # Сохраняем как latest
    latest_path = os.path.join(latest_dir, "latest_multiframe.jpg")
    with open(latest_path, "wb") as f:
        f.write(data)
        
    return Image(data=data, format="jpeg")

# --- сервопривод ---

@mcp.tool()
async def set_camera_angle(angle: float) -> str:
    """Установить угол наклона камеры (-80..+30 градусов). Приоритет: HIGH, MEDIUM, LOW."""
    return await _r.cmd_set_camera_angle(angle)


# --- tool-обёртки для ресурсов ---

@mcp.tool()
async def get_telemetry() -> str:
    """Получить основную телеметрию дрона."""
    return _r.res_telemetry()

@mcp.tool()
async def get_battery() -> str:
    """Получить состояние батареи дрона."""
    return _r.res_battery()

@mcp.tool()
async def get_gps() -> str:
    """Получить GPS-данные дрона."""
    return _r.res_gps()

@mcp.tool()
async def get_sensors() -> str:
    """Получить данные сенсоров дрона."""
    return _r.res_sensors()

@mcp.tool()
async def get_flight_state() -> str:
    """Получить состояние полёта дрона."""
    return _r.res_flight_state()

@mcp.tool()
async def start_photogrammetry(project_id: str) -> str:
    """Начать непрерывный сбор фотограмметрии. Кадры будут сохраняться в датасет для указанного проекта."""
    return await _r.cmd_start_photogrammetry(project_id)

@mcp.tool()
async def stop_photogrammetry() -> str:
    """Остановить фоновый сбор фотограмметрии."""
    return await _r.cmd_stop_photogrammetry()


# --- resources ---

@mcp.resource("drone://telemetry")
async def telemetry_resource() -> str:
    """Основная телеметрия дрона."""
    return _r.res_telemetry()

@mcp.resource("drone://battery")
async def battery_resource() -> str:
    """Состояние батареи дрона."""
    return _r.res_battery()

@mcp.resource("drone://sensors")
async def sensors_resource() -> str:
    """Данные сенсоров дрона."""
    return _r.res_sensors()

@mcp.resource("drone://flight_state")
async def flight_state_resource() -> str:
    """Состояние полёта дрона."""
    return _r.res_flight_state()


# --- prompts ---

@mcp.prompt()
def preflight_check() -> list[dict]:
    """Предполётная проверка."""
    return [{"role": "user", "content": "Выполни предполётную проверку дрона перед взлётом.\n\n1. Прочитай ресурс drone://battery и проверь напряжение батареи.\n2. Прочитай ресурс drone://flight_state и проверь систему навигации.\n3. Проверь текущее состояние полёта (fly_state). Для взлёта дрон должен быть в состоянии ON_LAND.\n4. Если все проверки пройдены — сообщи, что дрон готов к взлёту.\n5. Если какая-либо проверка не пройдена — сообщи о проблеме."}]

@mcp.prompt()
def safe_return() -> list[dict]:
    """Безопасное возвращение домой."""
    return [{"role": "user", "content": "Выполни безопасное возвращение дрона домой.\n\n1. Прочитай ресурс drone://flight_state.\n2. Если дрон в воздухе — вызови return_to_home.\n3. Если RTL недоступен — выполни land.\n4. Убедись, что дрон в состоянии ON_LAND.\n5. Сообщи результат."}]

@mcp.prompt()
def fly_circle_plan() -> list[dict]:
    """Планирование полёта по кругу."""
    return [{"role": "user", "content": "Спланируй и выполни полёт дрона по кругу.\n\nЗапроси параметры: радиус, высота, скорость, количество кругов.\n\n1. Проверь батарею и состояние.\n2. Рассчитай точки: x = radius·cos(θ), y = radius·sin(θ), z = altitude.\n3. N = max(12, int(2π·radius / 0.5)).\n4. Последовательно отправляй go_to_local_point.\n5. Сообщи по завершении."}]
