import json
import re
import subprocess
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Planning Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    text: str

class PlanRequest(BaseModel):
    history: List[Message]
    new_prompt: str

@app.post("/plan")
async def generate_plan(request: PlanRequest):
    import os
    PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
    SYSTEM_PROMPT_PATH = os.path.join(PROMPTS_DIR, "planning_vla.md")
    try:
        with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
            system_instruction = f.read()
    except FileNotFoundError:
        system_instruction = "Отвечай строго в формате JSON: {\"text\": \"\", \"coordinates\": [], \"buildings\": []}"

    history_text = "\n".join([f"{msg.role}: {msg.text}" for msg in request.history])

    full_prompt = (
        f"{system_instruction}\n\n"
        f"[ИСТОРИЯ ОБСУЖДЕНИЯ]\n{history_text}\n[КОНЕЦ ИСТОРИИ]\n\n"
        f"Новый запрос пользователя: {request.new_prompt}"
    )

    cmd = ["agy", "--model", "Gemini 3.5 Flash (Medium)", "--print", full_prompt]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        output = result.stdout.strip()
        
        # Extract the JSON object using regex to handle conversational fluff
        json_match = re.search(r'\{.*\}', output, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            parsed_json = json.loads(json_str)
            return parsed_json
        else:
            raise ValueError("No JSON object found in output")
        
    except subprocess.CalledProcessError as e:
        print(f"AGY Error: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"AI Agent failed: {e.stderr}")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"JSON Parse Error: {e}\nOutput was: {output}")
        # fallback
        return {
            "text": output,
            "coordinates": [],
            "buildings": []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
