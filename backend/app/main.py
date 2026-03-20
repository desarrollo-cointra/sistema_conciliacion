from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
import threading
import time

from app.api.router import api_router
from app.core.config import settings
from app.db.seed import seed_data
from app.db.session import SessionLocal, engine
from app.models import *  # noqa: F403
from app.models.manifiesto_avansat import ManifiestoAvansat
from app.services.avansat_cache import sync_avansat_yesterday_today

app = FastAPI(title=settings.app_name)
_avansat_sync_stop_event = threading.Event()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    inspector = inspect(engine)
    if not inspector.has_table("usuarios"):
        raise RuntimeError(
            "Base de datos sin esquema. Ejecuta 'alembic upgrade head' en backend antes de iniciar la API."
        )
    db = SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()

    # Safety net: if this process points to a DB without latest migration,
    # ensure the cache table exists so sync and Excel flows do not fail.
    if not inspector.has_table("manifiestos_avansat"):
        ManifiestoAvansat.__table__.create(bind=engine, checkfirst=True)

    if settings.avansat_enabled:
        def _avansat_sync_loop() -> None:
            while not _avansat_sync_stop_event.is_set():
                loop_db = SessionLocal()
                try:
                    sync_avansat_yesterday_today(loop_db)
                except Exception:
                    # Evita tumbar el backend si Avansat falla temporalmente.
                    pass
                finally:
                    loop_db.close()

                if _avansat_sync_stop_event.wait(1800):
                    break

        threading.Thread(target=_avansat_sync_loop, name="avansat-sync", daemon=True).start()


@app.on_event("shutdown")
def shutdown_event():
    _avansat_sync_stop_event.set()


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(api_router)
