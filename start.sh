#!/bin/bash
set -m

ROOT_DIR=$(pwd)
MCP_PID=""
AI_PID=""
BACKEND_PID=""
TELEMETRY_PID=""

cleanup() {
    echo -e "\nEnding..."
    
    echo "Sending graceful shutdown to services..."
    # MCP (no port)
    pkill -15 -f "pioneer_mcp/src" 2>/dev/null
    
    # Find and kill by port
    for port in 8000 8001 8002 9090; do
        pids=$(lsof -t -i:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "Stopping processes on port $port: $pids"
            kill -15 $pids 2>/dev/null
        fi
    done
    
    echo "Waiting 3 seconds for graceful shutdown (to avoid DB errors)..."
    sleep 3
    
    echo "Force killing any remaining processes..."
    pkill -9 -f "pioneer_mcp/src" 2>/dev/null
    for port in 8000 8001 8002 9090; do
        pids=$(lsof -t -i:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "Force killing port $port: $pids"
            kill -9 $pids 2>/dev/null
        fi
    done
    
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