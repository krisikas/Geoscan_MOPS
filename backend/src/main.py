import glob
import os
import shutil
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from src.services.fly import fly_start, DroneConnectionError
from src.services.grabber import grab_images
from src.services.ai import process_image, process_ai_image

from src.db.database import Base, engine
from src.db.models import User
from src.api.auth import router as auth_router, get_current_user

# Создаем таблицы в БД
Base.metadata.create_all(bind=engine)

TMP_ROOT = "tmp"

app = FastAPI(title=" backend")

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

# ================== ВСПОМОГАТЕЛЬНЫЕ ШТУКИ ДЛЯ СЕССИЙ ==================

def _ensure_tmp_root() -> None:
    os.makedirs(TMP_ROOT, exist_ok=True)


def _list_session_ids(user_id: int) -> List[int]:
    _ensure_tmp_root()
    ids: List[int] = []
    prefix = f"tmp_{user_id}_"
    for name in os.listdir(TMP_ROOT):
        if name.startswith(prefix) and name[len(prefix):].isdigit():
            ids.append(int(name[len(prefix):]))
    return sorted(ids)


def _create_session(user_id: int) -> int:
    """
    Создаёт новую папку tmp_{user_id}_{i} с подпапками data, metashape, ai.
    Возвращает i.
    """
    ids = _list_session_ids(user_id)
    next_id = (max(ids) + 1) if ids else 1

    session_dir = os.path.join(TMP_ROOT, f"tmp_{user_id}_{next_id}")
    os.makedirs(session_dir, exist_ok=True)

    for sub in ("data", "metashape", "ai"):
        os.makedirs(os.path.join(session_dir, sub), exist_ok=True)

    return next_id


def _get_current_session_id(user_id: int) -> int:
    """
    Возвращает id последней сессии или кидает 404.
    """
    ids = _list_session_ids(user_id)
    if not ids:
        raise HTTPException(status_code=404, detail="Сессий ещё нет")
    return ids[-1]


def _require_session(user_id: int, session_id: int) -> None:
    """
    Проверяем, что tmp_{user_id}_{session_id} существует.
    """
    path = os.path.join(TMP_ROOT, f"tmp_{user_id}_{session_id}")
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail=f"Сессия не найдена")


def _get_paths(user_id: int, session_id: int) -> Dict[str, str]:
    """
    Возвращает пути до папок data, metashape, ai для данной сессии.
    """
    base = os.path.join(TMP_ROOT, f"tmp_{user_id}_{session_id}")
    return {
        "base": base,
        "data": os.path.join(base, "data"),
        "metashape": os.path.join(base, "metashape"),
        "ai": os.path.join(base, "ai"),
    }


def _list_images(folder: str) -> List[str]:
    """
    Список файлов-изображений в папке.
    """
    patterns = ("*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.bmp")
    files: List[str] = []
    
    for p in patterns:
        files.extend(glob.glob(os.path.join(folder, p)))
    return sorted(files)


# =========================== DATA: ЗАГРУЗКА ===========================

async def _save_uploads_to_data(
    user_id: int,
    session_id: int,
    files: List[UploadFile],
) -> List[str]:
    """
    Сохранение загруженных картинок в tmp_{user_id}_{session_id}/data.
    """
    paths = _get_paths(user_id, session_id)
    data_dir = paths["data"]
    os.makedirs(data_dir, exist_ok=True)

    saved: List[str] = []

    for index, upload in enumerate(files, start=1):
        if not upload.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=f"Файл {upload.filename} не является изображением",
            )

        _, ext = os.path.splitext(upload.filename or "")
        if not ext:
            ext = ".jpg"
        filename = f"{index:04d}{ext}"
        dest_path = os.path.join(data_dir, filename)

        content = await upload.read()
        with open(dest_path, "wb") as f:
            f.write(content)

        saved.append(filename)

    return saved


# ========================= ВРЕМЕННАЯ ИММИТАЦИЯ РАБОТЫ METASHAPE =========================


