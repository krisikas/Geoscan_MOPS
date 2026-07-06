from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.main import app
from src.db.database import get_db, Base
from src.db.models import User
import pytest

from sqlalchemy.pool import StaticPool

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_register():
    response = client.post(
        "/api/auth/register",
        json={"email": "test@test.com", "name": "Test User", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@test.com"

def test_register_duplicate():
    client.post(
        "/api/auth/register",
        json={"email": "duplicate@test.com", "name": "Test User", "password": "password123"}
    )
    response = client.post(
        "/api/auth/register",
        json={"email": "duplicate@test.com", "name": "Another User", "password": "password123"}
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]

def test_login():
    client.post(
        "/api/auth/register",
        json={"email": "login@test.com", "name": "Login User", "password": "login123"}
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "login@test.com", "password": "login123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@test.com"

def test_login_invalid():
    response = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@test.com", "password": "login123"}
    )
    assert response.status_code == 400

def test_me():
    client.post(
        "/api/auth/register",
        json={"email": "me@test.com", "name": "Me User", "password": "me123"}
    )
    login_response = client.post(
        "/api/auth/login",
        json={"email": "me@test.com", "password": "me123"}
    )
    token = login_response.json()["access_token"]
    
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "me@test.com"

def test_me_unauthorized():
    response = client.get("/api/auth/me")
    assert response.status_code == 401
