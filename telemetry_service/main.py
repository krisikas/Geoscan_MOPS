import os
import asyncio
import json
import base64
import time
import shutil
import urllib.request
import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pioneer_sdk2 import Pioneer

app = FastAPI(title="Telemetry Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Глобальный флаг для паузы фотограмметрии (изначально на паузе)
is_photogrammetry_paused = True

@app.post("/photogrammetry/pause")
async def pause_photogrammetry():
    global is_photogrammetry_paused
    is_photogrammetry_paused = True
    return {"status": "success", "message": "Photogrammetry paused"}

@app.post("/photogrammetry/resume")
async def resume_photogrammetry():
    global is_photogrammetry_paused
    is_photogrammetry_paused = False
    return {"status": "success", "message": "Photogrammetry resumed"}

@app.get("/photogrammetry/status")
async def photogrammetry_status():
    return {"is_paused": is_photogrammetry_paused}


@app.post("/emergency_stop")
async def emergency_stop(ip: str = Query(..., description="IP адрес дрона")):
    """
    Экстренная посадка: подключается к дрону и вызывает land() + disarm()
    """
    try:
        # Pioneer SDK использует tcp="{ip}:20556"
        tcp_address = f"{ip}:20556"
        # Выполняем синхронный код SDK в отдельном треде
        def do_stop():
            try:
                p = Pioneer(tcp=tcp_address)
                p.land()
                time.sleep(0.5)
                p.disarm()
                p.close_connection()
            except SystemExit:
                raise RuntimeError("Pioneer SDK error: Connection refused (SystemExit)")
        
        await asyncio.to_thread(do_stop)
        return {"status": "success", "message": "Emergency landing executed"}
    except Exception as e:
        print(f"Emergency stop failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def fetch_telemetry_loop(websocket: WebSocket, ip: str):
    url = f"http://{ip}:8000/drone/position"
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(url, timeout=1.0) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("status") == "success":
                            pos = data.get("position")
                            if pos:
                                await websocket.send_json({
                                    "type": "telemetry",
                                    "x": pos[0],
                                    "y": pos[1],
                                    "z": pos[2],
                                    "yaw": data.get("orientation", [0, 0, 0])[2] if "orientation" in data else 0 
                                })
                        await asyncio.sleep(0.05)
                    else:
                        # Если 404 или другая ошибка, спим дольше чтобы не спамить
                        await asyncio.sleep(2.0)
            except Exception as e:
                # Тишина при ошибках телеметрии (дрон выключен, плохая связь)
                await asyncio.sleep(2.0)


async def fetch_photo_loop(ip: str, project_id: str, websocket: WebSocket, cookies: dict):
    url = f"http://{ip}:7000/main_camera"
    backend_url_upload = f"http://localhost:8000/api/projects/{project_id}/upload_photo"
    backend_url_clear = f"http://localhost:8000/api/projects/{project_id}/photos"
            
    async with aiohttp.ClientSession(cookies=cookies) as session:
        # 0. Очищаем папку фото перед стартом нового полета
        try:
            await session.delete(backend_url_clear, timeout=2.0)
        except Exception as e:
            print(f"Error clearing photogrammetry folder: {e}")
            
        while True:
            try:
                async with session.get(url, timeout=2.0) as response:
                    if response.status == 200:
                        global is_photogrammetry_paused
                        if is_photogrammetry_paused:
                            await asyncio.sleep(0.4)
                            continue

                        data = await response.json()
                        if "image" in data:
                            img_b64 = data["image"]
                            
                            # 1. Отправляем фото на фронтенд для PIP-трансляции
                            await websocket.send_json({
                                "type": "photo",
                                "image": img_b64
                            })
                            
                            # 2. Отправляем фото на бэкенд для сохранения в БД
                            try:
                                await session.post(backend_url_upload, json={"image": img_b64}, timeout=2.0)
                            except Exception as e:
                                print(f"Error sending photo to backend: {e}")
                                
                        await asyncio.sleep(0.4)
                    else:
                        await asyncio.sleep(2.0)
            except Exception as e:
                await asyncio.sleep(2.0)

@app.websocket("/ws/telemetry/{project_id}")
async def telemetry_ws(websocket: WebSocket, project_id: str, ip: str = Query(...)):
    await websocket.accept()
    
    # Берем куки из вебсокета для авторизации на бэкенде
    cookies = websocket.cookies
    
    telemetry_task = asyncio.create_task(fetch_telemetry_loop(websocket, ip))
    photo_task = asyncio.create_task(fetch_photo_loop(ip, project_id, websocket, cookies))
    
    try:
        while True:
            msg = await websocket.receive_text()
    except WebSocketDisconnect:
        print(f"Client disconnected from telemetry ws for project {project_id}")
    finally:
        telemetry_task.cancel()
        photo_task.cancel()
