from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.enums import CointraSubRol, UserRole
from app.models.usuario import Usuario


def seed_data(db: Session) -> None:
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

    db.commit()
