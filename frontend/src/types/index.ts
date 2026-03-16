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
  activa: boolean;
}

export interface Conciliacion {
  id: number;
  operacion_id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "BORRADOR" | "EN_REVISION" | "APROBADA" | "CERRADA";
  created_by: number;
  created_at: string;
}

export interface Item {
  id: number;
  conciliacion_id: number;
  tipo: "VIAJE" | "PEAJE" | "HORA_EXTRA" | "VIAJE_EXTRA" | "ESTIBADA" | "CONDUCTOR_RELEVO" | "OTRO";
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
  created_by: number;
  created_at: string;
}

export interface Viaje {
  id: number;
  operacion_id: number;
  tercero_id: number;
  conciliacion_id?: number | null;
  titulo: string;
  fecha_servicio: string;
  origen: string;
  destino: string;
  placa: string;
  conductor: string | null;
  tarifa_tercero: number | null;
  tarifa_cliente: number | null;
  rentabilidad: number | null;
  manifiesto_numero: string | null;
  descripcion: string | null;
  cargado_por: string;
  conciliado: boolean;
  created_by: number;
  created_at: string;
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
  propietario: string | null;
  activo: boolean;
  created_by: number;
}
