import os
import glob
import shutil
import json
import uuid
import asyncio
import time
from typing import List, Dict, Any, Set, Tuple
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from src.db.database import get_db, SessionLocal
from src.db.models import User, Project
from src.api.auth import get_current_user
from src.schemas.project import ProjectCreate, ProjectResponse, ChatMessageResponse
from src.services.ai import process_ai_image
import httpx
from pydantic import BaseModel, Field, ValidationError
from typing import List, Dict, Any, Set, Tuple, Optional

class AgentToolCall(BaseModel):
    name: str
    args: dict = Field(default_factory=dict)

class AgentResponse(BaseModel):
    content: Optional[str] = None
    tool: Optional[AgentToolCall] = None

class Message(BaseModel):
    role: str
    text: str

class PlanRequest(BaseModel):
    history: List[Message]
    new_prompt: str
    current_route: Optional[Dict[str, Any]] = None

router = APIRouter()
processing_locks: Set[Tuple[int, str, str]] = set()

PROJECTS_ROOT = "data/projects"

def set_project_status(project_id: int, db: Session, update_data: dict):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        if "ai_status" in update_data:
            project.ai_status = update_data["ai_status"]
        if "metashape_status" in update_data:
            project.metashape_status = update_data["metashape_status"]
        if "error_message" in update_data:
            project.error_message = update_data["error_message"]
        db.commit()

def _ensure_project_dirs(project_id: int):
    base = os.path.join(PROJECTS_ROOT, str(project_id))
    for sub in ("ai_input", "ai_output", "metashape_input", "metashape_project", "metashape_ai_output"):
        os.makedirs(os.path.join(base, sub), exist_ok=True)
    return base

def _get_images(folder: str) -> List[str]:
    if not os.path.exists(folder):
        return []
    valid_exts = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".glb", ".gltf"}
    files = []
    for f in os.listdir(folder):
        if os.path.splitext(f)[1].lower() in valid_exts:
            files.append(os.path.join(folder, f))
    files.sort(key=lambda x: os.path.getmtime(x))
    return [os.path.basename(f) for f in files]