def _require_data_not_empty(user_id: int, session_id: int) -> None:
    paths = _get_paths(user_id, session_id)
    images = _list_images(paths["data"])
    if not images:
        raise HTTPException(
            status_code=400,
            detail="Нельзя запускать Metashape: в папке data нет изображений",
        )


def process_metashape(user_id: int, session_id: int) -> str:
    from src.services.metashape import process_metashape as run_metashape

    paths = _get_paths(user_id, session_id)
    data_dir = paths["data"]
    metashape_dir = paths["metashape"]
    os.makedirs(metashape_dir, exist_ok=True)

    images = _list_images(data_dir)
    if not images:
        raise HTTPException(
            status_code=400,
            detail="В папке data нет изображений",
        )

    output_path = os.path.join(metashape_dir, "orthomosaic.png")
    project_path = os.path.join(metashape_dir, "project.psx")

    try:
        result_path = run_metashape(
            photos_folder=data_dir,
            output_path=output_path,
            project_path=project_path,
        )
        return result_path
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Metashape недоступен: {str(exc)}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка обработки Metashape: {str(exc)}",
        ) from exc


def process_metashape_and_ai(user_id: int, session_id: int) -> str:
    metashape_result = process_metashape(user_id, session_id)
    
    if not os.path.isfile(metashape_result):
        raise HTTPException(
            status_code=500,
            detail="Metashape не вернул результат",
        )
    
    paths = _get_paths(user_id, session_id)
    ai_dir = paths["ai"]
    os.makedirs(ai_dir, exist_ok=True)
    
    base_name = os.path.basename(metashape_result)
    name, ext = os.path.splitext(base_name)
    ai_output_path = os.path.join(ai_dir, f"{name}_ai{ext}")
    
    try:
        ai_result = process_ai_image(metashape_result, ai_output_path)
        return ai_result
    except FileNotFoundError as exc:
        shutil.copy2(metashape_result, ai_output_path)
        return ai_output_path
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка обработки AI: {str(exc)}",
        ) from exc


# ============================= AI: ПРОЦЕСС =============================

def _require_metashape_not_empty(user_id: int, session_id: int) -> None:
    paths = _get_paths(user_id, session_id)
    images = _list_images(paths["metashape"])
    if not images:
        raise HTTPException(
            status_code=400,
            detail="Нельзя запускать AI: в папке metashape нет изображений",
        )


def process_ai_for_session(user_id: int, session_id: int) -> str:
    paths = _get_paths(user_id, session_id)
    metashape_dir = paths["metashape"]
    ai_dir = paths["ai"]
    os.makedirs(ai_dir, exist_ok=True)

    images = _list_images(metashape_dir)

    if not images:
        raise HTTPException(
            status_code=400,
            detail="В папке metashape нет изображений",
        )

    input_path = images[0]
    base_name = os.path.basename(input_path)
    name, ext = os.path.splitext(base_name)
    output_path = os.path.join(ai_dir, f"{name}_ai{ext}")

    try:
        result_path = process_ai_image(input_path, output_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Модель AI недоступна: {str(exc)}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка обработки AI: {str(exc)}",
        ) from exc

    return result_path


# =============================== ENDPOINTЫ ===============================

