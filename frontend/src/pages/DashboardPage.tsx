import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { Conciliacion, Item, Operacion, User, Viaje } from "../types";

interface Props {
  user: User;
  operaciones: Operacion[];
  conciliaciones: Conciliacion[];
  onRefreshConciliaciones: () => Promise<void>;
}

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

export function DashboardPage({ user, operaciones, conciliaciones, onRefreshConciliaciones }: Props) {
  const [activeModule, setActiveModule] = useState<"viajes" | "conciliaciones">("viajes");
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [selectedConciliacion, setSelectedConciliacion] = useState<number | null>(null);
  const [pendingViajes, setPendingViajes] = useState<Viaje[]>([]);
  const [selectedViajeIds, setSelectedViajeIds] = useState<number[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  const selected = conciliaciones.find((c) => c.id === selectedConciliacion) || null;

  const totals = useMemo(() => {
    return items.reduce<{ tarifaTercero: number; tarifaCliente: number }>(
      (acc: { tarifaTercero: number; tarifaCliente: number }, item: Item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0 }
    );
  }, [items]);

  async function loadViajes() {
    try {
      const data = await api.viajes(undefined, false);
      setViajes(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadItems(conciliacionId: number) {
    setSelectedConciliacion(conciliacionId);
    setLoadingItems(true);
    setError("");
    try {
      const [itemData, pending] = await Promise.all([
        api.items(conciliacionId),
        api.viajesPendientesConciliacion(conciliacionId),
      ]);
      setItems(itemData);
      setPendingViajes(pending);
      setSelectedViajeIds([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingItems(false);
    }
  }

  async function createConciliacion(formData: FormData) {
    const operacion_id = Number(formData.get("operacion_id"));
    const nombre = String(formData.get("nombre") || "");
    const fecha_inicio = String(formData.get("fecha_inicio") || "");
    const fecha_fin = String(formData.get("fecha_fin") || "");

    await api.crearConciliacion({ operacion_id, nombre, fecha_inicio, fecha_fin });
    await onRefreshConciliaciones();
  }

  async function createViaje(formData: FormData) {
    const payload = {
      operacion_id: Number(formData.get("operacion_id")),
      titulo: String(formData.get("titulo") || ""),
      fecha_servicio: String(formData.get("fecha_servicio")),
      origen: String(formData.get("origen") || ""),
      destino: String(formData.get("destino") || ""),
      placa: String(formData.get("placa") || ""),
      conductor: String(formData.get("conductor") || ""),
      tarifa_tercero: Number(formData.get("tarifa_tercero") || 0),
      tarifa_cliente: Number(formData.get("tarifa_cliente") || 0),
      descripcion: String(formData.get("descripcion") || ""),
      manifiesto_numero: String(formData.get("manifiesto_numero") || ""),
    };

    await api.crearViaje(payload);
    await loadViajes();
  }

  async function attachPendingViajes() {
    if (!selected || selectedViajeIds.length === 0) return;
    await api.adjuntarViajesConciliacion(selected.id, selectedViajeIds);
    await loadItems(selected.id);
  }

  async function createItem(formData: FormData) {
    if (!selected) return;
    const payload = {
      conciliacion_id: selected.id,
      tipo: String(formData.get("tipo")),
      fecha_servicio: String(formData.get("fecha_servicio")),
      origen: String(formData.get("origen") || ""),
      destino: String(formData.get("destino") || ""),
      placa: String(formData.get("placa") || ""),
      conductor: String(formData.get("conductor") || ""),
      tarifa_tercero: Number(formData.get("tarifa_tercero") || 0),
      tarifa_cliente: Number(formData.get("tarifa_cliente") || 0),
      descripcion: String(formData.get("descripcion") || ""),
    };
    await api.crearItem(payload);
    await loadItems(selected.id);
  }

  useEffect(() => {
    if (activeModule === "viajes") {
      void loadViajes();
    }
  }, [activeModule]);

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3 rounded-xl border border-border bg-white/90 p-2 shadow-sm">
        <button
          className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeModule === "viajes"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => {
            setActiveModule("viajes");
            void loadViajes();
          }}
        >
          Modulo Viajes
        </button>
        <button
          className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
            activeModule === "conciliaciones"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => setActiveModule("conciliaciones")}
        >
          Modulo Conciliaciones
        </button>
      </section>

      {activeModule === "viajes" && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Cargar viaje</h3>
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  await createViaje(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Operación
                    </label>
                    <select
                      name="operacion_id"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione...</option>
                      {operaciones.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Título del viaje
                    </label>
                    <input
                      name="titulo"
                      required
                      placeholder="Ej. Urbano Montevideo"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Fecha
                    </label>
                    <input
                      name="fecha_servicio"
                      type="date"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Manifiesto
                    </label>
                    <input
                      name="manifiesto_numero"
                      placeholder="AV-12345"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Origen
                    </label>
                    <input
                      name="origen"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Destino
                    </label>
                    <input
                      name="destino"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Placa
                    </label>
                    <input
                      name="placa"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Conductor (opcional)
                    </label>
                    <input
                      name="conductor"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Tarifa Tercero
                    </label>
                    <input
                      name="tarifa_tercero"
                      type="number"
                      required
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  {user.rol !== "TERCERO" && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Tarifa Cliente (opcional)
                      </label>
                      <input
                        name="tarifa_cliente"
                        type="number"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Descripción
                    </label>
                    <input
                      name="descripcion"
                      placeholder="Observaciones del viaje"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Guardar viaje
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Viajes cargados</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-left">Título</th>
                      <th className="border-b border-border px-3 py-2 text-left">Ruta</th>
                      <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      {user.rol !== "CLIENTE" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Cliente</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {viajes.map((v) => (
                      <tr key={v.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{v.id}</td>
                        <td className="px-3 py-2">{v.fecha_servicio}</td>
                        <td className="px-3 py-2">{v.titulo}</td>
                        <td className="px-3 py-2">
                          {v.origen} - {v.destino}
                        </td>
                        <td className="px-3 py-2">{v.placa}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              v.conciliado
                                ? "bg-success/10 text-success"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {v.conciliado ? "CONCILIADO" : "PENDIENTE"}
                          </span>
                        </td>
                        {user.rol !== "CLIENTE" && (
                          <td className="px-3 py-2">
                            {v.tarifa_tercero ? money.format(v.tarifa_tercero) : "-"}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-3 py-2">
                            {v.tarifa_cliente ? money.format(v.tarifa_cliente) : "-"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {activeModule === "conciliaciones" && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
            {user.rol === "COINTRA" && (
              <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">Nueva conciliación</h3>
                <form
                  onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    await createConciliacion(new FormData(e.currentTarget));
                    e.currentTarget.reset();
                  }}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Operación
                      </label>
                      <select
                        name="operacion_id"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      >
                        <option value="">Seleccione...</option>
                        {operaciones.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Nombre
                      </label>
                      <input
                        name="nombre"
                        required
                        placeholder="Segunda quincena febrero"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Fecha inicio
                      </label>
                      <input
                        name="fecha_inicio"
                        type="date"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Fecha fin
                      </label>
                      <input
                        name="fecha_fin"
                        type="date"
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                  >
                    Crear
                  </button>
                </form>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Conciliaciones</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Periodo</th>
                      <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliaciones.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{c.id}</td>
                        <td className="px-3 py-2">{c.nombre}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {c.estado}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {c.fecha_inicio} - {c.fecha_fin}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => loadItems(c.id)}
                            className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            Ver items
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

      {selected && (
        <section className="space-y-6 rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Viajes pendientes por conciliar</h3>
            <p className="text-xs text-neutral">
              {pendingViajes.length} viajes pendientes en la operación
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-neutral">
              Selecciona los viajes que deseas adjuntar a esta conciliación.
            </span>
            {user.rol === "COINTRA" && (
              <button
                type="button"
                onClick={attachPendingViajes}
                disabled={selectedViajeIds.length === 0}
                className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Adjuntar seleccionados ({selectedViajeIds.length})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left" />
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                  <th className="border-b border-border px-3 py-2 text-left">Ruta</th>
                  <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                </tr>
              </thead>
              <tbody>
                {pendingViajes.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedViajeIds.includes(v.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedViajeIds((prev) => [...prev, v.id]);
                          } else {
                            setSelectedViajeIds((prev) => prev.filter((id) => id !== v.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                      />
                    </td>
                    <td className="px-3 py-2">{v.id}</td>
                    <td className="px-3 py-2">{v.fecha_servicio}</td>
                    <td className="px-3 py-2">
                      {v.origen} - {v.destino}
                    </td>
                    <td className="px-3 py-2">{v.placa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 text-sm font-semibold text-slate-900">
            Items de conciliación #{selected.id}
          </h3>
          <form
            className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              if (user.rol !== "COINTRA") return;
              await createItem(new FormData(e.currentTarget));
              e.currentTarget.reset();
            }}
          >
            <select
              name="tipo"
              defaultValue="VIAJE"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="VIAJE">VIAJE</option>
              <option value="PEAJE">PEAJE</option>
              <option value="HORA_EXTRA">HORA_EXTRA</option>
              <option value="VIAJE_EXTRA">VIAJE_EXTRA</option>
              <option value="ESTIBADA">ESTIBADA</option>
              <option value="CONDUCTOR_RELEVO">CONDUCTOR_RELEVO</option>
              <option value="OTRO">OTRO</option>
            </select>
            <input
              name="fecha_servicio"
              type="date"
              required
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="origen"
              placeholder="Origen"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="destino"
              placeholder="Destino"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="placa"
              placeholder="Placa"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <input
              name="conductor"
              placeholder="Conductor"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {user.rol !== "CLIENTE" && (
              <input
                name="tarifa_tercero"
                type="number"
                placeholder="Tarifa tercero"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            )}
            {user.rol !== "TERCERO" && (
              <input
                name="tarifa_cliente"
                type="number"
                placeholder="Tarifa cliente"
                className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            )}
            <input
              name="descripcion"
              placeholder="Descripcion"
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {user.rol === "COINTRA" && (
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
              >
                Agregar item
              </button>
            )}
          </form>

          {loadingItems ? (
            <p className="text-sm text-neutral">Cargando items...</p>
          ) : (
            <>
              {error && <p className="text-sm font-medium text-danger">{error}</p>}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Tipo</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-left">Origen</th>
                      <th className="border-b border-border px-3 py-2 text-left">Destino</th>
                      {user.rol !== "CLIENTE" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Cliente</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Rentabilidad %</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{item.id}</td>
                        <td className="px-3 py-2">{item.tipo}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {item.estado}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.fecha_servicio}</td>
                        <td className="px-3 py-2">{item.origen || "-"}</td>
                        <td className="px-3 py-2">{item.destino || "-"}</td>
                        {user.rol !== "CLIENTE" && (
                          <td className="px-3 py-2">
                            {item.tarifa_tercero ? money.format(item.tarifa_tercero) : "-"}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-3 py-2">
                            {item.tarifa_cliente ? money.format(item.tarifa_cliente) : "-"}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">{item.rentabilidad ?? "-"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-900">
                {user.rol !== "CLIENTE" && (
                  <span>Total Tercero: {money.format(totals.tarifaTercero)}</span>
                )}
                {user.rol !== "TERCERO" && (
                  <span>Total Cliente: {money.format(totals.tarifaCliente)}</span>
                )}
              </div>
            </>
          )}
        </section>
      )}
      </>
      )}
    </div>
  );
}
