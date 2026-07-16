from sqlalchemy import create_engine, text
from src.core.config import settings

engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE projects ADD COLUMN ai_status VARCHAR DEFAULT 'idle';"))
        print("Added ai_status column")
    except Exception as e:
        print(f"Column ai_status might already exist: {e}")
        
    try:
        conn.execute(text("ALTER TABLE projects ADD COLUMN metashape_status VARCHAR DEFAULT 'idle';"))
        print("Added metashape_status column")
    except Exception as e:
        print(f"Column metashape_status might already exist: {e}")

    try:
        conn.execute(text("ALTER TABLE projects ADD COLUMN error_message VARCHAR;"))
        print("Added error_message column")
    except Exception as e:
        print(f"Column error_message might already exist: {e}")

    conn.commit()
    print("Database schema updated successfully.")
