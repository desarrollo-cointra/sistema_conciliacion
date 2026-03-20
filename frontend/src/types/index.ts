export type UserRole = "COINTRA" | "CLIENTE" | "TERCERO";

export type CointraSubRol = "COINTRA_ADMIN" | "COINTRA_USER";

export interface User {
  id: number;
  nombre: string;
  email: string;
  rol: UserRole;
  sub_rol?: CointraSubRol | null;
  cliente_id?: number | null;
  tercero_id?: number | null;
  operacion_ids?: number[];
  activo: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Operacion {
  id: number;
  cliente_id: number;
  tercero_id: number;
  nombre: string;
  porcentaje_rentabilidad: number;
  cliente_usuario_ids?: number[];
  activa: boolean;
}

export interface Cliente {
  id: number;
  nombre: string;
  nit: string;
  activo: boolean;
}

export interface Tercero {
  id: number;
  nombre: string;
  nit: string;
  activo: boolean;
}

export interface Conciliacion {
  id: number;
  operacion_id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "BORRADOR" | "EN_REVISION" | "APROBADA" | "CERRADA";
  activo: boolean;
  borrador_guardado: boolean;
  enviada_facturacion: boolean;
  created_by: number;
  created_at: string;
  creador_nombre?: string | null;
  cliente_nombre?: string | null;
  tercero_nombre?: string | null;
  estado_actualizado_por_nombre?: string | null;
  estado_actualizado_por_email?: string | null;
}

export interface ConciliacionManifiesto {
  id: number;
  conciliacion_id: number;
  manifiesto_numero: string;
  contexto: "CONCILIACION" | "LIQUIDACION_CONTRATO_FIJO";
  liquidacion_contrato_fijo_id?: number | null;
  created_by: number;
  created_at: string;
}

export interface Item {
  id: number;
  conciliacion_id: number;
  viaje_id?: number | null;
  tipo: "VIAJE" | "PEAJE" | "HORA_EXTRA" | "VIAJE_ADICIONAL" | "ESTIBADA" | "CONDUCTOR_RELEVO" | "OTRO";
  estado: "PENDIENTE" | "EN_REVISION" | "APROBADO" | "RECHAZADO";
  fecha_servicio: string;
  origen: string | null;
  destino: string | null;
  placa: string | null;
  conductor: string | null;
  tarifa_tercero: number | null;
  tarifa_cliente: number | null;
  rentabilidad: number | null;
  manifiesto_numero: string | null;
  remesa: string | null;
  cargado_por: string;
  descripcion: string | null;
  servicio_nombre?: string | null;
  servicio_codigo?: string | null;
  horas_cantidad?: number | null;
  liquidacion_contrato_fijo?: boolean;
  liquidacion_contrato_fijo_id?: number | null;
  liquidacion_periodo_inicio?: string | null;
  liquidacion_periodo_fin?: string | null;
  liquidacion_es_relevo?: boolean;
  liquidacion_relevo_con_valor?: boolean | null;
  created_by: number;
  created_at: string;
}

export interface Viaje {
  id: number;
  operacion_id: number;
  tercero_id: number;
  servicio_id?: number | null;
  conciliacion_id?: number | null;
  titulo: string;
  fecha_servicio: string;
  origen: string;
  destino: string;
  placa: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  horas_cantidad?: number | null;
  conductor: string | null;
  tarifa_tercero: number | null;
  tarifa_cliente: number | null;
  rentabilidad: number | null;
  manifiesto_numero: string | null;
  descripcion: string | null;
  cargado_por: string;
  conciliado: boolean;
  estado_conciliacion?: "BORRADOR" | "EN_REVISION" | "APROBADA" | "CERRADA" | null;
  servicio_nombre?: string | null;
  servicio_codigo?: string | null;
  activo: boolean;
  created_by: number;
  created_at: string;
}

export interface Servicio {
  id: number;
  nombre: string;
  codigo: string;
  requiere_origen_destino: boolean;
  activo: boolean;
  created_by: number;
}

export interface CatalogoTarifa {
  id: number;
  servicio_id: number;
  tipo_vehiculo_id: number;
  tarifa_cliente: number;
  rentabilidad_pct: number;
  tarifa_tercero: number;
  activo: boolean;
  updated_by: number;
  servicio_nombre?: string | null;
  servicio_codigo?: string | null;
  tipo_vehiculo_nombre?: string | null;
}

export interface TarifaLookup {
  tarifa: number;
  tarifa_cliente?: number;
  tarifa_tercero?: number;
  rentabilidad_pct?: number;
  ganancia_cointra?: number;
  servicio_id: number;
  tipo_vehiculo_id: number;
}

export interface TipoVehiculo {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Vehiculo {
  id: number;
  placa: string;
  tipo_vehiculo_id: number;
  tercero_id?: number | null;
  propietario: string | null;
  activo: boolean;
  created_by: number;
}

export interface Notificacion {
  id: number;
  usuario_id: number;
  titulo: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  email_intentado: boolean;
  email_enviado: boolean;
  email_error: string | null;
  created_at: string;
  conciliacion_id?: number | null;
}

export interface DestinatarioSugerido {
  usuario_id: number;
  nombre: string;
  email: string;
  rol: string;
}

export interface AvansatLookup {
  manifiesto: string;
  encontrado: boolean;
  fecha_emision: string | null;
  producto: string | null;
  placa_vehiculo: string | null;
  trayler: string | null;
  remesa: string | null;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
}

export interface AvansatCacheRow {
  manifiesto_numero: string;
  estado: "SINCRONIZADO";
  fecha_emision: string | null;
  placa_vehiculo: string | null;
  trayler: string | null;
  remesa: string | null;
  producto: string | null;
  ciudad_origen: string | null;
  ciudad_destino: string | null;
  created_at: string | null;
}

export interface AvansatCacheListResult {
  total: number;
  page: number;
  page_size: number;
  rows: AvansatCacheRow[];
}

export interface AvansatSyncResult {
  total: number;
  inserted: number;
  skipped: number;
  start_date: string;
  end_date: string;
}