@app.get("/session/new")
def create_session(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    session_id = _create_session(user.id)
    return {"session_id": session_id, "tmp_folder": f"tmp_{user.id}_{session_id}"}


@app.get("/session/current")
def get_current_session(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    session_id = _get_current_session_id(user.id)
    return {"session_id": session_id, "tmp_folder": f"tmp_{user.id}_{session_id}"}


@app.post("/data/upload")
async def upload_data(
    files: List[UploadFile] = File(..., description="Список изображений"),
    session_id: Optional[int] = Query(default=None),
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Нужно загрузить хотя бы один файл",
        )

    if session_id is None:
        session_id = _create_session(user.id)
    else:
        _require_session(user.id, session_id)

    saved_filenames = await _save_uploads_to_data(user.id, session_id, files)
    paths = _get_paths(user.id, session_id)

    return {
        "session_id": session_id,
        "data_dir": paths["data"],
        "saved_files": saved_filenames,
    }


@app.post("/start/fly")
def start_fly(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    session_id = _create_session(user.id)

    try:
        fly_start()
        grab_images()
    except DroneConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось запустить полёт или получить данные",
        ) from exc

    paths = _get_paths(user.id, session_id)
    return {
        "session_id": session_id,
        "data_dir": paths["data"],
        "message": "Пайплайн съёмки запущен",
    }


@app.get("/metashape/run")
def run_metashape_endpoint(
    session_id: int = Query(...),
    user: User = Depends(get_current_user)
) -> FileResponse:
    _require_session(user.id, session_id)
    _require_data_not_empty(user.id, session_id)

    result_path = process_metashape_and_ai(user.id, session_id)

    if not os.path.isfile(result_path):
        raise HTTPException(
            status_code=500,
            detail="Обработка не вернула результат",
        )

    return FileResponse(
        result_path,
        media_type="image/jpeg",
        filename=os.path.basename(result_path),
    )


@app.get("/ai/run")
def run_ai_endpoint(
    session_id: int = Query(...),
    user: User = Depends(get_current_user)
) -> FileResponse:
    _require_session(user.id, session_id)
    _require_metashape_not_empty(user.id, session_id)

    result_path = process_ai_for_session(user.id, session_id)

    if not os.path.isfile(result_path):
        raise HTTPException(
            status_code=500,
            detail="AI не вернул результирующее изображение",
        )

    return FileResponse(
        result_path,
        media_type="image/jpeg",
        filename=os.path.basename(result_path),
    )


@app.post("/data/upload-and-process-metashape")
async def upload_and_process_metashape(
    files: List[UploadFile] = File(...),
    session_id: Optional[int] = Query(default=None),
    user: User = Depends(get_current_user)
) -> FileResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Нужно загрузить хотя бы один файл")

    if session_id is None:
        session_id = _create_session(user.id)
    else:
        _require_session(user.id, session_id)

    await _save_uploads_to_data(user.id, session_id, files)

    result_path = process_metashape_and_ai(user.id, session_id)

    if not os.path.isfile(result_path):
        raise HTTPException(status_code=500, detail="Обработка не вернула результат")

    return FileResponse(
        result_path,
        media_type="image/jpeg",
        filename=os.path.basename(result_path),
    )


@app.post("/data/upload-and-process-ai")
async def upload_and_process_ai(
    file: UploadFile = File(...),
    session_id: Optional[int] = Query(default=None),
    user: User = Depends(get_current_user)
) -> FileResponse:
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Файл не является изображением")

    if session_id is None:
        session_id = _create_session(user.id)
    else:
        _require_session(user.id, session_id)

    paths = _get_paths(user.id, session_id)
    ai_dir = paths["ai"]
    os.makedirs(ai_dir, exist_ok=True)

    _, ext = os.path.splitext(file.filename or "")
    if not ext:
        ext = ".jpg"
    filename = f"uploaded_ai{ext}"
    input_path = os.path.join(ai_dir, filename)

    content = await file.read()
    with open(input_path, "wb") as f:
        f.write(content)

    base_name = os.path.basename(input_path)
    name, ext = os.path.splitext(base_name)
    output_path = os.path.join(ai_dir, f"{name}_processed{ext}")

    try:
        result_path = process_ai_image(input_path, output_path)
    except FileNotFoundError:
        shutil.copy2(input_path, output_path)
        result_path = output_path
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки AI: {str(exc)}") from exc

    if not os.path.isfile(result_path):
        raise HTTPException(status_code=500, detail="AI не вернул результирующее изображение")

    return FileResponse(
        result_path,
        media_type="image/jpeg",
        filename=os.path.basename(result_path),
    )