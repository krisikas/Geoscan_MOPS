#!/bin/bash
set -m

ROOT_DIR=$(pwd)
MCP_PID=""
AI_PID=""
BACKEND_PID=""
TELEMETRY_PID=""

cleanup() {
    echo -e "\nEnding..."
    
    if [ -n "$MCP_PID" ]; then
        echo "Stopping MCP service..."
        kill -- -$MCP_PID 2>/dev/null
    fi

    if [ -n "$AI_PID" ]; then
        echo "Stopping AI service..."
        kill -- -$AI_PID 2>/dev/null
    fi
    
    if [ -n "$BACKEND_PID" ]; then
        echo "Stopping backend service..."
        kill -- -$BACKEND_PID 2>/dev/null
    fi

    if [ -n "$TELEMETRY_PID" ]; then
        echo "Stopping telemetry service..."
        kill -- -$TELEMETRY_PID 2>/dev/null
    fi
    
    cd "$ROOT_DIR" || exit
    
    echo "Stopping docker containers..."
    docker compose down 
    
    echo "Done."
}

trap cleanup EXIT

echo "Starting docker containers..."
docker compose up -d

echo "Starting MCP service..."
cd "$ROOT_DIR/pioneer_mcp" || exit
uv sync
uv run python -m src &
MCP_PID=$!

echo "Starting AI service..."
cd "$ROOT_DIR/ai_service" || exit
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8001 &
AI_PID=$!

echo "Starting backend..."
cd "$ROOT_DIR/backend" || exit
echo "Sync packages..."
uv sync
echo "Starting fast api..."
export DATABASE_URL="postgresql://mops_user:mops_password@localhost:5432/mops_db"
export YOLO_MODEL_PATH="./best.pt"
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting telemetry service..."
cd "$ROOT_DIR/telemetry_service" || exit
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8002 &
TELEMETRY_PID=$!

wait $MCP_PID $AI_PID $BACKEND_PID $TELEMETRY_PID