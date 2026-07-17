from src.db.database import engine
from sqlalchemy import text

def recreate():
    with engine.connect() as conn:
        try:
            conn.execute(text("DROP TABLE IF EXISTS chat_messages CASCADE;"))
            conn.execute(text("""
                CREATE TABLE chat_messages (
                    id SERIAL PRIMARY KEY,
                    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                    role VARCHAR NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.commit()
            print("Successfully recreated chat_messages table to pure relational format")
        except Exception as e:
            print("Error recreating table:", e)

if __name__ == "__main__":
    recreate()
