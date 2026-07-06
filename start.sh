#!/bin/bash

ROOT_DIR=$(pwd)

cleanup() {
    echo -e "\nEnding..."
    
    cd "$ROOT_DIR" || exit
    
    echo "Stopping docker containers..."
    docker compose down 
    
    echo "Done."
}

trap cleanup EXIT


echo "Starting docker containers..."
docker compose up -d

echo "Starting backend..."
cd backend || exit

echo "Sync packages..."
uv sync

echo "Starting fast api..."
export DATABASE_URL="postgresql://mops_user:mops_password@localhost:5432/mops_db"
export YOLO_MODEL_PATH="./best.pt"

uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload