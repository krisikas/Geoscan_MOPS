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
                                    "yaw": 0 
                                })
                        await asyncio.sleep(0.05)
                    else:
                        # Если 404 или другая ошибка, спим дольше чтобы не спамить
                        await asyncio.sleep(2.0)
            except Exception as e:
                # Тишина при ошибках телеметрии (дрон выключен, плохая связь)
                await asyncio.sleep(2.0)


async def fetch_photo_loop(ip: str, project_id: str):
    url = f"http://{ip}:7000/main_camera"
    
    # Подготовка папки
    metashape_dir = os.path.join(PROJECT_ROOT, "backend", "data", "projects", project_id, "metashape_input")
    os.makedirs(metashape_dir, exist_ok=True)
    
    # Очистка папки перед началом
    for f in os.listdir(metashape_dir):
        file_path = os.path.join(metashape_dir, f)
        if os.path.isfile(file_path):
            os.remove(file_path)
            
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(url, timeout=2.0) as response:
                    if response.status == 200:
                        data = await response.json()
                        if "image" in data:
                            img_data = base64.b64decode(data["image"])
                            filename = f"frame_{int(time.time()*1000)}.jpg"
                            filepath = os.path.join(metashape_dir, filename)
                            # Выполняем запись в тред-пуле
                            def save_file():
                                with open(filepath, "wb") as f:
                                    f.write(img_data)
                            await asyncio.to_thread(save_file)
                        await asyncio.sleep(0.4)
                    else:
                        await asyncio.sleep(2.0)
            except Exception as e:
                await asyncio.sleep(2.0)


@app.websocket("/ws/telemetry/{project_id}")
async def telemetry_ws(websocket: WebSocket, project_id: str, ip: str = Query(...)):
    await websocket.accept()
    
    telemetry_task = asyncio.create_task(fetch_telemetry_loop(websocket, ip))
    photo_task = asyncio.create_task(fetch_photo_loop(ip, project_id))
    
    try:
        while True:
            # Поддержание соединения, ожидаем сообщения от клиента (например, ping/pong)
            msg = await websocket.receive_text()
    except WebSocketDisconnect:
        print(f"Client disconnected from telemetry ws for project {project_id}")
    finally:
        telemetry_task.cancel()
        photo_task.cancel()
