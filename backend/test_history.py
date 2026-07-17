from src.db.database import SessionLocal
from src.db.models import ChatMessage

db = SessionLocal()
messages = db.query(ChatMessage).all()
for m in messages:
    print(f"ID: {m.id}, Role: {m.role}, Content: {m.content}")
