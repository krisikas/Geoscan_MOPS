from src.db.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
columns = inspector.get_columns('chat_messages')
for col in columns:
    print(col['name'], col['type'])
