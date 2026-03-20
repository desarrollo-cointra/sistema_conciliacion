import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { Tercero, TipoVehiculo, User, Vehiculo } from "../types";

interface Props {
  user: User;
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  if (!message) return "Ocurrio un error inesperado";

  try {
    const parsed = JSON.parse(message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // No-op: si no es JSON, usamos el mensaje plano
  }

  return message;
}

export function VehiculosPage({ user }: Props) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vehiculoForm, setVehiculoForm] = useState({
    placa: "",
    tipo_vehiculo_id: "",
    tercero_id: "",
  });
  const [tipoNombre, setTipoNombre] = useState("");
  const [confirmModal, setConfirmModal] = useState<
    | { type: "inactivarVehiculo" | "reactivarVehiculo"; id: number }
    | { type: "inactivarTipo" | "reactivarTipo"; id: number }
    | null
  >(null);

  const isCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const tiposActivos = useMemo(() => tipos.filter((t) => t.activo), [tipos]);
  const tercerosDisponibles = useMemo(() => {
    if (user.rol === "TERCERO" && user.tercero_id) {
      return terceros.filter((t) => t.id === user.tercero_id);
    }
    return terceros;
  }, [terceros, user.rol, user.tercero_id]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [vs, ts, ters] = await Promise.all([api.vehiculos(), api.tiposVehiculo(), api.terceros()]);
      setVehiculos(vs);
      setTipos(ts);
      setTerceros(ters.filter((t) => t.activo));
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!vehiculoForm.tercero_id && tercerosDisponibles.length === 1) {
      setVehiculoForm((prev) => ({ ...prev, tercero_id: String(tercerosDisponibles[0].id) }));
    }
  }, [tercerosDisponibles, vehiculoForm.tercero_id]);

  async function handleCreateVehiculo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const placa = vehiculoForm.placa.trim().toUpperCase();
    const tipo_vehiculo_id = Number(vehiculoForm.tipo_vehiculo_id);
    const tercero_id = Number(vehiculoForm.tercero_id);

    if (!placa || !tipo_vehiculo_id || !tercero_id) {
      setError("Debes diligenciar placa, tipo de vehiculo y tercero propietario");
      return;
    }

    try {
      await api.crearVehiculo({ placa, tipo_vehiculo_id, tercero_id });
      setVehiculoForm({ placa: "", tipo_vehiculo_id: "", tercero_id: "" });
      await loadData();
    } catch (err) {
      setError(toSpanishError(err));
    }
  }

  async function handleCreateTipo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const nombre = tipoNombre.trim();
    if (!nombre) return;
    try {
      await api.crearTipoVehiculo({ nombre });
      setTipoNombre("");
      await loadData();
    } catch (err) {
      setError(toSpanishError(err));
    }
  }

  async function onConfirmAction() {
    if (!confirmModal || !isCointraAdmin) return;
    if (confirmModal.type === "inactivarVehiculo") {
      await api.eliminarVehiculo(confirmModal.id);
    } else if (confirmModal.type === "reactivarVehiculo") {
      await api.reactivarVehiculo(confirmModal.id);
    } else if (confirmModal.type === "inactivarTipo") {
      await api.eliminarTipoVehiculo(confirmModal.id);
    } else {
      await api.reactivarTipoVehiculo(confirmModal.id);
    }
    setConfirmModal(null);
    await loadData();
  }

  const tipoNombreById = new Map(tipos.map((t) => [t.id, t.nombre]));
  const terceroNombreById = new Map(terceros.map((t) => [t.id, t.nombre]));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Gestión de vehículos</h2>
        <p className="mb-4 text-sm text-neutral">
          Registra las placas y tipos de vehículo para utilizarlos al cargar viajes.
        </p>

        <form
          onSubmit={handleCreateVehiculo}
          className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr,1fr,1.2fr,auto]"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Placa
            </label>
            <input
              name="placa"
              required
              value={vehiculoForm.placa}
              onChange={(e) => setVehiculoForm((prev) => ({ ...prev, placa: e.target.value }))}
              placeholder="ABC123"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Tipo de vehículo
            </label>
            <select
              name="tipo_vehiculo_id"
              required
              value={vehiculoForm.tipo_vehiculo_id}
              onChange={(e) =>
                setVehiculoForm((prev) => ({ ...prev, tipo_vehiculo_id: e.target.value }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Seleccione...</option>
              {tiposActivos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
              Tercero propietario
            </label>
            <select
              name="tercero_id"
              required
              value={vehiculoForm.tercero_id}
              onChange={(e) =>
                setVehiculoForm((prev) => ({ ...prev, tercero_id: e.target.value }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="">Seleccione...</option>
              {tercerosDisponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Registrar vehículo
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Vehículos registrados</h3>
        {!!error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
        {loading ? (
          <p className="text-sm text-neutral">Cargando vehículos...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                  <th className="border-b border-border px-3 py-2 text-left">Tipo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Propietario</th>
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  {isCointraAdmin && (
                    <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{v.placa}</td>
                    <td className="px-3 py-2">{tipoNombreById.get(v.tipo_vehiculo_id) || "-"}</td>
                    <td className="px-3 py-2">{(v.tercero_id ? terceroNombreById.get(v.tercero_id) : null) || v.propietario || "-"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {v.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    {isCointraAdmin && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmModal({
                              type: v.activo ? "inactivarVehiculo" : "reactivarVehiculo",
                              id: v.id,
                            })
                          }
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${
                            v.activo
                              ? "border-border bg-white text-slate-700 hover:bg-slate-50"
                              : "border-success/40 bg-success/10 text-success hover:bg-success/20"
                          }`}
                        >
                          {v.activo ? "Inactivar" : "Reactivar"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {isCointraAdmin && (
        <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Tipos de vehículo</h3>
          <p className="mb-4 text-xs text-neutral">
            Solo visible para Cointra Admin. Gestiona los tipos disponibles al registrar vehículos.
          </p>
          <form
            onSubmit={(e) => void handleCreateTipo(e)}
            className="mb-4 flex items-end gap-3"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                Nombre del tipo
              </label>
              <input
                name="nombre"
                required
                value={tipoNombre}
                onChange={(e) => setTipoNombre(e.target.value)}
                placeholder="Ej. Tractomula"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Agregar tipo
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{t.id}</td>
                    <td className="px-3 py-2">{t.nombre}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          t.activo ? "bg-success/10 text-success" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            type: t.activo ? "inactivarTipo" : "reactivarTipo",
                            id: t.id,
                          })
                        }
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${
                          t.activo
                            ? "border-danger/40 bg-danger/5 text-danger hover:bg-danger/10"
                            : "border-success/40 bg-success/10 text-success hover:bg-success/20"
                        }`}
                      >
                        {t.activo ? "Inactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal?.type === "inactivarVehiculo"
            ? `¿Inactivar vehículo #${confirmModal.id}?`
            : confirmModal?.type === "reactivarVehiculo"
              ? `¿Reactivar vehículo #${confirmModal.id}?`
              : confirmModal?.type === "inactivarTipo"
                ? `¿Inactivar tipo de vehículo #${confirmModal.id}?`
                : `¿Reactivar tipo de vehículo #${confirmModal?.id}?`
        }
        description="Esta acción quedará registrada en el sistema."
        confirmText={
          confirmModal?.type === "inactivarVehiculo" || confirmModal?.type === "inactivarTipo"
            ? "Inactivar"
            : "Reactivar"
        }
        confirmTone={
          confirmModal?.type === "inactivarVehiculo" || confirmModal?.type === "inactivarTipo"
            ? "danger"
            : "success"
        }
        onClose={() => setConfirmModal(null)}
        onConfirm={onConfirmAction}
      />
    </div>
  );
}

