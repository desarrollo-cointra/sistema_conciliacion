from app.models.conciliacion_item import ConciliacionItem
from app.models.operacion import Operacion


def calculate_tarifa_cliente(tarifa_tercero: float, operacion: Operacion) -> tuple[float, float]:
    pct = float(operacion.porcentaje_rentabilidad or 0)
    divisor = 1 - (pct / 100)
    if divisor <= 0:
        return float(tarifa_tercero), pct
    return float(tarifa_tercero) / divisor, pct


def calculate_tarifa_tercero_from_cliente(tarifa_cliente: float, rentabilidad_pct: float) -> float:
    factor = 1 - (float(rentabilidad_pct) / 100)
    if factor <= 0:
        return float(tarifa_cliente)
    return float(tarifa_cliente) * factor


def apply_rentabilidad(item: ConciliacionItem, operacion: Operacion) -> None:
    if item.tarifa_tercero is None:
        return

    tarifa_cliente, pct = calculate_tarifa_cliente(float(item.tarifa_tercero), operacion)
    item.rentabilidad = pct
    item.tarifa_cliente = tarifa_cliente
