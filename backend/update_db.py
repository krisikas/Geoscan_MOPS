import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from src.db.database import Base, engine
from src.db.models import ChatMessage, Project
from sqlalchemy import text

def update_db():
    print("Создаю таблицу chat_messages...")
    Base.metadata.create_all(bind=engine)
    
    print("Добавляю колонки в projects...")
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN mission_status VARCHAR DEFAULT 'PLANNING';"))
            print("Добавлена колонка: mission_status")
        except Exception as e:
            print(f"Колонка mission_status уже существует или ошибка: {e}")
            
        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN route_data JSON;"))
            print("Добавлена колонка: route_data")
        except Exception as e:
            print(f"Колонка route_data уже существует или ошибка: {e}")

if __name__ == "__main__":
    update_db()
    print("Обновление БД завершено.")
