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
│   │   ├── usuario.py           ← incluye sub_rol (COINTRA_ADMIN | COINTRA_USER)
│   │   ├── operacion.py
│   │   ├── conciliacion.py
│   │   ├── conciliacion_item.py
│   │   ├── comentario.py
│   │   ├── historial_cambio.py
│   │   ├── tipo_vehiculo.py     ← catálogo de tipos de vehículo
│   │   └── vehiculo.py          ← vehículos con placa y tipo
│   ├── schemas/
│   │   ├── cliente.py
│   │   ├── tercero.py
│   │   ├── usuario.py
│   │   ├── operacion.py
│   │   ├── conciliacion.py
│   │   ├── conciliacion_item.py
│   │   ├── vehiculo.py
│   │   └── auth.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── clientes.py
│   │   ├── terceros.py
│   │   ├── usuarios.py
│   │   ├── operaciones.py
│   │   ├── conciliaciones.py
│   │   ├── items.py
│   │   ├── vehiculos.py
│   │   └── correos.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── conciliacion_service.py  ← lógica de negocio central
│   │   ├── tarifa_service.py        ← cálculo de tarifas y rentabilidad
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
```

---

## Autenticación y roles

```python
# Roles disponibles
ROL_COINTRA  = "COINTRA"
ROL_CLIENTE  = "CLIENTE"
ROL_TERCERO  = "TERCERO"

# Sub-roles de COINTRA (campo sub_rol en tabla usuarios)
SUB_ROL_ADMIN = "COINTRA_ADMIN"  # acceso total
SUB_ROL_USER  = "COINTRA_USER"   # acceso limitado

# JWT payload
{
  "sub": "usuario_id",
  "rol": "COINTRA",
  "sub_rol": "COINTRA_ADMIN",  # solo si rol == COINTRA
  "cliente_id": null,
  "tercero_id": null,
  "exp": timestamp
}
```

### Matriz de permisos

| Acción | COINTRA_ADMIN | COINTRA_USER | CLIENTE | TERCERO |
|---|---|---|---|---|
| Crear viajes | ✅ | ✅ | ❌ | ✅ |
| Editar/eliminar viajes | ✅ | ❌ | ❌ | ❌ |
| Crear conciliaciones | ✅ | ✅ | ❌ | ❌ |
| Editar tarifas (BORRADOR) | ✅ | ✅ | ❌ | ❌ |
| Eliminar conciliaciones | ✅ | ❌ | ❌ | ❌ |
| Crear vehículos | ✅ | ✅ | ❌ | ✅ |
| Editar/eliminar vehículos | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios/operaciones | ✅ | ❌ | ❌ | ❌ |
| Enviar correos | ✅ | ✅ | ✅ | ❌ |

### Middleware de permisos

```python
def require_cointra_admin(current_user = Depends(get_current_user)):
    if current_user.rol != "COINTRA" or current_user.sub_rol != "COINTRA_ADMIN":
        raise HTTPException(403)

def require_cointra(current_user = Depends(get_current_user)):
    if current_user.rol != "COINTRA":
        raise HTTPException(403)
