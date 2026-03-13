# CONTEXT BACKEND — Sistema de Conciliación — Cointra S.A.S.

## Stack
- **Framework:** FastAPI (Python)
- **ORM:** SQLAlchemy
- **Migraciones:** Alembic
- **Autenticación:** JWT (python-jose)
- **Base de datos:** PostgreSQL (psycopg2)
- **Correos:** smtplib / email.mime (SMTP Microsoft)
- **Excel:** openpyxl
- **Variables de entorno:** python-dotenv

---

## Estructura de carpetas

```
backend/
├── app/
│   ├── main.py                  ← instancia FastAPI, registra routers
│   ├── database.py              ← conexión SQLAlchemy
│   ├── dependencies.py          ← get_db, get_current_user
│   ├── config.py                ← variables de entorno
│   ├── models/
│   │   ├── cliente.py
│   │   ├── tercero.py
│   │   ├── usuario.py
│   │   ├── operacion.py
│   │   ├── conciliacion.py
│   │   ├── conciliacion_item.py
│   │   ├── comentario.py
│   │   └── historial_cambio.py
│   ├── schemas/
│   │   ├── cliente.py
│   │   ├── tercero.py
│   │   ├── usuario.py
│   │   ├── operacion.py
│   │   ├── conciliacion.py
│   │   ├── conciliacion_item.py
│   │   └── auth.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── clientes.py
│   │   ├── terceros.py
│   │   ├── usuarios.py
│   │   ├── operaciones.py
│   │   ├── conciliaciones.py
│   │   ├── items.py
│   │   ├── avansat.py
│   │   └── correos.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── conciliacion_service.py  ← lógica de negocio central
│   │   ├── tarifa_service.py        ← cálculo de tarifas y rentabilidad
│   │   ├── avansat_service.py       ← integración API Avansat
│   │   ├── correo_service.py        ← envío SMTP
│   │   └── excel_service.py         ← generación Excel adjunto
│   └── utils/
│       ├── security.py              ← hash passwords, JWT
│       └── permissions.py           ← control de visibilidad por rol
├── alembic/
├── requirements.txt
└── .env
```

---

## Variables de entorno (.env)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/conciliacion_db
SECRET_KEY=<clave_jwt_secreta>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# SMTP Microsoft/Claro
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notificaciones@cointra.com.co
SMTP_PASSWORD=<clave_provista_por_TI>

# Avansat
AVANSAT_URL=https://avansat5.intrared.net:8083/ap/interf/app/APIAvansat/v1/index.php
AVANSAT_AUTH=3d524a53c110e4c22463b10ed32cef9d
AVANSAT_APP=sate_cointr
AVANSAT_TYPE=operacionnacional
AVANSAT_USER=InterfApiOperaCoin
AVANSAT_PASS=ZxDYT1QkxdId8
```

---

## Autenticación y roles

```python
# Roles disponibles
ROL_COINTRA  = "COINTRA"
ROL_CLIENTE  = "CLIENTE"
ROL_TERCERO  = "TERCERO"

# JWT payload
{
  "sub": "usuario_id",
  "rol": "COINTRA",
  "cliente_id": null,   # o int si es cliente
  "tercero_id": null,   # o int si es tercero
  "exp": timestamp
}
```

### Middleware de permisos por endpoint

```python
# Solo Cointra puede acceder
def require_cointra(current_user = Depends(get_current_user)):
    if current_user.rol != "COINTRA":
        raise HTTPException(403)

# Cointra o Cliente
def require_cointra_o_cliente(current_user = Depends(get_current_user)):
    if current_user.rol not in ["COINTRA", "CLIENTE"]:
        raise HTTPException(403)
