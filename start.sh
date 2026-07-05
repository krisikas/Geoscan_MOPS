#!/bin/bash

echo "Запуск базы данных и фронтенда в Docker..."
docker compose up -d

echo "Проверка Python окружения для бекенда..."
cd backend

if [ ! -d ".venv" ]; then
    echo "Виртуальное окружение не найдено. Создаю .venv..."
    python3 -m venv .venv
    echo "Устанавливаю зависимости..."
    source .venv/bin/activate
    pip install -r requirements.txt
else
    echo "Виртуальное окружение найдено."
    source .venv/bin/activate
fi

echo "Запуск FastAPI бекенда на хосте..."
export DATABASE_URL="postgresql://mops_user:mops_password@localhost:5432/mops_db"
export YOLO_MODEL_PATH="./best.pt"

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
