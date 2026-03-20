# CONTEXT DATABASE — Sistema de Conciliación — Cointra S.A.S.

## Motor: PostgreSQL

---

## Esquema completo (DBML)

```sql
Table clientes {
  id int [pk, increment]
  nombre varchar
  nit varchar
  email_contacto varchar
  activo boolean
  created_at datetime
}

Table terceros {
  id int [pk, increment]
  nombre varchar
  nit varchar
  email_contacto varchar
  activo boolean
  created_at datetime
}

-- rol: COINTRA | CLIENTE | TERCERO
-- Los usuarios Cointra tienen cliente_id y tercero_id en NULL
-- Los usuarios de cliente tienen cliente_id diligenciado
-- Los usuarios de tercero tienen tercero_id diligenciado
Table usuarios {
  id int [pk, increment]
  nombre varchar
  email varchar [unique]
  password_hash varchar
  rol varchar
  cliente_id int [null]
  tercero_id int [null]
  activo boolean
  created_at datetime
}
Ref: usuarios.cliente_id > clientes.id
Ref: usuarios.tercero_id > terceros.id

-- Cada operación = un cliente + un tercero ejecutor + % rentabilidad
-- descuentos_habilitados: si true, aplica descuento por tipo de vehículo
Table operaciones {
  id int [pk, increment]
  cliente_id int
  tercero_id int
  nombre varchar
  descripcion text
  porcentaje_rentabilidad decimal
  descuentos_habilitados boolean [default: false]
  descuento_doble_troque decimal [null]
  descuento_tractomula decimal [null]
  motivo_descuento varchar [null]
  activa boolean
  created_at datetime
}
Ref: operaciones.cliente_id > clientes.id
Ref: operaciones.tercero_id > terceros.id

-- tipo: VIAJES | PEAJES | ADICIONALES
-- estado: BORRADOR | EN_REVISION | APROBADA | CERRADA
Table conciliaciones {
  id int [pk, increment]
  operacion_id int
  tipo varchar
  nombre varchar
  estado varchar
  fecha_inicio date
  fecha_fin date
  created_by int
  aprobado_por int [null]
  fecha_aprobacion datetime [null]
  observaciones text [null]
  created_at datetime
  updated_at datetime
}
Ref: conciliaciones.operacion_id > operaciones.id
Ref: conciliaciones.created_by > usuarios.id
Ref: conciliaciones.aprobado_por > usuarios.id

-- tipo: VIAJE | PEAJE | HORA_EXTRA | VIAJE_ADICIONAL | ESTIBADA | CONDUCTOR_RELEVO | OTRO
-- estado: PENDIENTE | EN_REVISION | APROBADO | RECHAZADO
-- tipo_vehiculo: DOBLE_TROQUE | TRACTOMULA | OTRO (solo para viajes con descuento)
-- cargado_por: TERCERO | COINTRA
-- Campos nullable según tipo:
--   PEAJE: sin tarifa_tercero, sin placa, sin conductor, sin manifiesto
--   ADICIONALES: tarifa_tercero puede ser null
Table conciliacion_items {
  id int [pk, increment]
  conciliacion_id int
  tipo varchar
  estado varchar
  fecha_servicio date
  origen varchar [null]
  destino varchar [null]
  placa varchar [null]
  remolque varchar [null]
  conductor varchar [null]
  tipo_vehiculo varchar [null]
  producto varchar [null]
  poseedor varchar [null]
  remesa varchar [null]
  tarifa_tercero decimal [null]
  tarifa_cliente decimal [null]
  descuento_valor decimal [null]
  descuento_motivo varchar [null]
  rentabilidad decimal [null]
  manifiesto_avansat_id varchar [null]
  manifiesto_numero varchar [null]
  fecha_manifiesto date [null]
  cargado_por varchar
  descripcion text [null]
  created_by int
  created_at datetime
  updated_at datetime
}
Ref: conciliacion_items.conciliacion_id > conciliaciones.id
Ref: conciliacion_items.created_by > usuarios.id

-- Comentarios sobre conciliacion o ítem específico
-- conciliacion_id o item_id, uno de los dos siempre presente
Table comentarios {
  id int [pk, increment]
  conciliacion_id int [null]
  item_id int [null]
  usuario_id int
  comentario text
  created_at datetime
}
Ref: comentarios.conciliacion_id > conciliaciones.id
Ref: comentarios.item_id > conciliacion_items.id
Ref: comentarios.usuario_id > usuarios.id

-- Trazabilidad de cambios de estado y modificaciones
-- conciliacion_id o item_id, uno de los dos siempre presente
Table historial_cambios {
  id int [pk, increment]
  conciliacion_id int [null]
  item_id int [null]
  usuario_id int
  campo varchar
  valor_anterior text [null]
  valor_nuevo text
  fecha datetime
}
Ref: historial_cambios.conciliacion_id > conciliaciones.id
Ref: historial_cambios.item_id > conciliacion_items.id
Ref: historial_cambios.usuario_id > usuarios.id
```

---

## Decisiones de diseño

1. **Sin tabla `organizaciones`** — clientes y terceros son entidades separadas y directas.
   No hay abstracción intermedia. Más simple y directo al negocio.

2. **`conciliacion_items` unificada** — un solo modelo para todos los tipos de ítem.
   El campo `tipo` diferencia VIAJE / PEAJE / ADICIONAL. Campos no aplicables van en NULL.

3. **Descuentos en `operaciones`** — configurables por operación con flag `descuentos_habilitados`.
   Valores por tipo de vehículo: `descuento_doble_troque` y `descuento_tractomula`.

4. **`porcentaje_rentabilidad` en `operaciones`** — para la fase 1 es suficiente.
   Si en el futuro se requiere historial de cambios de %, se puede migrar a tabla `tarifas_operacion`.

5. **Visibilidad en queries** — la rentabilidad y tarifa_tercero NUNCA se incluyen
   en queries dirigidas a vistas de Cliente. Esto se controla en la capa de servicios del backend.

---

## Cálculos importantes

```python
# Sin descuento
tarifa_tercero = tarifa_cliente * (1 - porcentaje_rentabilidad / 100)
rentabilidad = tarifa_cliente * (porcentaje_rentabilidad / 100)

# Con descuento habilitado en la operación
valor_descuento = descuento_tractomula  # o descuento_doble_troque según tipo_vehiculo
valor_real_cliente = tarifa_cliente - valor_descuento
rentabilidad = tarifa_cliente * (porcentaje_rentabilidad / 100)  # sobre tarifa original
tarifa_tercero = valor_real_cliente - rentabilidad
```

---

## Índices recomendados

```sql
CREATE INDEX idx_conciliaciones_operacion ON conciliaciones(operacion_id);
CREATE INDEX idx_conciliaciones_estado ON conciliaciones(estado);
CREATE INDEX idx_items_conciliacion ON conciliacion_items(conciliacion_id);
CREATE INDEX idx_items_estado ON conciliacion_items(estado);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
```

---

## Datos iniciales (seeds)

```sql
-- Cointra como usuario administrador inicial
INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
VALUES ('Admin Cointra', 'admin@cointra.com.co', '<hash>', 'COINTRA', true);
```

---

## Migraciones
Usar **Alembic** con SQLAlchemy para gestión de migraciones.
```bash
alembic init alembic
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```
