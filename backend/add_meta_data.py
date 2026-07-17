from src.db.database import engine
from sqlalchemy import text

def alter_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE chat_messages ALTER COLUMN content TYPE json USING content::json;"))
            conn.commit()
            print("Successfully casted content to json")
        except Exception as e:
            print("Error casting content:", e)

if __name__ == "__main__":
    alter_column()
