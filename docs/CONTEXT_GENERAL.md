# CONTEXT GENERAL — Sistema de Conciliación — Cointra S.A.S.

## ¿Qué es este proyecto?
Sistema web interno desarrollado por el Área de Análisis de Datos de Cointra S.A.S.
Permite conciliar los servicios prestados por transportadores terceros, obtener aprobación del cliente
y generar la autorización para facturar.

## Stack tecnológico
- **Backend:** Python + FastAPI
- **Base de datos:** PostgreSQL
- **Frontend:** React + TailwindCSS
- **Correos:** SMTP Microsoft/Claro — cuenta notificaciones@cointra.com.co
- **Integración externa:** API REST de Avansat (manifiestos de transporte)

---

## Actores del sistema

| Actor | Rol | Acceso |
|---|---|---|
| **Cointra** | Operador logístico / Administrador | Ve todo. Crea operaciones, conciliaciones, ajusta tarifas, envía al cliente |
| **Cliente** | Dueño de la carga / Aprobador | Ve solo sus conciliaciones y sus tarifas. Aprueba o rechaza |
| **Tercero** | Transportador contratado | Carga viajes/peajes/adicionales. Ve sus conciliaciones en modo lectura y su tarifa |

---

## Regla de negocio central

```
Cliente paga a Cointra → Cointra retiene su rentabilidad → Cointra paga al Tercero

Tarifa Tercero = Tarifa Cliente × (1 - % Rentabilidad / 100)

Ejemplo:
  Tarifa cliente:     $1.000.000
  Rentabilidad 10%:  -$  100.000
  Pago al tercero:   $  900.000
```

### Con descuento (cuando está habilitado en la operación):
```
  Tarifa negociada cliente:        $1.000.000
  Descuento lavada (tractomula):  -$   35.000
  Valor real que paga el cliente: $  965.000
  Rentabilidad Cointra (10% sobre $1.000.000 negociado): $100.000
  Pago al tercero:                $  865.000
```
El descuento lo asume el tercero. La rentabilidad se calcula sobre la tarifa negociada original.

---

## Visibilidad de tarifas — REGLA NO NEGOCIABLE

| | Tarifa Cliente→Cointra | Tarifa Cointra→Tercero | Rentabilidad |
|---|---|---|---|
| Tercero | ❌ | ✅ Solo la suya | ❌ |
| Cliente | ✅ Solo la suya | ❌ | ❌ |
| Cointra | ✅ | ✅ | ✅ |

Esta restricción aplica en: vistas, APIs, exportaciones y correos.

---

## MÓDULO DE VIAJES — REGLAS DE NEGOCIO

### Campos del viaje
- **titulo** (obligatorio): nombre descriptivo del viaje. Ejemplos: "Urbano Montevideo", "Urbano Cota", "Urbano Gachancipá", "Traslado Montevideo". Este campo reemplaza cualquier identificador genérico.
- **conductor** (opcional): no es obligatorio al crear un viaje.
- Los demás campos: fecha_servicio, origen, destino, placa, tarifa_tercero, operacion_id.

### Quién puede cargar viajes
- **Tercero:** puede cargar viajes, peajes y servicios adicionales. Al crear cada uno debe indicar a qué operación pertenece. Los ítems quedan en estado PENDIENTE hasta que Cointra los incluya en una conciliación.
- **Cointra:** también puede cargar viajes directamente.

### Estado de los viajes en el listado
- Si el viaje **no está conciliado**: mostrar estado "PENDIENTE".
- Si el viaje **está conciliado**: mostrar estado "CONCILIADO" y el número/nombre de la conciliación con la que fue conciliado. El tercero puede hacer clic para ver esa conciliación.

### Catálogo de tarifas
- Existe solo como referencia de consulta para el usuario.
- **No tiene relación en base de datos con los viajes ni conciliaciones.**
- El usuario lo consulta manualmente para saber qué tarifa aplicar, pero el sistema no lo usa automáticamente.

---

## MÓDULO DE CONCILIACIONES — REGLAS DE NEGOCIO

### Quién crea conciliaciones
- **SOLO COINTRA puede crear conciliaciones.** El tercero no puede crearlas.
- El tercero solo puede VER las conciliaciones que le corresponden, en modo lectura. No puede modificarlas.

### Carga automática de viajes al crear una conciliación
- Cuando Cointra crea una conciliación para una operación, el sistema debe cargar automáticamente TODOS los viajes PENDIENTES de esa operación que existan hasta la fecha de creación de la conciliación.
- Esto garantiza que ningún viaje quede por fuera.
- Cointra puede luego revisar y ajustar valores si algo no cuadra antes de enviar al cliente.

### Flujo completo de una conciliación

**Paso 1 — Tercero carga sus servicios:**
El tercero ingresa al sistema y carga sus viajes, peajes o servicios adicionales indicando la operación. Quedan en estado PENDIENTE.

**Paso 2 — Cointra crea la conciliación:**
Cointra crea una conciliación para una operación y período. El sistema jala automáticamente todos los viajes PENDIENTES de esa operación. Cointra puede corregir valores si algo no cuadra.

