import json
import re
import subprocess
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Planning Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    text: str

class PlanRequest(BaseModel):
    history: List[Message]
    new_prompt: str
    current_route: Optional[Dict[str, Any]] = None


@app.websocket("/stream_flight")
async def stream_flight(websocket: WebSocket):
    await websocket.accept()
    import os
    import asyncio
    try:
        PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
        prompt_path = os.path.join(PROMPTS_DIR, "flight_vla.md")
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            sys_prompt = f.read()
        
        # First message from client should be the route JSON string
        route_str = await websocket.receive_text()
        
        full_prompt = (
            f"{sys_prompt}\n\n"
            f"[ПЛАНОВЫЙ МАРШРУТ ДЛЯ ИСПОЛНЕНИЯ]\n{route_str}\n[КОНЕЦ МАРШРУТА]\n\n"
            f"Выполни полетную миссию строго по указанному маршруту."
        )
        # print("Agent input: ", full_prompt)
        process = await asyncio.create_subprocess_exec(
            "agy", "--print", full_prompt, "--dangerously-skip-permissions", "--print-timeout", "30m",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        send_lock = asyncio.Lock()

        async def read_stream(stream):
            while True:
                line = await stream.readline()
                if not line:
                    break
                line = line.decode('utf-8').strip()
                if line:
                    # print("Agent output: ", line)
                    async with send_lock:
                        await websocket.send_text(line)

        # Keep reading from the websocket to process ping/pong frames and avoid timeout
        async def keep_alive():
            try:
                while True:
                    await websocket.receive()
            except WebSocketDisconnect:
                if process.returncode is None:
                    process.terminate()

        keep_alive_task = asyncio.create_task(keep_alive())

        await asyncio.gather(
            read_stream(process.stdout),
            read_stream(process.stderr)
        )
        await process.wait()
        keep_alive_task.cancel()
    except WebSocketDisconnect:
        print("Client disconnected from ai_service")
        if 'process' in locals() and process.returncode is None:
            process.terminate()
    except Exception as e:
        print("Stream flight error:", e)

@app.websocket("/stream_plan")
async def stream_plan(websocket: WebSocket):
    await websocket.accept()
    import os
    import asyncio
    import json
    try:
        request_str = await websocket.receive_text()
        request_data = json.loads(request_str)
        
        PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
        prompt_path = os.path.join(PROMPTS_DIR, "planning_vla.md")
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            sys_prompt_plan = f.read()
                
        history_text = "\n".join([f"{msg.get('role')}: {msg.get('text')}" for msg in request_data.get('history', [])])
        current_route = request_data.get('current_route')
        current_route_text = json.dumps(current_route, ensure_ascii=False) if current_route else "Пусто"

        full_prompt = (
            f"{sys_prompt_plan}\n\n"
            f"[ТЕКУЩИЙ МАРШРУТ ПРОЕКТА]\n{current_route_text}\n[КОНЕЦ МАРШРУТА]\n\n"
            f"[ИСТОРИЯ ОБСУЖДЕНИЯ]\n{history_text}\n[КОНЕЦ ИСТОРИИ]\n\n"
            f"[Новый запрос пользователя]: {request_data.get('new_prompt')}"
        )

        process = await asyncio.create_subprocess_exec(
            "agy", "--print", full_prompt, "--dangerously-skip-permissions", "--print-timeout", "30m", "--log-file", "/home/sirius/log.jsonl",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        send_lock = asyncio.Lock()

        async def read_stream(stream):
            while True:
                line = await stream.readline()
                if not line:
                    break
                line = line.decode('utf-8').strip()
                if line:
                    print("Agent output: ", line)
                    async with send_lock:
                        await websocket.send_text(line)

        async def keep_alive():
            try:
                while True:
                    await websocket.receive()
            except WebSocketDisconnect:
                if process.returncode is None:
                    process.terminate()

        keep_alive_task = asyncio.create_task(keep_alive())

        await asyncio.gather(
            read_stream(process.stdout),
            read_stream(process.stderr)
        )
        await process.wait()
        keep_alive_task.cancel()

    except WebSocketDisconnect:
        print("Client disconnected from stream_plan")
        if 'process' in locals() and process.returncode is None:
            process.terminate()
    except Exception as e:
        print("Stream plan error:", e)