@router.post("/", response_model=ProjectResponse)
def create_project(project_in: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_project = Project(name=project_in.name, user_id=current_user.id)
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    _ensure_project_dirs(new_project.id)
    return new_project

@router.get("/", response_model=List[ProjectResponse])
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    base = os.path.join(PROJECTS_ROOT, str(project_id))
    if os.path.exists(base):
        shutil.rmtree(base)
    return {"detail": "Project deleted"}

def is_valid_image(content: bytes) -> bool:
    if content.startswith(b'\xff\xd8\xff'): return True # JPEG
    if content.startswith(b'\x89PNG\r\n\x1a\n'): return True # PNG
    if content.startswith(b'II*\x00') or content.startswith(b'MM\x00*'): return True # TIFF
    if content.startswith(b'BM'): return True # BMP
    return False

@router.post("/{project_id}/upload/{group}")
async def upload_photos(
    project_id: int,
    group: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if group not in ["ai", "metashape"]:
        raise HTTPException(status_code=400, detail="Invalid group")
    
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    base = _ensure_project_dirs(project.id)
    dest_dir = os.path.join(base, "ai_input" if group == "ai" else "metashape_input")
    
    if group == "metashape":
        for d in [dest_dir, os.path.join(base, "metashape_project"), os.path.join(base, "metashape_ai_output")]:
            if os.path.exists(d):
                for f in os.listdir(d):
                    fp = os.path.join(d, f)
                    if os.path.isdir(fp):
                        shutil.rmtree(fp)
                    else:
                        os.remove(fp)
    
    saved = []
    for idx, upload in enumerate(files):
        if not upload.content_type.startswith("image/"):
            continue
        content = await upload.read()
        if not is_valid_image(content):
            continue
        ext = os.path.splitext(upload.filename)[1].lower()
        if group == "metashape":
            safe_filename = os.path.basename(upload.filename)
        else:
            safe_filename = f"{uuid.uuid4().hex}{ext}"
        dest_path = os.path.join(dest_dir, safe_filename)
        with open(dest_path, "wb") as f:
            f.write(content)
        saved.append(safe_filename)
        
    return {"saved": saved}

@router.get("/{project_id}/images")
def list_images(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    base = _ensure_project_dirs(project.id)
    ai_proc = [fname for (pid, grp, fname) in processing_locks if pid == project.id and grp == "ai_input"]
    meta_proc = [fname for (pid, grp, fname) in processing_locks if pid == project.id and grp == "metashape_input"]

    return {
        "ai_input": _get_images(os.path.join(base, "ai_input")),
        "ai_output": _get_images(os.path.join(base, "ai_output")),
        "metashape_input": _get_images(os.path.join(base, "metashape_input")),
        "metashape_project": _get_images(os.path.join(base, "metashape_project")),
        "metashape_ai_output": _get_images(os.path.join(base, "metashape_ai_output")),
        "processing_ai": ai_proc,
        "processing_metashape": meta_proc
    }

@router.get("/{project_id}/images/{group}/{filename}")
def get_image(project_id: int, group: str, filename: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if group not in ["ai_input", "ai_output", "metashape_input", "metashape_project", "metashape_ai_output"]:
        raise HTTPException(status_code=400, detail="Invalid group")
        
    file_path = os.path.join(PROJECTS_ROOT, str(project.id), group, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(file_path)

@router.delete("/{project_id}/images/{group}/{filename}")
def delete_image(project_id: int, group: str, filename: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if group not in ["ai_input", "ai_output", "metashape_input", "metashape_project", "metashape_ai_output"]:
        raise HTTPException(status_code=400, detail="Invalid group")
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    base_dir = os.path.join(PROJECTS_ROOT, str(project.id))
    file_path = os.path.join(base_dir, group, filename)
    if os.path.exists(file_path):
        if os.path.isdir(file_path):
            shutil.rmtree(file_path)
        else:
            os.remove(file_path)
            
    # Delete matching AI output images and data coordinates txt files
    base_name, _ = os.path.splitext(filename)
    if group == "ai_input":
        out_img = os.path.join(base_dir, "ai_output", filename)
        if os.path.exists(out_img):
            os.remove(out_img)
        out_txt = os.path.join(base_dir, "ai_output", f"{base_name}_data.txt")
        if os.path.exists(out_txt):
            os.remove(out_txt)
    elif group == "metashape_input":
        out_img = os.path.join(base_dir, "metashape_ai_output", filename)
        if os.path.exists(out_img):
            os.remove(out_img)
        out_txt = os.path.join(base_dir, "metashape_ai_output", f"{base_name}_data.txt")
        if os.path.exists(out_txt):
            os.remove(out_txt)
    elif group == "ai_output":
        out_txt = os.path.join(base_dir, "ai_output", f"{base_name}_data.txt")
        if os.path.exists(out_txt):
            os.remove(out_txt)
    elif group == "metashape_ai_output":
        out_txt = os.path.join(base_dir, "metashape_ai_output", f"{base_name}_data.txt")
        if os.path.exists(out_txt):
            os.remove(out_txt)
            
    return {"status": "deleted"}

@router.post("/{project_id}/images/{group}/{filename}/process_ai")
def process_single_image_ai(project_id: int, group: str, filename: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if group not in ["ai_input", "metashape_input"]:
        raise HTTPException(status_code=400, detail="Single image processing is only allowed for input folders")
        
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    base = os.path.join(PROJECTS_ROOT, str(project.id))
    input_dir = os.path.join(base, group)
    
    if group == "ai_input":
        output_dir = os.path.join(base, "ai_output")
    else:
        output_dir = os.path.join(base, "metashape_ai_output")
    
    if not os.path.exists(os.path.join(input_dir, filename)):
         raise HTTPException(status_code=404, detail="Image not found")
         
    lock_key = (project.id, group, filename)
    if lock_key in processing_locks:
        while lock_key in processing_locks:
            time.sleep(0.5)
        return {"status": "done"}
        
    processing_locks.add(lock_key)
    try:
        from src.services.ai import process_ai_image
        process_ai_image(os.path.join(input_dir, filename), os.path.join(output_dir, filename))
    except Exception as e:
        if lock_key in processing_locks:
            processing_locks.remove(lock_key)
        raise HTTPException(status_code=500, detail=f"Ошибка обработки ИИ: {str(e)}")
    finally:
        if lock_key in processing_locks:
            processing_locks.remove(lock_key)
        
    return {"status": "done"}

@router.get("/{project_id}/status")
def get_project_status(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "ai": project.ai_status,
        "metashape": project.metashape_status,
        "error": project.error_message
    }

@router.get("/{project_id}/status/stream")
async def get_project_status_stream(project_id: int, current_user: User = Depends(get_current_user)):
    async def event_generator():
        last_state = None
        while True:
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
                if not project:
                    yield f"data: {json.dumps({'error': 'Project deleted'})}\n\n"
                    break
                
                current_state = {
                    "ai": project.ai_status,
                    "metashape": project.metashape_status,
                    "error": project.error_message
                }
                if current_state != last_state:
                    yield f"data: {json.dumps(current_state)}\n\n"
                    last_state = current_state
            except Exception:
                pass
            finally:
                db.close()
                
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

def run_ai_task(project_id: int, input_dir: str, output_dir: str, images: List[str]):
    db = SessionLocal()
    try:
        from src.services.ai import process_ai_image
        for img_name in images:
            in_path = os.path.join(input_dir, img_name)
            out_path = os.path.join(output_dir, img_name)
            process_ai_image(in_path, out_path)
        set_project_status(project_id, db, {"ai_status": "done"})
    except Exception as e:
        set_project_status(project_id, db, {"ai_status": "error", "error_message": f"Ошибка ИИ: {str(e)}"})
    finally:
        db.close()

@router.post("/{project_id}/process/ai")
def process_ai(project_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    base = _ensure_project_dirs(project.id)
    input_dir = os.path.join(base, "ai_input")
    output_dir = os.path.join(base, "ai_output")
    
    images = _get_images(input_dir)
    if not images:
        raise HTTPException(status_code=400, detail="Нет фотографий для обработки. Пожалуйста, загрузите исходники.")
        
    try:
        from src.services.ai import process_ai_image
    except ImportError:
        raise HTTPException(status_code=503, detail="Ошибка: Модуль ИИ не найден или не установлен. Проверьте зависимости.")

    set_project_status(project.id, db, {"ai_status": "processing", "error_message": None})
    background_tasks.add_task(run_ai_task, project.id, input_dir, output_dir, images)
    return {"status": "started"}

def run_metashape_task(project_id: int, input_dir: str, output_dir: str):
    db = SessionLocal()
    try:
        from src.services.metashape import process_metashape as run_metashape
        ortho_out = os.path.join(output_dir, "orthomosaic.png")
        proj_out = os.path.join(output_dir, "project.psx")
        run_metashape(input_dir, ortho_out, proj_out)
            
        set_project_status(project_id, db, {"metashape_status": "done"})
    except Exception as e:
        set_project_status(project_id, db, {"metashape_status": "error", "error_message": f"Ошибка Metashape: {str(e)}"})
    finally:
        db.close()

@router.post("/{project_id}/process/metashape")
def process_metashape(project_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
        
    base = _ensure_project_dirs(project.id)
    input_dir = os.path.join(base, "metashape_input")
    output_dir = os.path.join(base, "metashape_project")
    
    images = _get_images(input_dir)
    if not images:
        raise HTTPException(status_code=400, detail="Нет фотографий для обработки в Metashape.")
        
    try:
        from src.services.metashape import process_metashape as run_metashape
    except ImportError:
        raise HTTPException(status_code=503, detail="Ошибка: Библиотека Metashape не установлена в системе.")
        
    set_project_status(project.id, db, {"metashape_status": "processing", "error_message": None})
    background_tasks.add_task(run_metashape_task, project.id, input_dir, output_dir)
    return {"status": "started"}

@router.post("/{project_id}/plan")
async def generate_plan(project_id: int, request: PlanRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    try:
        from src.db.models import ChatMessage
        import json
        
        user_msg = ChatMessage(project_id=project_id, role="user", content=request.new_prompt)
        db.add(user_msg)
        db.commit()

        async with httpx.AsyncClient() as client:
            response = await client.post("http://localhost:8001/plan", json=request.model_dump(), timeout=120.0)
            response.raise_for_status()
            ai_data = response.json()
            
            project.route_data = {"coordinates": ai_data.get("coordinates"), "buildings": ai_data.get("buildings")}
            ai_msg = ChatMessage(
                project_id=project_id, 
                role="ai", 
                content=ai_data.get("text", "")
            )
            db.add(ai_msg)
            db.commit()
            
            return ai_data
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI Service is unreachable: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"AI Service error: {e.response.text}")

@router.get("/{project_id}/chat", response_model=List[ChatMessageResponse])
def get_chat_messages(project_id: int, limit: int = 50, offset: int = 0, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    from src.db.models import ChatMessage
    messages = db.query(ChatMessage).filter(ChatMessage.project_id == project_id).order_by(ChatMessage.created_at.desc()).offset(offset).limit(limit).all()
    # Return in chronological order
    return messages[::-1]

@router.post("/{project_id}/start_flight")
def start_flight(project_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # We will just update status here and route_data
    # Actually, we need coordinates. Let's make a Pydantic model for it.
    pass

from fastapi import WebSocket, WebSocketDisconnect

@router.websocket("/{project_id}/stream_flight")
async def stream_flight(websocket: WebSocket, project_id: int, ip: str = "127.0.0.1"):
    await websocket.accept()
    try:
        import os
        import json
        import asyncio
        from src.db.database import SessionLocal
        from src.db.models import ChatMessage

        db = SessionLocal()
        from src.db.models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        
        route_data = project.route_data if project and project.route_data else {}
        route_data["drone_ip"] = ip
        route_json = json.dumps(route_data, ensure_ascii=False)
        
        separator = ChatMessage(project_id=project_id, role="system", content="[SEPARATOR] Начало полета")
        db.add(separator)
        db.commit()
        await websocket.send_json({"role": "system", "content": "[SEPARATOR] Начало полета"})

        import websockets
        
        try:
            # Disable websockets library ping timeout so it doesn't kill long idle streams
            async with websockets.connect("ws://localhost:8001/stream_flight", ping_interval=None, ping_timeout=None) as ai_ws:
                await ai_ws.send(route_json)
                
                # Start a keep_alive task to process ping/pong from the frontend browser
                async def keep_alive_front():
                    try:
                        while True:
                            try:
                                msg = await websocket.receive_json()
                                if msg.get("action") == "stop":
                                    await ai_ws.close()
                                    break
                            except Exception:
                                pass
                    except WebSocketDisconnect:
                        pass
                
                frontend_keep_alive = asyncio.create_task(keep_alive_front())
                
                try:
                    while True:
                        line = await ai_ws.recv()
                        if line:
                            try:
                                agent_resp = AgentResponse.model_validate_json(line)
                                try:
                                    if agent_resp.tool:
                                        content_str = f"[TOOL] {agent_resp.tool.name}: {json.dumps(agent_resp.tool.args, ensure_ascii=False)}"
                                        msg = ChatMessage(project_id=project_id, role="system", content=content_str)
                                        db.add(msg)
                                        await websocket.send_json({"role": "system", "content": content_str})
                                    
                                    if agent_resp.content and agent_resp.content.strip():
                                        msg = ChatMessage(project_id=project_id, role="ai", content=agent_resp.content.strip())
                                        db.add(msg)
                                        await websocket.send_json({"role": "ai", "content": agent_resp.content.strip()})
                                    
                                    db.commit()
                                except Exception as e:
                                    print("DB save error", e)
                            except ValidationError:
                                # Fallback to save raw line as text if JSON doesn't match schema or isn't valid JSON
                                try:
                                    msg = ChatMessage(project_id=project_id, role="ai", content=line)
                                    db.add(msg)
                                    db.commit()
                                    await websocket.send_json({"role": "ai", "content": line})
                                except Exception as e:
                                    print("DB save error", e)
                except websockets.exceptions.ConnectionClosed:
                    pass
                finally:
                    frontend_keep_alive.cancel()
        except Exception as e:
            print("Error connecting to ai_service websocket:", e)
            await websocket.send_json({"role": "ai", "content": f"Ошибка соединения с AI Service: {str(e)}"})
        end_separator = ChatMessage(project_id=project_id, role="system", content="[SEPARATOR] Конец полета")
        db.add(end_separator)
        db.commit()
        await websocket.send_json({"role": "system", "content": "[SEPARATOR] Конец полета"})
        
    except WebSocketDisconnect:
        print("Client disconnected")
    finally:
        if 'db' in locals():
            db.close()
