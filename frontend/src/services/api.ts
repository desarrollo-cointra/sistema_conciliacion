import { AuthMessage, AvansatCacheListResult, AvansatCacheStats, AvansatLookup, AvansatSyncResult, CatalogoTarifa, Cliente, Conciliacion, DashboardIndicators, DestinatarioSugerido, Item, LoginResponse, Notificacion, Operacion, Servicio, TarifaLookup, Tercero, TipoVehiculo, User, Vehiculo, Viaje } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  config: { skipUnauthorizedHandler?: boolean } = {}
): Promise<T> {
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
    const raw = await response.text();
    if (response.status === 401 && !config.skipUnauthorizedHandler && unauthorizedHandler) {
      unauthorizedHandler();
    }
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.detail === "string") {
        message = parsed.detail;
      }
    } catch {
      // fallback to raw text
    }
    throw new Error(message || "Error en la solicitud");
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, { skipUnauthorizedHandler: true }),
  me: () => request<User>("/auth/me"),
  changePassword: (payload: { current_password: string; new_password: string; confirm_password: string }) =>
    request<AuthMessage>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  forgotPassword: (email: string) =>
    request<AuthMessage>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, { skipUnauthorizedHandler: true }),
  resetPassword: (payload: { token: string; new_password: string; confirm_password: string }) =>
    request<AuthMessage>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { skipUnauthorizedHandler: true }),
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
    payload: { observacion?: string; destinatario_email?: string; mensaje?: string; po_numero?: string }
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
  enviarFacturaClienteConciliacion: async (
    conciliacionId: number,
    payload: {
      destinatario_email?: string;
      mensaje?: string;
      archivo_factura: File;
    }
  ) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    if (payload.destinatario_email) form.append("destinatario_email", payload.destinatario_email);
    if (payload.mensaje) form.append("mensaje", payload.mensaje);
    form.append("archivo_factura", payload.archivo_factura);

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_URL}/conciliaciones/${conciliacionId}/enviar-factura-cliente`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!response.ok) {
      const raw = await response.text();
      if (response.status === 401 && unauthorizedHandler) {
        unauthorizedHandler();
      }
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.detail === "string") {
          message = parsed.detail;
        }
      } catch {
        // fallback to raw text
      }
      throw new Error(message || "Error al enviar factura al cliente");
    }
    return response.json() as Promise<Conciliacion>;
  },
  descargarConciliacionExcel: async (conciliacionId: number): Promise<Blob> => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_URL}/conciliaciones/${conciliacionId}/descargar-excel`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const raw = await response.text();
      if (response.status === 401 && unauthorizedHandler) {
        unauthorizedHandler();
      }
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.detail === "string") {
          message = parsed.detail;
        }
      } catch {
        // fallback to raw text
      }
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
      fecha_servicio?: string | null;
      origen?: string | null;
      destino?: string | null;
      placa?: string | null;
      conductor?: string | null;
      manifiesto_numero?: string | null;
      remesa?: string | null;
      tarifa_tercero?: number | null;
      tarifa_cliente?: number | null;
      rentabilidad?: number | null;
      descripcion?: string | null;
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
     conciliacion_id?: number;     has_conciliacion?: boolean;     page?: number;
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
    if (typeof params?.conciliacion_id === "number") search.set("conciliacion_id", String(params.conciliacion_id));
    if (typeof params?.has_conciliacion === "boolean") search.set("has_conciliacion", String(params.has_conciliacion));
    if (params?.page) search.set("page", String(params.page));
    if (params?.page_size) search.set("page_size", String(params.page_size));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<AvansatCacheListResult>(`/avansat/cache${suffix}`);
  },
  avansatCacheStats: () => request<AvansatCacheStats>("/avansat/cache-stats"),
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
  dashboardIndicadores: (params?: {
    mode?: "current_month" | "year_to_date" | "month_year";
    year?: number;
    month?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.mode) search.set("mode", params.mode);
    if (typeof params?.year === "number") search.set("year", String(params.year));
    if (typeof params?.month === "number") search.set("month", String(params.month));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<DashboardIndicators>(`/dashboard/indicadores${suffix}`);
  },
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
  editarCatalogoTarifa: (
    id: number,
    payload: {
      servicio_id?: number;
      tipo_vehiculo_id?: number;
      tarifa_cliente?: number;
      rentabilidad_pct?: number;
      activo?: boolean;
    }
  ) =>
    request<CatalogoTarifa>(`/catalogo-tarifas/${id}`, {
      method: "PATCH",
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