```

---

## Endpoints principales

### Auth
```
POST /auth/login          → devuelve JWT
POST /auth/refresh        → renueva token
GET  /auth/me             → datos del usuario autenticado
```

### Clientes y Terceros (solo COINTRA_ADMIN)
```
GET    /clientes/
POST   /clientes/
PUT    /clientes/{id}
GET    /terceros/
POST   /terceros/
PUT    /terceros/{id}
```

### Usuarios (solo COINTRA_ADMIN)
```
GET    /usuarios/
POST   /usuarios/
PUT    /usuarios/{id}
DELETE /usuarios/{id}
```

### Operaciones (solo COINTRA_ADMIN)
```
GET    /operaciones/
POST   /operaciones/
PUT    /operaciones/{id}
GET    /operaciones/{id}
```

### Vehículos
```
GET    /vehiculos/                    → todos los roles autenticados
POST   /vehiculos/                    → COINTRA_ADMIN, COINTRA_USER, TERCERO
PUT    /vehiculos/{id}                → solo COINTRA_ADMIN
DELETE /vehiculos/{id}                → solo COINTRA_ADMIN
GET    /vehiculos/tipos-vehiculo      → todos los roles autenticados
POST   /vehiculos/tipos-vehiculo      → COINTRA_ADMIN, COINTRA_USER
PUT    /vehiculos/tipos-vehiculo/{id} → solo COINTRA_ADMIN
DELETE /vehiculos/tipos-vehiculo/{id} → solo COINTRA_ADMIN
```

### Conciliaciones
```
GET    /conciliaciones/               → filtra por rol
POST   /conciliaciones/               → solo COINTRA (ADMIN y USER)
GET    /conciliaciones/{id}           → valida acceso por rol
PUT    /conciliaciones/{id}/estado    → cambio de estado con trazabilidad
DELETE /conciliaciones/{id}           → solo COINTRA_ADMIN
```

### Ítems de conciliación
```
GET    /conciliaciones/{id}/items/
POST   /conciliaciones/{id}/items/      → solo COINTRA
PATCH  /items/{id}                      → actualiza tarifa, manifiesto_numero, remesa
                                          solo COINTRA (ADMIN y USER), solo en BORRADOR
DELETE /items/{id}                      → solo COINTRA_ADMIN
```

### Correos
```
POST   /correos/enviar                         → destinatario editable, texto plano
POST   /correos/facturacion/{conciliacion_id}  → genera Excel y envía correo interno
```

### Comentarios
```
POST   /comentarios/
GET    /conciliaciones/{id}/comentarios/
```

---

## IMPORTANTE — Sin integración Avansat

**La API de Avansat NO se consume en esta fase.**
El manifiesto y la remesa se ingresan **manualmente** por Cointra
al revisar cada ítem de tipo VIAJE dentro de una conciliación en estado BORRADOR.

El endpoint PATCH /items/{id} debe permitir actualizar:
- `manifiesto_numero`
- `remesa`

Solo accesible para COINTRA (ADMIN y USER) y solo cuando la conciliación está en BORRADOR.

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

## Servicio de correos (correo_service.py)

```python
# Correos de texto plano — sin diseño elaborado
# Destinatario siempre editable por el usuario

ASUNTO_REVISION = "Cointra - Conciliación pendiente por revisar"
CUERPO_REVISION = "Hay una conciliación disponible para su revisión en el sistema."

ASUNTO_RESPONDIDA = "Cointra - Conciliación respondida"
CUERPO_RESPONDIDA = "El cliente respondió la conciliación. Por favor revise el sistema."

ASUNTO_RECHAZADA = "Cointra - Conciliación con observaciones"
CUERPO_RECHAZADA = "La conciliación tiene observaciones pendientes. Revise el sistema."

# Correo interno con Excel adjunto (solo para equipo de facturación Cointra)
ASUNTO_FACTURACION = "Cointra - Conciliación autorizada para facturar"
CUERPO_FACTURACION = "La conciliación fue aprobada. Se adjunta Excel con el detalle."
```

---

## Servicio Excel (excel_service.py)

```python
# Columnas del Excel de facturación (solo uso interno Cointra)
# NUNCA se envía al cliente ni al tercero
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
```

---

## Control de visibilidad en queries

```python
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
        "manifiesto_numero": item.manifiesto_numero,
        "remesa": item.remesa,
        "descripcion": item.descripcion,
    }
    if rol == "COINTRA":
        base.update({
            "tarifa_cliente": item.tarifa_cliente,
            "tarifa_tercero": item.tarifa_tercero,
            "rentabilidad": item.rentabilidad,
            "descuento_valor": item.descuento_valor,
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

## Seed inicial (db/seed.py)

```python
# Tipos de vehículo iniciales
tipos = ["Sencillo", "Doble Troque", "Tractomula", "Mini Mula"]

# Usuario inicial Cointra
usuario = Usuario(
    nombre="Admin Cointra",
    email="cointra@cointra.com",
    rol=UserRole.COINTRA,
    sub_rol=CointraSubRol.COINTRA_ADMIN
)
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
openpyxl
python-multipart
```
