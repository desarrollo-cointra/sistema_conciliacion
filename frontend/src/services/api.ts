import { Conciliacion, Item, LoginResponse, Operacion, User, Viaje } from "../types";

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
  operaciones: () => request<Operacion[]>("/catalogs/operaciones"),
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
    titulo: string;
    fecha_servicio: string;
    origen: string;
    destino: string;
    placa: string;
    conductor?: string;
    tarifa_tercero: number;
    tarifa_cliente?: number;
    manifiesto_avansat_id?: string;
    manifiesto_numero?: string;
    descripcion?: string;
  }) =>
    request<Viaje>("/viajes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  viajesPendientesConciliacion: (conciliacionId: number) =>
    request<Viaje[]>(`/conciliaciones/${conciliacionId}/viajes-pendientes`),
  adjuntarViajesConciliacion: (conciliacionId: number, viajeIds: number[]) =>
    request<Item[]>(`/conciliaciones/${conciliacionId}/adjuntar-viajes`, {
      method: "POST",
      body: JSON.stringify({ viaje_ids: viajeIds }),
    }),
};
