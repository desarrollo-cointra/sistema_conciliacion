from fastapi import APIRouter

from app.api.routes import auth, catalogs, conciliaciones, notificaciones, viajes, vehiculos

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(catalogs.router)
api_router.include_router(viajes.router)
api_router.include_router(conciliaciones.router)
api_router.include_router(notificaciones.router)
api_router.include_router(vehiculos.router)
