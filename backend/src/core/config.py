import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import BaseModel, model_validator
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Geoscan MOPS Backend"
    
    # DATABASE
    POSTGRES_USER: str = "mops_user"
    POSTGRES_PASSWORD: str = "mops_password"
    POSTGRES_DB: str = "mops_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    
    DATABASE_URL: Optional[str] = None
    
    @model_validator(mode="after")
    def assemble_db_connection(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        elif self.DATABASE_URL.startswith("postgresql://"):
            # Replace postgresql:// with postgresql+psycopg:// for psycopg compatibility if needed
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
        return self
        
    # AUTHENTICATION
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
