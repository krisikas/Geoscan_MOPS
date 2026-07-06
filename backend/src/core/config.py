import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import BaseModel

class Settings(BaseSettings):
    PROJECT_NAME: str = "Geoscan MOPS Backend"
    
    # DATABASE
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "mops_user")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "mops_password")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "mops_db")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        
    # AUTHENTICATION
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