```

---

## Endpoints principales

### Auth
```
POST /auth/login          → devuelve JWT
POST /auth/refresh        → renueva token
```

### Clientes y Terceros (solo COINTRA)
```
GET    /clientes/
POST   /clientes/
PUT    /clientes/{id}
GET    /terceros/
POST   /terceros/
PUT    /terceros/{id}
```

### Usuarios (solo COINTRA administra)
```
GET    /usuarios/
POST   /usuarios/
PUT    /usuarios/{id}
DELETE /usuarios/{id}
```

### Operaciones (solo COINTRA)
```
GET    /operaciones/              → filtra por rol automáticamente
POST   /operaciones/
PUT    /operaciones/{id}
GET    /operaciones/{id}
```

### Conciliaciones
```
GET    /conciliaciones/           → filtra por rol (tercero ve solo las suyas, cliente igual)
POST   /conciliaciones/           → COINTRA y TERCERO
GET    /conciliaciones/{id}       → valida que el usuario tenga acceso
PUT    /conciliaciones/{id}/estado → cambio de estado con trazabilidad
DELETE /conciliaciones/{id}       → solo COINTRA, solo en BORRADOR
```

### Ítems
```
GET    /conciliaciones/{id}/items/
POST   /conciliaciones/{id}/items/         → individual
POST   /conciliaciones/{id}/items/bulk/    → cargue masivo Excel
PUT    /items/{id}
DELETE /items/{id}
```

### Avansat
```
GET    /avansat/manifiestos?placa=&origen=&destino=&fecha_inicio=&fecha_fin=
GET    /avansat/manifiesto/{numero}
```

### Correos
```
POST   /correos/enviar             → envía correo con destinatario editable
POST   /correos/facturacion/{conciliacion_id}  → genera Excel y envía correo interno
```

### Comentarios
```
POST   /comentarios/
GET    /conciliaciones/{id}/comentarios/
```

---

## Servicio de tarifas (tarifa_service.py)

```python
def calcular_tarifa_tercero(
    tarifa_cliente: float,
    porcentaje_rentabilidad: float,
    descuento_habilitado: bool = False,
    descuento_valor: float = 0.0
) -> dict:
    rentabilidad = tarifa_cliente * (porcentaje_rentabilidad / 100)

    if descuento_habilitado:
        valor_real_cliente = tarifa_cliente - descuento_valor
        tarifa_tercero = valor_real_cliente - rentabilidad
    else:
        tarifa_tercero = tarifa_cliente - rentabilidad

    return {
        "tarifa_cliente": tarifa_cliente,
        "descuento_valor": descuento_valor if descuento_habilitado else 0,
        "rentabilidad": rentabilidad,
        "tarifa_tercero": tarifa_tercero,
    }
```

---

## Servicio Avansat (avansat_service.py)

```python
import httpx
from app.config import settings

async def buscar_manifiestos(
    placa: str = None,
    origen: str = None,
    destino: str = None,
    fecha_inicio: str = None,
    fecha_fin: str = None,
    numero_manifiesto: str = None
) -> dict:
    params = {
        "aplicacion": settings.AVANSAT_APP,
        "type": settings.AVANSAT_TYPE,
        "user": settings.AVANSAT_USER,
        "pass": settings.AVANSAT_PASS,
    }
    if numero_manifiesto:
        params["manifiesto"] = numero_manifiesto
    if fecha_inicio:
        params["fechacreadoinicial"] = fecha_inicio
    if fecha_fin:
        params["fechacreadofinal"] = fecha_fin

    headers = {"Authorization": settings.AVANSAT_AUTH}

    async with httpx.AsyncClient(verify=False) as client:
        response = await client.get(settings.AVANSAT_URL, params=params, headers=headers)
        data = response.json()

    if data.get("codigo") != 1000:
        raise Exception(f"Avansat error {data.get('codigo')}: {data.get('mensaje')}")

    return data

# Filtrar manifiestos por placa, origen y destino para asociar a un viaje
def filtrar_manifiestos_por_viaje(manifiestos: list, placa: str, origen: str, destino: str) -> list:
    return [
        m for m in manifiestos
        if m.get("placa", "").upper() == placa.upper()
        and origen.lower() in m.get("origen", "").lower()
        and destino.lower() in m.get("destino", "").lower()
    ]
```

---

## Servicio de correos (correo_service.py)

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from app.config import settings

def enviar_correo(destinatario: str, asunto: str, cuerpo: str, adjunto_path: str = None):
    msg = MIMEMultipart()
    msg["From"] = settings.SMTP_USER
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.attach(MIMEText(cuerpo, "plain"))

    if adjunto_path:
        with open(adjunto_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={adjunto_path.split('/')[-1]}")
        msg.attach(part)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
```

