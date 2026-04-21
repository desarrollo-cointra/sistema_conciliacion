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

export interface AuthMessage {
  message: string;
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
  factura_cliente_enviada: boolean;
  po_numero_autorizacion?: string | null;
  created_by: number;
  created_at: string;
  creador_nombre?: string | null;
  cliente_nombre?: string | null;
  tercero_nombre?: string | null;
  estado_actualizado_por_nombre?: string | null;
  estado_actualizado_por_email?: string | null;
  valor_cliente?: number | null;
  valor_tercero?: number | null;
  fecha_creacion?: string | null;
  fecha_envio_revision?: string | null;
  fecha_aprobacion?: string | null;
  fecha_rechazo?: string | null;
  fecha_envio_facturacion?: string | null;
  fecha_facturado?: string | null;
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
  conciliacion_id: number | null;
  conciliacion_contexto: "CONCILIACION" | "LIQUIDACION_CONTRATO_FIJO" | null;
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

export interface AvansatCacheStats {
  total_cached: number;
  total_con_conciliacion: number;
}

export interface AvansatSyncResult {
  total: number;
  inserted: number;
  skipped: number;
  start_date: string;
  end_date: string;
}

export interface DashboardPeriod {
  mode: "current_month" | "year_to_date" | "month_year";
  start_date: string;
  end_date: string;
  label: string;
  compare_start_date: string;
  compare_end_date: string;
}

export interface DashboardKpis {
  conciliaciones: number;
  servicios: number;
  manifiestos: number;
  ingresos: number;
  costos: number;
  ganancia: number;
  margen_pct: number;
  aprobacion_items_pct: number;
  ticket_promedio: number;
  placas_activas: number;
  variacion_ganancia_pct: number;
  viajes_pendientes: number;
  viajes_en_revision: number;
  viajes_conciliados: number;
  conc_borrador: number;
  conc_en_revision: number;
  conc_aprobada: number;
  conc_devuelta: number;
  conc_enviada_facturar: number;
  conc_facturada: number;
}

export interface DashboardLabelValue {
  label: string;
  value: number;
}

export interface DashboardSeriePoint {
  label: string;
  date: string;
  ingresos: number;
  costos: number;
  ganancia: number;
  servicios: number;
}

export interface DashboardTopEntry {
  label: string;
  servicios: number;
  ingresos: number;
  costos: number;
  ganancia: number;
}

export interface DashboardTopOperacionEntry extends DashboardTopEntry {
  operacion_id: number;
}

export interface DashboardPlacaDesglose {
  placa: string;
  viajes: number;
  disponibilidad: number;
  total: number;
  viajes_cliente: number;
  disponibilidad_cliente: number;
  total_cliente: number;
}

export interface DashboardIndicators {
  period: DashboardPeriod;
  kpis: DashboardKpis;
  charts: {
    conciliaciones_estado: DashboardLabelValue[];
    items_estado: DashboardLabelValue[];
    items_tipo: DashboardLabelValue[];
    costo_por_tipo: DashboardLabelValue[];
    serie: DashboardSeriePoint[];
    top_operaciones: DashboardTopOperacionEntry[];
    top_placas: DashboardTopEntry[];
    top_clientes: DashboardTopEntry[];
    top_terceros: DashboardTopEntry[];
    placa_desglose: DashboardPlacaDesglose[];
  };
}
