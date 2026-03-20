import { FormEvent, useEffect, useState } from "react";
import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { Servicio, User } from "../types";

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
    // Mensaje plano
  }
  return message;
}

function toCodigo(nombre: string): string {
  // Replicate backend's _to_codigo logic
  const normalized = nombre.normalize("NFKD");
  const ascii = normalized
    .split("")
    .map((c) => (c.charCodeAt(0) < 128 ? c : ""))
    .join("");
  return ascii.replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase();
}

export function ServiciosPage({ user }: Props) {
  const [rows, setRows] = useState<Servicio[]>([]);
  const [nombre, setNombre] = useState("");
  const [requiereOrigenDestino, setRequiereOrigenDestino] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; action: "inactivar" | "reactivar" } | null>(null);

  const isCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const codigoGenerado = toCodigo(nombre);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      setRows(await api.servicios());
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return;
    try {
      await api.crearServicio({
        nombre: nombre.trim(),
        requiere_origen_destino: requiereOrigenDestino,
      });
      setNombre("");
      setRequiereOrigenDestino(false);
      await loadData();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function onConfirmAction() {
    if (!confirm) return;
    setError("");
    try {
      if (confirm.action === "inactivar") {
        await api.inactivarServicio(confirm.id);
      } else {
        await api.reactivarServicio(confirm.id);
      }
      setConfirm(null);
      await loadData();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  if (!isCointraAdmin) {
    return (
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm text-danger">No tienes permisos para ver este modulo.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Modulo Servicios</h2>
        <p className="mb-4 text-sm text-neutral">
          Crea y administra los tipos de servicio que estaran disponibles en Viajes/Adicionales.
        </p>
        <form onSubmit={onCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr,auto]">
            <input
              name="nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Hora extra"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Crear servicio
            </button>
          </div>
          {nombre.trim() && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-neutral">
              Código: <span className="font-mono font-semibold">{codigoGenerado}</span>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={requiereOrigenDestino}
              onChange={(e) => setRequiereOrigenDestino(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Este servicio requiere origen y destino en el formulario de viajes/adicionales.
          </label>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Servicios configurados</h3>
        {loading ? (
          <p className="text-sm text-neutral">Cargando servicios...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                  <th className="border-b border-border px-3 py-2 text-left">Codigo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Requiere origen/destino</th>
                  <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                  <th className="border-b border-border px-3 py-2 text-left">Accion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{row.id}</td>
                    <td className="px-3 py-2">{row.nombre}</td>
                    <td className="px-3 py-2">{row.codigo}</td>
                    <td className="px-3 py-2">{row.requiere_origen_destino ? "Sí" : "No"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.activo ? "bg-success/10 text-success" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({ id: row.id, action: row.activo ? "inactivar" : "reactivar" })
                        }
                        className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        {row.activo ? "Inactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      </section>

      <ActionModal
        open={!!confirm}
        title={confirm?.action === "inactivar" ? "Inactivar servicio" : "Reactivar servicio"}
        description={
          confirm?.action === "inactivar"
            ? "El servicio no aparecera en nuevos formularios."
            : "El servicio volvera a estar disponible en formularios."
        }
        confirmText={confirm?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void onConfirmAction()}
      />
    </div>
  );
}
