"""Ядро управления дроном."""

from __future__ import annotations
import asyncio
import json
import logging
import math
import cv2
import numpy as np
import urllib.request
import aiohttp
import os
import time
import base64
from dotenv import load_dotenv
from pioneer_sdk2 import Pioneer


load_dotenv()

class CameraStreamer:
    def __init__(self, ip: str):
        self.ip = ip

    def get_jpeg(self) -> bytes | None: # Возвращаем bytes
        try:
            req = urllib.request.Request(f'http://{self.ip}:7000/main_camera')
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    
                    # Декодируем из Base64 обратно в СЫРЫЕ БАЙТЫ
                    img_data = base64.b64decode(data['image']) 
                    
                    np_arr = np.frombuffer(img_data, np.uint8)
                    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        # Меняем размер на 540x360 (ширина x высота)
                        resized_frame = cv2.resize(frame, (540, 360))
                        # Кодируем обратно в JPEG
                        _, buffer = cv2.imencode('.jpg', resized_frame)
                        img_data = buffer.tobytes()
                    
                    return img_data 
        except Exception:
            pass
        return None

    def get_opt_jpeg(self) -> bytes | None:
        try:
            req = urllib.request.Request(f'http://{self.ip}:7000/opt_camera')
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    
                    # Декодируем из Base64 обратно в СЫРЫЕ БАЙТЫ
                    img_data = base64.b64decode(data['image']) 
                    
                    np_arr = np.frombuffer(img_data, np.uint8)
                    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        # Меняем размер на 540x360 (ширина x высота)
                        resized_frame = cv2.resize(frame, (540, 360))
                        # Кодируем обратно в JPEG
                        _, buffer = cv2.imencode('.jpg', resized_frame)
                        img_data = buffer.tobytes()
                    
                    return img_data 
        except Exception:
            pass
        return None

_Camera = None
_CameraType = None
_ImageViewer = None
_lg = logging.getLogger(__name__)

