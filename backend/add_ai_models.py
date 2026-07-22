from src.db.database import engine
from sqlalchemy import text

def add_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN ai_models JSON DEFAULT '[]'::json;"))
            conn.commit()
            print("Successfully added ai_models column to projects table")
        except Exception as e:
            print("Error:", e)

if __name__ == "__main__":
    add_column()
