import { AvansatCacheListResult, AvansatLookup, AvansatSyncResult, CatalogoTarifa, Cliente, Conciliacion, ConciliacionManifiesto, DestinatarioSugerido, Item, LoginResponse, Notificacion, Operacion, Servicio, TarifaLookup, Tercero, TipoVehiculo, User, Vehiculo, Viaje } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.headers && !Array.isArray(options.headers) && !(options.headers instanceof Headers)) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Error en la solicitud");
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  usuarios: () => request<User[]>("/catalogs/usuarios"),
  crearUsuario: (payload: {
    nombre: string;
    email: string;
    password: string;
    rol: "COINTRA" | "CLIENTE" | "TERCERO";
    sub_rol?: "COINTRA_ADMIN" | "COINTRA_USER" | null;
    cliente_id?: number | null;
    tercero_id?: number | null;
    operacion_ids?: number[];
  }) =>
    request<User>("/catalogs/usuarios", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  clientes: () => request<Cliente[]>("/catalogs/clientes"),
  crearCliente: (payload: { nombre: string; nit: string }) =>
    request<Cliente>("/catalogs/clientes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarCliente: (id: number, payload: { nombre?: string; nit?: string }) =>
    request<Cliente>(`/catalogs/clientes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarCliente: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/clientes/${id}`, {
      method: "DELETE",
    }),
  reactivarCliente: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/clientes/${id}/reactivar`, {
      method: "POST",
    }),
  terceros: () => request<Tercero[]>("/catalogs/terceros"),
  crearTercero: (payload: { nombre: string; nit: string }) =>
    request<Tercero>("/catalogs/terceros", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarTercero: (id: number, payload: { nombre?: string; nit?: string }) =>
    request<Tercero>(`/catalogs/terceros/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarTercero: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/terceros/${id}`, {
      method: "DELETE",
    }),
  reactivarTercero: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/terceros/${id}/reactivar`, {
      method: "POST",
    }),
  operaciones: () => request<Operacion[]>("/catalogs/operaciones"),
  clienteUsuarios: (clienteId: number) => request<User[]>(`/catalogs/clientes/${clienteId}/usuarios-cliente`),
  crearOperacion: (payload: {
    cliente_id: number;
    tercero_id: number;
    nombre: string;
    porcentaje_rentabilidad: number;
    cliente_usuario_ids?: number[];
  }) =>
    request<Operacion>("/catalogs/operaciones", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarOperacion: (
    id: number,
    payload: {
      cliente_id?: number;
      tercero_id?: number;
      nombre?: string;
      porcentaje_rentabilidad?: number;
      cliente_usuario_ids?: number[];
    }
  ) =>
    request<Operacion>(`/catalogs/operaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarOperacion: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/operaciones/${id}`, {
      method: "DELETE",
    }),
  reactivarOperacion: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/operaciones/${id}/reactivar`, {
      method: "POST",
    }),
  conciliaciones: () => request<Conciliacion[]>("/conciliaciones"),
  crearConciliacion: (payload: {
    operacion_id: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  }) =>
    request<Conciliacion>("/conciliaciones", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarConciliacion: (
    id: number,
    payload: { operacion_id?: number; nombre?: string; fecha_inicio?: string; fecha_fin?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarConciliacion: (id: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${id}`, {
      method: "DELETE",
    }),
  reactivarConciliacion: (id: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${id}/reactivar`, {
      method: "POST",
    }),
  items: (conciliacionId: number) => request<Item[]>(`/conciliaciones/${conciliacionId}/items`),
  crearItem: (payload: {
    conciliacion_id: number;
    tipo: string;
    fecha_servicio: string;
    origen?: string;
    destino?: string;
    placa?: string;
    conductor?: string;
    tarifa_tercero?: number;
    tarifa_cliente?: number;
    descripcion?: string;
  }) =>
    request<Item>("/conciliaciones/items", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  viajes: (operacionId?: number, onlyPending = false) => {
    const search = new URLSearchParams();
    if (operacionId) search.set("operacion_id", String(operacionId));
    if (onlyPending) search.set("only_pending", "true");
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<Viaje[]>(`/viajes${suffix}`);
  },
  crearViaje: (payload: {
    operacion_id: number;
    servicio_id?: number;
    titulo: string;
    fecha_servicio: string;
    origen?: string;
    destino?: string;
    placa: string;
    hora_inicio?: string;
    conductor?: string;
    tarifa_tercero?: number;
    tarifa_cliente?: number;
    manifiesto_numero?: string;
    descripcion?: string;
  }) =>
    request<Viaje>("/viajes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarViaje: (
    id: number,
    payload: {
      titulo?: string;
      fecha_servicio?: string;
      origen?: string;
      destino?: string;
      placa?: string;
      conductor?: string;
      tarifa_tercero?: number;
      tarifa_cliente?: number;
      manifiesto_numero?: string;
      descripcion?: string;
    }
  ) =>
    request<Viaje>(`/viajes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarViaje: (id: number) =>
    request<{ ok: boolean }>(`/viajes/${id}`, {
      method: "DELETE",
    }),
  reactivarViaje: (id: number) =>
    request<{ ok: boolean }>(`/viajes/${id}/reactivar`, {
      method: "POST",
    }),
  viajesPendientesConciliacion: (conciliacionId: number) =>
    request<Viaje[]>(`/conciliaciones/${conciliacionId}/viajes-pendientes`),
  adjuntarViajesConciliacion: (conciliacionId: number, viajeIds: number[]) =>
    request<Item[]>(`/conciliaciones/${conciliacionId}/adjuntar-viajes`, {
      method: "POST",
      body: JSON.stringify({ viaje_ids: viajeIds }),
    }),
  quitarViajeConciliacion: (conciliacionId: number, viajeId: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${conciliacionId}/viajes/${viajeId}`, {
      method: "DELETE",
    }),
  crearLiquidacionContratoFijo: (
    conciliacionId: number,
    payload: {
      liquidacion_id?: number | null;
      periodo_inicio: string;
      periodo_fin: string;
      placas: string[];
      valor_tercero: number;
      incluir_conductor_relevo: boolean;
      relevo_con_valor: boolean;
      valor_tercero_relevo?: number | null;
    }
  ) =>
    request<Item[]>(`/conciliaciones/${conciliacionId}/liquidacion-contrato-fijo`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  eliminarRegistroLiquidacionContratoFijo: (itemId: number) =>
    request<{ ok: boolean }>(`/conciliaciones/items/${itemId}`, {
      method: "DELETE",
    }),
  manifiestosConciliacion: (
    conciliacionId: number,
    contexto: "CONCILIACION" | "LIQUIDACION_CONTRATO_FIJO" = "CONCILIACION",
    liquidacionContratoFijoId?: number
  ) =>
    request<ConciliacionManifiesto[]>(`/conciliaciones/${conciliacionId}/manifiestos?${new URLSearchParams({
      contexto,
      ...(liquidacionContratoFijoId ? { liquidacion_contrato_fijo_id: String(liquidacionContratoFijoId) } : {}),
    }).toString()}`),
  asociarManifiestoConciliacion: (
    conciliacionId: number,
    manifiesto_numero: string,
    contexto: "CONCILIACION" | "LIQUIDACION_CONTRATO_FIJO" = "CONCILIACION",
    liquidacion_contrato_fijo_id?: number
  ) =>
    request<ConciliacionManifiesto>(`/conciliaciones/${conciliacionId}/manifiestos`, {
      method: "POST",
      body: JSON.stringify({ manifiesto_numero, contexto, liquidacion_contrato_fijo_id }),
    }),
  quitarManifiestoConciliacion: (conciliacionId: number, manifiestoId: number) =>
    request<{ ok: boolean }>(`/conciliaciones/${conciliacionId}/manifiestos/${manifiestoId}`, {
      method: "DELETE",
    }),
  actualizarManifiestoConciliacion: (
    conciliacionId: number,
    manifiestoId: number,
    manifiesto_numero: string
  ) =>
    request<ConciliacionManifiesto>(`/conciliaciones/${conciliacionId}/manifiestos/${manifiestoId}`, {
      method: "PATCH",
      body: JSON.stringify({ manifiesto_numero }),
    }),
  enviarRevisionConciliacion: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/enviar-revision`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  guardarConciliacionBorrador: (conciliacionId: number) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/guardar-borrador`, {
      method: "POST",
    }),
  decidirItemCliente: (
    itemId: number,
    payload: { estado: "APROBADO" | "RECHAZADO"; comentario?: string }
  ) =>
    request<Item>(`/conciliaciones/items/${itemId}/decision-cliente`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  aprobarConciliacionCliente: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/aprobar-cliente`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  devolverConciliacionCliente: (
    conciliacionId: number,
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/devolver-cliente`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  enviarFacturacionConciliacion: (
    conciliacionId: number,
    payload: { destinatario_email?: string; mensaje?: string }
  ) =>
    request<Conciliacion>(`/conciliaciones/${conciliacionId}/enviar-facturacion`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  descargarConciliacionExcel: async (conciliacionId: number): Promise<Blob> => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_URL}/conciliaciones/${conciliacionId}/descargar-excel`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Error en la descarga de conciliacion");
    }
    return response.blob();
  },
  misNotificaciones: (soloNoLeidas = true) =>
    request<Notificacion[]>(`/notificaciones/mis?solo_no_leidas=${soloNoLeidas ? "true" : "false"}`),
  marcarNotificacionLeida: (id: number) =>
    request<Notificacion>(`/notificaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ leida: true }),
    }),
  marcarTodasNotificacionesLeidas: () =>
    request<{ actualizadas: number }>("/notificaciones/leer-todas", {
      method: "POST",
    }),
  destinatariosSugeridos: (
    conciliacionId: number,
    tipo: "cliente_revision" | "respuesta_cliente"
  ) =>
    request<DestinatarioSugerido[]>(
      `/notificaciones/correo/destinatarios-sugeridos/${conciliacionId}?tipo=${tipo}`
    ),
  editarUsuario: (
    id: number,
    payload: {
      nombre?: string;
      email?: string;
      rol?: "COINTRA" | "CLIENTE" | "TERCERO";
      sub_rol?: "COINTRA_ADMIN" | "COINTRA_USER" | null;
      cliente_id?: number | null;
      tercero_id?: number | null;
      operacion_ids?: number[];
    }
  ) =>
    request<User>(`/catalogs/usuarios/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarUsuario: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/usuarios/${id}`, {
      method: "DELETE",
    }),
  reactivarUsuario: (id: number) =>
    request<{ ok: boolean }>(`/catalogs/usuarios/${id}/reactivar`, {
      method: "POST",
    }),
  vehiculos: () => request<Vehiculo[]>("/vehiculos"),
  crearVehiculo: (payload: { placa: string; tipo_vehiculo_id: number; tercero_id: number }) =>
    request<Vehiculo>("/vehiculos", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  patchConciliacionItem: (
    itemId: number,
    payload: {
      placa?: string | null;
      manifiesto_numero?: string | null;
      remesa?: string | null;
      tarifa_tercero?: number | null;
      tarifa_cliente?: number | null;
      rentabilidad?: number | null;
    }
  ) =>
    request<Item>(`/conciliaciones/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  eliminarVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/${id}`, {
      method: "DELETE",
    }),
  reactivarVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/${id}/reactivar`, {
      method: "POST",
    }),
  tiposVehiculo: () => request<TipoVehiculo[]>("/vehiculos/tipos-vehiculo"),
  crearTipoVehiculo: (payload: { nombre: string }) =>
    request<TipoVehiculo>("/vehiculos/tipos-vehiculo", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  eliminarTipoVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/tipos-vehiculo/${id}`, {
      method: "DELETE",
    }),
  reactivarTipoVehiculo: (id: number) =>
    request<{ ok: boolean }>(`/vehiculos/tipos-vehiculo/${id}/reactivar`, {
      method: "POST",
    }),
  consultarAvansat: (manifiesto: string) =>
    request<AvansatLookup>(`/avansat/manifiesto/${encodeURIComponent(manifiesto.trim())}`),
  avansatCache: (params?: {
    manifiesto?: string;
    fecha_emision?: string;
    placa_vehiculo?: string;
    trayler?: string;
    remesa?: string;
    producto?: string;
    ciudad_origen?: string;
    ciudad_destino?: string;
    estado?: "SINCRONIZADO";
    page?: number;
    page_size?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.manifiesto) search.set("manifiesto", params.manifiesto);
    if (params?.fecha_emision) search.set("fecha_emision", params.fecha_emision);
    if (params?.placa_vehiculo) search.set("placa_vehiculo", params.placa_vehiculo);
    if (params?.trayler) search.set("trayler", params.trayler);
    if (params?.remesa) search.set("remesa", params.remesa);
    if (params?.producto) search.set("producto", params.producto);
    if (params?.ciudad_origen) search.set("ciudad_origen", params.ciudad_origen);
    if (params?.ciudad_destino) search.set("ciudad_destino", params.ciudad_destino);
    if (params?.estado) search.set("estado", params.estado);
    if (params?.page) search.set("page", String(params.page));
    if (params?.page_size) search.set("page_size", String(params.page_size));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<AvansatCacheListResult>(`/avansat/cache${suffix}`);
  },
  syncAvansatCache: (daysBack = 60, maxAgeMinutes = 30) =>
    request<AvansatSyncResult>(`/avansat/sync-cache?days_back=${daysBack}&max_age_minutes=${maxAgeMinutes}`, {
      method: "POST",
    }),
  syncAvansatMesAnterior: () =>
    request<AvansatSyncResult>("/avansat/sync-mes-anterior", {
      method: "POST",
    }),
  syncAvansatAyerHoy: () =>
    request<AvansatSyncResult>("/avansat/sync-ayer-hoy", {
      method: "POST",
    }),
  servicios: () => request<Servicio[]>("/servicios"),
  crearServicio: (payload: { nombre: string; requiere_origen_destino?: boolean }) =>
    request<Servicio>("/servicios", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editarServicio: (id: number, payload: { nombre?: string; requiere_origen_destino?: boolean }) =>
    request<Servicio>(`/servicios/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  inactivarServicio: (id: number) =>
    request<{ ok: boolean }>(`/servicios/${id}`, {
      method: "DELETE",
    }),
  reactivarServicio: (id: number) =>
    request<{ ok: boolean }>(`/servicios/${id}/reactivar`, {
      method: "POST",
    }),
  catalogoTarifas: () => request<CatalogoTarifa[]>("/catalogo-tarifas"),
  upsertCatalogoTarifa: (payload: {
    servicio_id: number;
    tipo_vehiculo_id: number;
    tarifa_cliente: number;
    rentabilidad_pct: number;
  }) =>
    request<CatalogoTarifa>("/catalogo-tarifas", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  inactivarCatalogoTarifa: (id: number) =>
    request<{ ok: boolean }>(`/catalogo-tarifas/${id}`, {
      method: "DELETE",
    }),
  reactivarCatalogoTarifa: (id: number) =>
    request<{ ok: boolean }>(`/catalogo-tarifas/${id}/reactivar`, {
      method: "POST",
    }),
  lookupTarifaCatalogo: (servicioId: number, tipoVehiculoId: number) =>
    request<TarifaLookup>(`/catalogo-tarifas/lookup?servicio_id=${servicioId}&tipo_vehiculo_id=${tipoVehiculoId}`),
};
