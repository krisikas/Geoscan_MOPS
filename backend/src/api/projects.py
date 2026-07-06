import os
import glob
import shutil
import json
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, Project
from src.api.auth import get_current_user
from src.schemas.project import ProjectCreate, ProjectResponse
from src.services.ai import process_ai_image

router = APIRouter()

PROJECTS_ROOT = "data/projects"

def get_status(project_id: int):
    status_file = os.path.join(PROJECTS_ROOT, str(project_id), "status.json")
    if os.path.exists(status_file):
        with open(status_file, "r") as f:
            return json.load(f)
    return {"ai": "idle", "metashape": "idle", "error": None}

def set_status(project_id: int, status_update: dict):
    base = os.path.join(PROJECTS_ROOT, str(project_id))
    os.makedirs(base, exist_ok=True)
    status = get_status(project_id)
    status.update(status_update)
    status_file = os.path.join(base, "status.json")
    with open(status_file, "w") as f:
        json.dump(status, f)

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
        safe_filename = os.path.basename(upload.filename)
        dest_path = os.path.join(dest_dir, safe_filename)
        content = await upload.read()
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
    return get_status(project.id)

def run_ai_task(project_id: int, input_dir: str, output_dir: str, images: List[str]):
    try:
        from src.services.ai import process_ai_image
        for img_name in images:
            in_path = os.path.join(input_dir, img_name)
            out_path = os.path.join(output_dir, img_name)
            process_ai_image(in_path, out_path)
        set_status(project_id, {"ai": "done"})
    except Exception as e:
        set_status(project_id, {"ai": "error", "error": f"Ошибка ИИ: {str(e)}"})

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

    set_status(project.id, {"ai": "processing", "error": None})
    background_tasks.add_task(run_ai_task, project.id, input_dir, output_dir, images)
    return {"status": "started"}

def run_metashape_task(project_id: int, input_dir: str, output_dir: str):
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
            
        set_status(project_id, {"metashape": "done"})
    except Exception as e:
        set_status(project_id, {"metashape": "error", "error": f"Ошибка Metashape: {str(e)}"})

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
        
    set_status(project.id, {"metashape": "processing", "error": None})
    background_tasks.add_task(run_metashape_task, project.id, input_dir, output_dir)
    return {"status": "started"}