**Paso 3 — Cointra envía al cliente:**
Cointra guarda la conciliación y puede enviar un correo al cliente (botón manual, destinatario editable). La conciliación cambia a estado EN_REVISION. Al cliente le aparece la conciliación pendiente por revisar.

**Paso 4 — Cliente revisa:**
El cliente ve la conciliación con sus ítems. Solo ve la tarifa que le corresponde (tarifa_cliente). Puede:
- Aprobar ítem por ítem individualmente.
- Aprobar todos los ítems de una vez con un checkbox "Aprobar todos".
- Rechazar ítems con observaciones (por ítem o por conciliación completa).

**Paso 5 — Cliente responde:**
Al guardar su respuesta, el cliente puede enviar un correo a Cointra (botón manual, destinatario editable) notificando que respondió la conciliación.

**Paso 6 — Cointra revisa la respuesta:**
Si hay rechazos, Cointra ajusta y reenvía. Si todo está aprobado, Cointra puede enviar un correo al equipo interno de facturación con el Excel adjunto.

**Paso 7 — Notificación al tercero:**
Una vez la conciliación es aprobada, al tercero le aparece una notificación: "La conciliación #XXX fue aprobada". Los viajes dentro de esa conciliación cambian a estado CONCILIADO y muestran el número de conciliación. El tercero puede ver la conciliación en modo lectura para ver qué viajes fueron aprobados y la tarifa que le aprobaron (solo tarifa_tercero).

---

## Tipos de conciliación

1. **Viajes** — asociada a una operación. Jala automáticamente viajes PENDIENTES al crearla.
2. **Peajes** — para conciliar peajes cargados por el tercero. Sin manifiesto.
3. **Servicios Adicionales** — horas extras, viajes extra, estibadas, conductor relevo, otros.

---

## Estados

### Conciliación
`BORRADOR → EN_REVISION → APROBADA → CERRADA`

### Viaje / Ítem
`PENDIENTE → EN_REVISION → APROBADO | RECHAZADO`
- Un viaje conciliado muestra además el número de conciliación al que pertenece.

---

## Correos del sistema
Todos son manuales (botón). Destinatario editable. Texto plano. Sin diseño elaborado.

| Evento | Quién envía | Destinatario | Contenido |
|---|---|---|---|
| Conciliación lista para revisión | Cointra | Cliente | Aviso simple: hay una conciliación pendiente por revisar |
| Conciliación respondida | Cliente | Cointra | Aviso: el cliente respondió la conciliación |
| Conciliación rechazada/observada | Cliente | Cointra | Aviso: hay observaciones pendientes |
| Autorización para facturar | Cointra | Equipo interno | Excel adjunto con todos los datos completos |

**Correo interno con Excel incluye:** valor cliente, rentabilidad Cointra, valor tercero, manifiesto, remesa, producto, origen, destino, placa, remolque, fecha manifiesto, poseedor.

**Implementación:** SMTP Microsoft/Claro — notificaciones@cointra.com.co — credenciales provistas por TI.

---

## API Avansat
```
URL: https://avansat5.intrared.net:8083/ap/interf/app/APIAvansat/v1/index.php
Método: GET
Header Authorization: 3d524a53c110e4c22463b10ed32cef9d

Parámetros fijos:
  aplicacion=sate_cointr
  type=operacionnacional
  user=InterfApiOperaCoin
  pass=ZxDYT1QkxdId8

Filtros:
  &manifiesto=NUMERO_MANIFIESTO
  &fechacreadoinicial=YYYY-MM-DD
  &fechacreadofinal=YYYY-MM-DD

Códigos clave:
  1000 = éxito
  1002 = credenciales incorrectas
  3003 = consumo excedido
```

---

## LO QUE ESTE SISTEMA NO HACE
- No genera facturas electrónicas (solo autoriza para facturar).
- No integra con sistemas de facturación (solo con API Avansat).
- No envía correos automáticos (siempre manual con botón).
- No tiene periodicidad fija de conciliación (el período lo define Cointra libremente).
- El catálogo de tarifas es solo de consulta, no tiene relación en base de datos con viajes ni conciliaciones.

---

## Estructura de carpetas del proyecto
```
sistema_conciliacion/
├── backend/          ← FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── models/       ← modelos SQLAlchemy
│   │   ├── schemas/      ← esquemas Pydantic
│   │   ├── routers/      ← endpoints por módulo
│   │   ├── services/     ← lógica de negocio
│   │   └── utils/        ← correos, Avansat, Excel
│   ├── alembic/          ← migraciones DB
│   └── requirements.txt
├── frontend/         ← React + TailwindCSS
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/     ← llamadas API
│   │   └── context/      ← auth, usuario
│   └── package.json
└── docs/
    ├── CONTEXT_GENERAL.md
    ├── CONTEXT_DATABASE.md
    ├── CONTEXT_BACKEND.md
    └── CONTEXT_FRONTEND.md
```
