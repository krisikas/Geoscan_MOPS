from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class ChatMessageBase(BaseModel):
    role: str
    content: str

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageResponse(ChatMessageBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    user_id: int
    created_at: datetime
    ai_status: str
    metashape_status: str
    error_message: Optional[str] = None
    mission_status: str = "PLANNING"
    route_data: Optional[Any] = None

    class Config:
        from_attributes = True
