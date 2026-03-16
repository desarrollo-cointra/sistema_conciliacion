from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.cliente import Cliente
from app.models.enums import CointraSubRol, UserRole
from app.models.operacion import Operacion
from app.models.tercero import Tercero
from app.models.usuario import Usuario
from app.models.tipo_vehiculo import TipoVehiculo


def seed_data(db: Session) -> None:
    # Tipos de vehiculo iniciales (idempotente)
    nombres_tipos = ["Sencillo", "Doble Troque", "Tractomula", "Mini Mula"]
    for nombre in nombres_tipos:
        existente = db.query(TipoVehiculo).filter(TipoVehiculo.nombre == nombre).first()
        if not existente:
            db.add(TipoVehiculo(nombre=nombre, activo=True))
    db.flush()

    # Usuario administrador Cointra (idempotente)
    admin_email = "cgutierrez@cointra.com.co"
    admin = db.query(Usuario).filter(Usuario.email == admin_email).first()
    if not admin:
        db.add(
            Usuario(
                nombre="Administrador Cointra",
                email=admin_email,
                password_hash=get_password_hash("admin123"),
                rol=UserRole.COINTRA,
                sub_rol=CointraSubRol.COINTRA_ADMIN,
                activo=True,
            )
        )
        db.flush()

    if db.query(Usuario).count() > 0:
        db.commit()
        return

    cliente = Cliente(nombre="Bavaria", nit="900123456", activo=True)
    tercero = Tercero(nombre="Vicente Rubio", nit="901000111", activo=True)
    db.add_all([cliente, tercero])
    db.flush()

    operacion = Operacion(
        cliente_id=cliente.id,
        tercero_id=tercero.id,
        nombre="Operacion Siberia",
        porcentaje_rentabilidad=10,
        activa=True,
    )
    db.add(operacion)
    db.flush()

    users = [
        {
            "nombre": "Admin Cointra",
            "email": "cointra@cointra.com",
            "password_hash": get_password_hash("cointra123"),
            "rol": UserRole.COINTRA,
            "sub_rol": CointraSubRol.COINTRA_ADMIN,
            "activo": True,
        },
        {
            "nombre": "Usuario Cliente",
            "email": "cliente@cointra.com",
            "password_hash": get_password_hash("cliente123"),
            "rol": UserRole.CLIENTE,
            "cliente_id": cliente.id,
            "activo": True,
        },
        {
            "nombre": "Usuario Tercero",
            "email": "tercero@cointra.com",
            "password_hash": get_password_hash("tercero123"),
            "rol": UserRole.TERCERO,
            "tercero_id": tercero.id,
            "activo": True,
        },
    ]

    for user_data in users:
        existente = db.query(Usuario).filter(Usuario.email == user_data["email"]).first()
        if not existente:
            db.add(Usuario(**user_data))

    db.commit()
