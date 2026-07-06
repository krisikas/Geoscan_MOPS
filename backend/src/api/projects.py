import os
import glob
import shutil
import json
import uuid
import asyncio
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from src.db.database import get_db, SessionLocal
from src.db.models import User, Project
from src.api.auth import get_current_user
from src.schemas.project import ProjectCreate, ProjectResponse
from src.services.ai import process_ai_image

router = APIRouter()

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
    for sub in ("ai_input", "ai_output", "metashape_input", "metashape_output"):
        os.makedirs(os.path.join(base, sub), exist_ok=True)
    return base

def _get_images(folder: str) -> List[str]:
    patterns = ("*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.bmp")
    files = []
    for p in patterns:
        files.extend(glob.glob(os.path.join(folder, p)))
    return sorted([os.path.basename(f) for f in files])

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
    
    saved = []
    for upload in files:
        if not upload.content_type.startswith("image/"):
            continue
        content = await upload.read()
        if not is_valid_image(content):
            continue
        ext = os.path.splitext(upload.filename)[1].lower()
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
    return {
        "ai_input": _get_images(os.path.join(base, "ai_input")),
        "ai_output": _get_images(os.path.join(base, "ai_output")),
        "metashape_input": _get_images(os.path.join(base, "metashape_input")),
        "metashape_output": _get_images(os.path.join(base, "metashape_output"))
    }

@router.get("/{project_id}/images/{group}/{filename}")
def get_image(project_id: int, group: str, filename: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if group not in ["ai_input", "ai_output", "metashape_input", "metashape_output"]:
        raise HTTPException(status_code=400, detail="Invalid group")
        
    file_path = os.path.join(PROJECTS_ROOT, str(project.id), group, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(file_path)

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
async def get_project_status_stream(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    async def event_generator():
        last_state = None
        while True:
            db.refresh(project)
            current_state = {
                "ai": project.ai_status,
                "metashape": project.metashape_status,
                "error": project.error_message
            }
            if current_state != last_state:
                yield f"data: {json.dumps(current_state)}\n\n"
                last_state = current_state
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
        res = run_metashape(input_dir, ortho_out, proj_out)
        
        ai_out = os.path.join(output_dir, "orthomosaic_ai.png")
        try:
            from src.services.ai import process_ai_image
            process_ai_image(res, ai_out)
        except Exception:
            shutil.copy2(res, ai_out)
            
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
    output_dir = os.path.join(base, "metashape_output")
    
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
