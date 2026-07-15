import cv2
import numpy as np
import os
import torch
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction
from typing import Optional

_detection_model = None

def _find_model_path() -> str:
    env_path = os.getenv("YOLO_MODEL_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    possible_paths = [
        "best.pt",
        os.path.join(os.path.dirname(__file__), "best.pt"),
        os.path.join(os.path.dirname(__file__), "..", "best.pt"),
    ]
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        if os.path.isfile(abs_path):
            return abs_path
    raise FileNotFoundError("Модель YOLO не найдена. Поместите файл best.pt в корень бекенда.")

def _get_model():
    global _detection_model
    if _detection_model is None:
        model_path = _find_model_path()
        device = "mps" if torch.backends.mps.is_available() else ("cuda:0" if torch.cuda.is_available() else "cpu")
        _detection_model = AutoDetectionModel.from_pretrained(
            model_type='yolov8',
            model_path=model_path,
            confidence_threshold=0.0,
            device=device
        )
    return _detection_model

def _process_logic(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Не удалось загрузить изображение: {image_path}")

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    max_size = 5080
    h, w = img.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=4, tileGridSize=(3, 3))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    img_contrast = cv2.cvtColor(limg, cv2.COLOR_LAB2RGB)

    model = _get_model()

    result = get_sliced_prediction(
        img_contrast,
        model,
        slice_height=640,
        slice_width=640,
        overlap_height_ratio=0.2,
        overlap_width_ratio=0.2
    )

    class_thresholds = {
        0: 0.003,
        1: 1.03,
        2: 0.8,
        3: 0.00037
    }

    filtered_predictions = []
    for obj in result.object_prediction_list:
        cls_id = obj.category.id
        conf = obj.score.value
        if conf >= class_thresholds.get(cls_id, 0.25):
            filtered_predictions.append(obj)

    result.object_prediction_list = filtered_predictions

    img_masks_only = img.copy()

    colors = {
        0: (255, 0, 0),
        1: (255, 255, 0),
        2: (0, 255, 0),
        3: (0, 0, 255)
    }

    priority_order = [2, 3, 0, 1]
    
    valid_objects = [obj for obj in result.object_prediction_list if obj.mask is not None]
    valid_objects.sort(key=lambda x: priority_order.index(x.category.id) if x.category.id in priority_order else 99)

    global_painted_mask = np.zeros(img_contrast.shape[:2], dtype=bool)

    grouped_objects = {}

    for obj in valid_objects:
        mask = np.array(obj.mask.bool_mask, dtype=bool)
        valid_mask = mask & (~global_painted_mask)
        
        if not np.any(valid_mask):
            continue
            
        cls_id = obj.category.id
        class_name = obj.category.name
        color = colors.get(cls_id, (255, 255, 255))
        
        colored_mask = np.zeros_like(img_masks_only)
        colored_mask[valid_mask] = color
        img_masks_only[valid_mask] = cv2.addWeighted(img_masks_only[valid_mask], 0.5, colored_mask[valid_mask], 0.5, 0)
        
        global_painted_mask |= valid_mask

        # Сбор данных для текстового файла
        bbox = obj.bbox
        grouped_objects.setdefault(class_name, []).append([
            int(bbox.minx), int(bbox.miny), int(bbox.maxx), int(bbox.maxy)
        ])

    img_masks_only_bgr = cv2.cvtColor(img_masks_only, cv2.COLOR_RGB2BGR)
    return img_masks_only_bgr, grouped_objects

def process_image(image_path: str) -> str:
    result_img, _ = _process_logic(image_path)
    root, ext = os.path.splitext(image_path)
    new_image_path = root + "_yolo" + ext
    cv2.imwrite(new_image_path, result_img)
    return new_image_path

def process_ai_image(input_path: str, output_path: str) -> str:
    result_img, grouped_objects = _process_logic(input_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, result_img)

    root, _ = os.path.splitext(output_path)
    text_file_path = root + "_data.txt"
    with open(text_file_path, "w", encoding="utf-8") as f:
        for class_name, details in grouped_objects.items():
            f.write(f"{class_name}:\n")
            for detail in details:
                f.write(
                    f"Coordinates: ({detail[0]}, {detail[1]}, {detail[2]}, {detail[3]})\n"
                )

    return output_path