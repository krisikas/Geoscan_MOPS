import glob
import os
import shutil
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware

from src.db.database import Base, engine
from src.db.models import User, Project
from src.api.auth import router as auth_router, get_current_user
from src.api.projects import router as projects_router

from sqlalchemy import text
import shutil
import os

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_models JSON DEFAULT '[]'::json;"))
        conn.commit()
except Exception:
    pass

def init_ai_models():
    src_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(src_dir)
    weights_dir = os.path.join(backend_dir, "weights")
    cracksam_code_dir = os.path.join(src_dir, "cracksam")
    cracksam_weights = os.path.join(weights_dir, "cracksam")
    yolo_weights = os.path.join(weights_dir, "yolo")
    
    os.makedirs(cracksam_code_dir, exist_ok=True)
    os.makedirs(cracksam_weights, exist_ok=True)
    os.makedirs(yolo_weights, exist_ok=True)
    
    cracksam_source = "/home/sirius/CrackSAM/CrackSAM"
    if os.path.exists(cracksam_source):
        for item in ["delta", "segment_anything", "predict_single.py"]:
            src = os.path.join(cracksam_source, item)
            dst = os.path.join(cracksam_code_dir, item)
            if os.path.isdir(src) and not os.path.exists(dst):
                shutil.copytree(src, dst)
            elif os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
                
        for ckpt in ["CrackSAM_adapter_d32.pth", "sam_vit_h_4b8939.pth"]:
            src = os.path.join(cracksam_source, "checkpoints", ckpt)
            dst = os.path.join(cracksam_weights, ckpt)
            if os.path.exists(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)

init_ai_models()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Geoscan MOPS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])