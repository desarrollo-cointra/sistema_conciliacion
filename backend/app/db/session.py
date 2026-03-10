from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def _resolve_database_url(raw_url: str) -> str:
    # Keep a single SQLite file regardless of where uvicorn is started from.
    if raw_url.startswith("sqlite:///./"):
        db_name = raw_url.replace("sqlite:///./", "", 1)
        project_root = Path(__file__).resolve().parents[3]
        db_path = (project_root / db_name).resolve()
        return f"sqlite:///{db_path.as_posix()}"
    return raw_url


resolved_database_url = _resolve_database_url(settings.database_url)
connect_args = {"check_same_thread": False} if resolved_database_url.startswith("sqlite") else {}

engine = create_engine(resolved_database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