class DroneRuntime:

    _instance: DroneRuntime | None = None

    # --- конфиг (mangled) ---
    drone_ip = os.getenv("DRONE_IP")
    __DEFAULT_TCP = f"{drone_ip}:20556"
    __DEFAULT_BAUDRATE = 57600
    __MAX_ALT = 10.0
    __MAX_SPD = 3.0
    __MIN_BAT = 3.0
    __MAX_YAW_RATE = 1.82

    def __new__(cls) -> DroneRuntime:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.__p = None
            cls._instance.__conn = False
            cls._instance.__cam = None
            cls._instance.__cam_t = None
            cls._instance.__srv = None
            cls._instance.__iv = None
            cls._instance.__streamer = None
        return cls._instance

    # ---- internal helpers (mangled) ----

    def __ok(self, msg: str, data: dict | None = None) -> str:
        r: dict = {"success": True, "message": msg}
        if data is not None:
            r["data"] = data
        return json.dumps(r, ensure_ascii=False)

    def __err(self, msg: str) -> str:
        return json.dumps({"success": False, "message": msg}, ensure_ascii=False)

    def __chk(self) -> str | None:
        if not self.__conn:
            return self.__err("Дрон не подключён")
        return None

    def __chk_sky(self) -> str | None:
        if self.__fly_state_name() != "IN_SKY":
            return self.__err("Дрон не в воздухе, выполните arm и takeoff")
        return None

    def __chk_alt(self, z: float) -> str | None:
        if abs(z) > self.__MAX_ALT:
            return self.__err(f"Высота {abs(z)} м превышает лимит {self.__MAX_ALT} м")
        return None

    def __chk_spd(self, vx: float, vy: float, vz: float) -> str | None:
        s = math.sqrt(vx**2 + vy**2 + vz**2)
        if s > self.__MAX_SPD:
            return self.__err(f"Скорость {s:.2f} м/с превышает лимит {self.__MAX_SPD} м/с")
        return None

    def __chk_bat(self) -> str | None:
        try:
            v = 8.0 # ПРОСТО КОСТЫЛЬ
        except Exception:
            v = None
        if v is None:
            return self.__err(f"Напряжение батареи неизвестно, минимум {self.__MIN_BAT} В")
        if v < self.__MIN_BAT:
            return self.__err(f"Напряжение батареи {v} В ниже минимума {self.__MIN_BAT} В")
        return None

    def __hexc(self, exc: Exception) -> None:
        _lg.error("Ошибка Pioneer: %s", exc)
        if self.__p is not None and self.__p.messenger is None:
            self.__conn = False
            _lg.warning("Соединение с дроном потеряно")

    def __fly_state_name(self) -> str:
        return self.__p.get_fly_state().name


    @property
    def connected(self) -> bool:
        return self.__conn

    async def cmd_connect(self, tcp: str | None = None, serial: str | None = None, baudrate: int | None = None) -> str:
        if self.__conn and self.__p is not None:
            return self.__ok("Уже подключён")
        _tcp = tcp if tcp is not None else self.__DEFAULT_TCP
        _br = baudrate if baudrate is not None else self.__DEFAULT_BAUDRATE
        try:
            self.__p = await asyncio.to_thread(Pioneer, serial=serial, tcp=_tcp, baudrate=_br)
            self.__conn = True
            
            # Инициализация камеры
            if self.__streamer is None:
                drone_ip = _tcp.split(':')[0]
                self.__streamer = CameraStreamer(drone_ip)
            
            return self.__ok("Подключение установлено")
        except SystemExit as e:
            self.__p = None
            self.__conn = False
            return self.__err(f"Не удалось подключиться (код {e.code}). Проверьте порт.")
        except Exception as e:
            self.__p = None
            self.__conn = False
            return self.__err(str(e))

    async def cmd_disconnect(self) -> str:
        e = self.__chk()
        if e:
            return e
        self.__stop_cam()
        if self.__iv is not None:
            try:
                self.__iv.close()
            except Exception:
                pass
            self.__iv = None
        self.__srv = None
        if self.__p is not None:
            try:
                await asyncio.to_thread(self.__p.close_connection)
            except Exception:
                pass
        self.__p = None
        self.__conn = False
        return self.__ok("Дрон отключён")

    async def cmd_arm(self, timeout: int = 5, retries: int = 0) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = await asyncio.to_thread(self.__p.arm, timeout, retries)
            return self.__ok("Моторы запущены") if r else self.__err("Не удалось запустить моторы")
        except RuntimeError as ex:
            return self.__err(str(ex))
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_disarm(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = self.__p.disarm()
            return self.__ok("Моторы остановлены") if r else self.__err("Не удалось остановить моторы")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_takeoff(self) -> str:
        e = self.__chk()
        if e:
            return e
        be = self.__chk_bat()
        if be:
            return be
        try:
            r = await asyncio.to_thread(self.__p.takeoff)
            return self.__ok("Взлёт выполнен") if r else self.__err("Не удалось выполнить взлёт")
        except RuntimeError as ex:
            return self.__err(str(ex))
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_land(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = await asyncio.to_thread(self.__p.land)
            return self.__ok("Посадка выполнена") if r else self.__err("Не удалось выполнить посадку")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_rtl(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = self.__p.rtl()
            return self.__ok("Возврат домой начат") if r else self.__err("Не удалось начать возврат домой")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_emergency_land(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            await asyncio.to_thread(self.__p.land)
            self.__p.disarm()
            return self.__ok("Экстренная посадка выполнена")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    # ---- навигация ----

    async def cmd_go_to_local_point(self, x: float, y: float, z: float, yaw: float | None = None, speed: float = 0.6) -> str:
        for c in (self.__chk(), self.__chk_sky(), self.__chk_alt(z), self.__chk_bat()):
            if c:
                return c
        try:
            # Получаем текущую позицию для расчета дистанции и времени
            lp = None
            drone_ip = self.__DEFAULT_TCP.split(':')[0]
            url = f"http://{drone_ip}:8000/drone/position"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=5) as response:
                        resp_data = await response.json()
                        if resp_data.get("status") == "success":
                            lp = resp_data.get("position")
            except Exception:
                pass
            
            flight_time = 0
            if lp:
                distance = math.sqrt((x - lp[0])**2 + (y - lp[1])**2 + (z - lp[2])**2)
                flight_time = int(distance / speed) if speed > 0 else 0

            self.__p.go_to_local_point(x, y, z, yaw, time=flight_time)

            while not self.__p.point_reached():
                await asyncio.sleep(0.1)

            return self.__ok("Команда полёта к точке отправлена", {"x": x, "y": y, "z": z, "yaw": yaw, "speed": speed, "flight_time": flight_time})
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_go_to_local_point_relative(self, dx: float, dy: float, dz: float, dyaw: float | None = None, speed: float = 0.6) -> str:
        for c in (self.__chk(), self.__chk_sky(), self.__chk_bat()):
            if c:
                return c

        try:
            o = self.__p.get_orientation()
            
            # --- Запрос позиции по HTTP ---
            lp = None
            drone_ip = self.__DEFAULT_TCP.split(':')[0]
            url = f"http://{drone_ip}:8000/drone/position"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=5) as response:
                    resp_data = await response.json()
                    if resp_data.get("status") == "success":
                        lp = resp_data.get("position")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(f"Ошибка получения телеметрии по HTTP: {ex}")

        if not lp or not o:
            return self.__err("Не удалось получить текущую позицию или ориентацию дрона")

        current_x, current_y, current_z = lp[0], lp[1], lp[2]
        current_yaw = o[2]

        # Переводим текущий угол yaw в радианы для тригонометрических расчетов.
        yaw_rad = math.radians(current_yaw)

        target_x = current_x + (dx * math.cos(yaw_rad) - dy * math.sin(yaw_rad))
        target_y = current_y + (dx * math.sin(yaw_rad) + dy * math.cos(yaw_rad))
        target_z = current_z + dz

        target_yaw = current_yaw + dyaw if dyaw is not None else None

        c_alt = self.__chk_alt(target_z)
        if c_alt:
            return c_alt
            
        distance = math.sqrt(dx**2 + dy**2 + dz**2)
        flight_time = int(distance / speed) if speed > 0 else 0

        try:
            self.__p.go_to_local_point(target_x, target_y, target_z, target_yaw, time=flight_time)

            # Заменяем блокирующий цикл на асинхронный
            while not self.__p.point_reached():
                await asyncio.sleep(0.1)

            return self.__ok("Команда относительного полёта выполнена", {
                "dx": dx, "dy": dy, "dz": dz, "dyaw": dyaw, "speed": speed, "flight_time": flight_time,
                "target_x": round(target_x, 3), 
                "target_y": round(target_y, 3), 
                "target_z": round(target_z, 3)
            })
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))


    async def cmd_set_velocity(self, vx: float, vy: float, vz: float, yaw_rate: float) -> str:
        for c in (self.__chk(), self.__chk_sky()):
            if c:
                return c
        if abs(yaw_rate) > self.__MAX_YAW_RATE:
            return self.__err(f"Скорость рысканья не должна превышать {self.__MAX_YAW_RATE} рад/с")
        for c in (self.__chk_spd(vx, vy, vz), self.__chk_bat()):
            if c:
                return c
        try:
            self.__p.set_manual_speed(vx, vy, vz, yaw_rate)
            return self.__ok("Скорость задана", {"vx": vx, "vy": vy, "vz": vz, "yaw_rate": yaw_rate})
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_set_velocity_bf(self, vx: float, vy: float, vz: float, yaw_rate: float) -> str:
        for c in (self.__chk(), self.__chk_sky()):
            if c:
                return c
        if abs(yaw_rate) > self.__MAX_YAW_RATE:
            return self.__err(f"Скорость рысканья не должна превышать {self.__MAX_YAW_RATE} рад/с")
        for c in (self.__chk_spd(vx, vy, vz), self.__chk_bat()):
            if c:
                return c
        try:
            self.__p.set_manual_speed_body_fixed(vx, vy, vz, yaw_rate)
            return self.__ok("Скорость (body-fixed) задана", {"vx": vx, "vy": vy, "vz": vz, "yaw_rate": yaw_rate})
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_hold_position(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            self.__p.set_manual_speed(0, 0, 0, 0)
            return self.__ok("Дрон удерживает позицию")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    async def cmd_set_yaw(self, angle_deg: float) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = self.__p.set_yaw(angle_deg)
            return self.__ok("Угол рыскания установлен", {"angle_deg": angle_deg}) if r else self.__err("Не удалось установить угол рыскания")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    # ---- камера ----

    def get_frame_jpeg(self) -> bytes:
        if not self.__conn or not self.__streamer:
            return b""
            
        jpg = self.__streamer.get_jpeg()
        if jpg is None:
            return b""
        return jpg

    def get_opt_frame_jpeg(self) -> bytes:
        if not self.__conn or not self.__streamer:
            return b""
            
        jpg = self.__streamer.get_opt_jpeg()
        if jpg is None:
            return b""
        return jpg

    async def cmd_get_multiframe_jpeg(self) -> bytes | None:
        if not self.__conn or not self.__streamer:
            return None

        was_paused = True
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get("http://localhost:8002/photogrammetry/status", timeout=2) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        was_paused = data.get("is_paused", True)
                
                if not was_paused:
                    await session.post("http://localhost:8002/photogrammetry/pause", timeout=2)
        except Exception as e:
            _lg.warning(f"Failed to handle photogrammetry pause: {e}")

        angles = [30, 0, -40, -80]
        frames = []
        for angle in angles:
            await self.cmd_set_camera_angle(angle)
            await asyncio.sleep(0.9)
            img_bytes = self.get_frame_jpeg()
            
            frame = None
            if img_bytes:
                np_arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is None:
                # Черная заглушка 540x360 если кадр не получен
                frame = np.zeros((360, 540, 3), dtype=np.uint8)
            
            # Подпись угла
            label = f"{angle} deg"
            font = cv2.FONT_HERSHEY_SIMPLEX
            cv2.putText(frame, label, (10, 340), font, 1, (0, 0, 0), 4, cv2.LINE_AA)
            cv2.putText(frame, label, (10, 340), font, 1, (255, 255, 255), 2, cv2.LINE_AA)
            
            frames.append(frame)

        # Склейка 2x2
        top = np.hstack((frames[0], frames[1]))
        bottom = np.hstack((frames[2], frames[3]))
        combined = np.vstack((top, bottom))

        _, buffer = cv2.imencode('.jpg', combined)

        # Возвращаем камеру в базовое положение
        await self.cmd_set_camera_angle(-20)

        if not was_paused:
            try:
                async with aiohttp.ClientSession() as session:
                    await session.post("http://localhost:8002/photogrammetry/resume", timeout=2)
            except Exception as e:
                _lg.warning(f"Failed to resume photogrammetry: {e}")

        return buffer.tobytes()


    # # ---- сервопривод ----

    async def cmd_set_camera_angle(self, angle: float) -> str:
        try:
            drone_ip = self.__DEFAULT_TCP.split(':')[0]
            url = f"http://{drone_ip}:8000/camera/set_angle"
            
            # На всякий случай проверяем/кастим в int для нашего сервера
            params = {'angle': int(angle)}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=3) as response:
                    response_text = await response.text()
                    response_data = json.loads(response_text)
                    
                    if response.status == 200:
                        return self.__ok(f"Угол камеры установлен: {angle}°", {"angle": angle})
                    else:
                        error_msg = response_data.get("message", "Неизвестная ошибка")
                        return self.__err(f"Ошибка сервера {response.status}: {error_msg}")

        except ValueError as ex:
            return self.__err(f"Ошибка валидации: {str(ex)}")
        except Exception as ex:
            return self.__err(f"Ошибка подключения к дрону: {str(ex)}")

    # ---- reboot ----

    async def cmd_reboot(self) -> str:
        e = self.__chk()
        if e:
            return e
        try:
            r = await asyncio.to_thread(self.__p.reboot_board)
            if r:
                self.__conn = False
                self.__p = None
                return self.__ok("Плата автопилота перезагружена. Требуется повторное подключение.")
            return self.__err("Перезагрузка запрещена для данной платы")
        except Exception as ex:
            self.__hexc(ex)
            return self.__err(str(ex))

    # ---- телеметрия (возвращают JSON-строки) ----

    def res_telemetry(self) -> str:
        if not self.__conn:
            return json.dumps({"error": "Дрон не подключён"}, ensure_ascii=False)
        try:
            o = self.__p.get_orientation()
            
            # --- Заменяем стандартный вызов на получение позиции по HTTP ---
            lp = None
            try:
                drone_ip = self.__DEFAULT_TCP.split(':')[0]
                url = f"http://{drone_ip}:8000/drone/position"
                
                # Делаем синхронный запрос с небольшим таймаутом, чтобы не повесить программу
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=5) as response:
                    # У urllib не-200 статусы вызывают исключение HTTPError, 
                    # поэтому сюда мы попадаем только если всё ок (200)
                    resp_data = json.loads(response.read().decode('utf-8'))
                    if resp_data.get("status") == "success":
                        lp = resp_data.get("position")
            except Exception as http_ex:
                print(f"Ошибка получения позиции по HTTP: {http_ex}")
            # ----------------------------------------------------------------
            
            lv = self.__p.get_local_velocity_lps()
            print("lp: ", lp)
            
            return json.dumps({
                "fly_state": self.__fly_state_name(),
                "altitude": self.__p.get_altitude(),
                "orientation": {"roll": o[0] if o else None, "pitch": o[1] if o else None, "yaw": o[2] if o else None},
                "local_position": {"x": lp[0] if lp else None, "y": lp[1] if lp else None, "z": lp[2] if lp else None},
                "local_velocity": {"vx": lv[0] if lv else None, "vy": lv[1] if lv else None, "vz": lv[2] if lv else None},
                "flight_time": self.__p.flight_time(),
                "uptime": self.__p.uptime(),
            }, ensure_ascii=False)
        except Exception as ex:
            return json.dumps({"error": str(ex)}, ensure_ascii=False)
        

    def res_battery(self) -> str:
        if not self.__conn:
            return json.dumps({"error": "Дрон не подключён"}, ensure_ascii=False)
        try:
            # b = self.__p.get_battery_status()
            b = 8.0 # ПРОСТО КОСТЫЛЬ
            return json.dumps({"voltage": b[0] if b else None, "temperature": b[1] if b else None}, ensure_ascii=False)
        except Exception as ex:
            return json.dumps({"error": str(ex)}, ensure_ascii=False)
        

    def res_sensors(self) -> str:
        if not self.__conn:
            return json.dumps({"error": "Дрон не подключён"}, ensure_ascii=False)
        try:
            a = self.__p.get_accel()
            g = self.__p.get_gyro()
            m = self.__p.get_mag()
            op = self.__p.get_optical_data()
            rn = self.__p.get_ranger_data()
            return json.dumps({
                "accel": {"x": a[0] if a else None, "y": a[1] if a else None, "z": a[2] if a else None},
                "gyro": {"x": g[0] if g else None, "y": g[1] if g else None, "z": g[2] if g else None},
                "mag": {"x": m[0] if m else None, "y": m[1] if m else None, "z": m[2] if m else None},
                "distance_sensor": self.__p.get_dist_sensor_data(),
                "optical_flow": {"x": op[0] if op else None, "y": op[1] if op else None, "range": op[2] if op else None},
                "ranger": {
                    "right": rn[0] if rn and len(rn) > 0 else None,
                    "left": rn[1] if rn and len(rn) > 1 else None,
                    "front": rn[2] if rn and len(rn) > 2 else None,
                    "back": rn[3] if rn and len(rn) > 3 else None,
                    "above_below": rn[4] if rn and len(rn) > 4 else None,
                },
            }, ensure_ascii=False)
        except Exception as ex:
            return json.dumps({"error": str(ex)}, ensure_ascii=False)

    def res_flight_state(self) -> str:
        if not self.__conn:
            return json.dumps({"error": "Дрон не подключён"}, ensure_ascii=False)
        try:
            return json.dumps({
                "fly_state": self.__fly_state_name(),
                "connected": self.__conn,
                "nav_system": self.__p.get_nav_system().name,
            }, ensure_ascii=False)
        except Exception as ex:
            return json.dumps({"error": str(ex)}, ensure_ascii=False)

    # ---- фотограмметрия (управление) ----

    async def cmd_pause_photogrammetry(self) -> str:
        try:
            url = f"http://localhost:8002/photogrammetry/pause"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, timeout=5) as response:
                    response_data = await response.json()
                    if response.status == 200 and response_data.get("status") == "success":
                        return self.__ok("Сбор фотограмметрии приостановлен")
                    else:
                        error_msg = response_data.get("message", "Неизвестная ошибка")
                        return self.__err(f"Ошибка сервера {response.status}: {error_msg}")
        except Exception as ex:
            return self.__err(f"Ошибка HTTP запроса: {str(ex)}")

    async def cmd_resume_photogrammetry(self) -> str:
        try:
            url = f"http://localhost:8002/photogrammetry/resume"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, timeout=5) as response:
                    response_data = await response.json()
                    if response.status == 200 and response_data.get("status") == "success":
                        return self.__ok("Сбор фотограмметрии возобновлен")
                    else:
                        error_msg = response_data.get("message", "Неизвестная ошибка")
                        return self.__err(f"Ошибка сервера {response.status}: {error_msg}")
        except Exception as ex:
            return self.__err(f"Ошибка HTTP запроса: {str(ex)}")
