from enum import Enum


class UserRole(str, Enum):
    COINTRA = "COINTRA"
    CLIENTE = "CLIENTE"
    TERCERO = "TERCERO"


class CointraSubRol(str, Enum):
    COINTRA_ADMIN = "COINTRA_ADMIN"
    COINTRA_USER = "COINTRA_USER"


class ConciliacionEstado(str, Enum):
    BORRADOR = "BORRADOR"
    EN_REVISION = "EN_REVISION"
    APROBADA = "APROBADA"
    CERRADA = "CERRADA"


class ItemTipo(str, Enum):
    VIAJE = "VIAJE"
    PEAJE = "PEAJE"
    HORA_EXTRA = "HORA_EXTRA"
    VIAJE_ADICIONAL = "VIAJE_ADICIONAL"
    ESTIBADA = "ESTIBADA"
    CONDUCTOR_RELEVO = "CONDUCTOR_RELEVO"
    OTRO = "OTRO"


class ItemEstado(str, Enum):
    PENDIENTE = "PENDIENTE"
    EN_REVISION = "EN_REVISION"
    APROBADO = "APROBADO"
    RECHAZADO = "RECHAZADO"