### Plantillas de correo (texto plano)

```python
# Conciliación lista para revisión → al cliente
ASUNTO_REVISION = "Cointra - Conciliación pendiente por revisar"
CUERPO_REVISION = """
Hola,

Hay una conciliación disponible para su revisión en el Sistema de Conciliación de Cointra.

Conciliación: {nombre}
Operación: {operacion}
Período: {fecha_inicio} al {fecha_fin}

Por favor ingrese al sistema para revisarla y aprobarla.

Cointra S.A.S.
"""

# Conciliación aprobada → a Cointra
ASUNTO_APROBADA = "Cointra - Conciliación aprobada"
CUERPO_APROBADA = """
La conciliación {nombre} de la operación {operacion} fue aprobada.
Período: {fecha_inicio} al {fecha_fin}
Aprobada por: {usuario}

Ya puede proceder con la facturación.
"""

# Conciliación rechazada → a Cointra
ASUNTO_RECHAZADA = "Cointra - Conciliación con observaciones"
CUERPO_RECHAZADA = """
La conciliación {nombre} tiene observaciones pendientes.
Por favor revise el sistema para ver el detalle.
"""

# Interno facturación → a equipo Cointra (con Excel adjunto)
ASUNTO_FACTURACION = "Cointra - Conciliación autorizada para facturar"
CUERPO_FACTURACION = """
La conciliación {nombre} fue aprobada y está lista para facturar.
Se adjunta el archivo Excel con el detalle completo.

Cointra S.A.S. — Sistema de Conciliación
"""
```

---

## Servicio Excel (excel_service.py)

```python
# Columnas del Excel de facturación (solo para uso interno Cointra)
COLUMNAS_EXCEL_FACTURACION = [
    "Manifiesto",
    "Fecha Manifiesto",
    "Remesa",
    "Producto",
    "Origen",
    "Destino",
    "Placa",
    "Remolque",
    "Poseedor",
    "Tarifa Cliente",
    "Descuento",
    "Rentabilidad Cointra",
    "Valor a pagar al Tercero",
]
# IMPORTANTE: Este Excel es solo para uso interno Cointra.
# Nunca se envía al cliente ni al tercero.
```

---

## Control de visibilidad en queries

```python
# En cualquier endpoint que devuelva items, aplicar según rol:
def serializar_item(item, rol: str) -> dict:
    base = {
        "id": item.id,
        "tipo": item.tipo,
        "estado": item.estado,
        "fecha_servicio": item.fecha_servicio,
        "origen": item.origen,
        "destino": item.destino,
        "placa": item.placa,
        "conductor": item.conductor,
        "descripcion": item.descripcion,
    }
    if rol == "COINTRA":
        base.update({
            "tarifa_cliente": item.tarifa_cliente,
            "tarifa_tercero": item.tarifa_tercero,
            "rentabilidad": item.rentabilidad,
            "descuento_valor": item.descuento_valor,
            "manifiesto_numero": item.manifiesto_numero,
        })
    elif rol == "CLIENTE":
        base.update({
            "tarifa_cliente": item.tarifa_cliente,
            # SIN tarifa_tercero, SIN rentabilidad
        })
    elif rol == "TERCERO":
        base.update({
            "tarifa_tercero": item.tarifa_tercero,
            # SIN tarifa_cliente, SIN rentabilidad
        })
    return base
```

---

## Cargue masivo Excel

```python
# Columnas esperadas en el Excel del tercero (plantilla descargable)
COLUMNAS_TEMPLATE_VIAJES = [
    "fecha_servicio",   # YYYY-MM-DD
    "origen",
    "destino",
    "placa",
    "conductor",
    "tipo_vehiculo",    # DOBLE_TROQUE | TRACTOMULA | OTRO
    "tarifa_tercero",   # valor numérico
    "observaciones",
]
```

---

## requirements.txt

```
fastapi
uvicorn
sqlalchemy
psycopg2-binary
alembic
python-jose[cryptography]
passlib[bcrypt]
python-dotenv
httpx
openpyxl
python-multipart
```
