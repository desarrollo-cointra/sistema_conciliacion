import { FormEvent, useEffect, useMemo, useState } from "react";

import { ActionModal } from "../components/common/ActionModal";
import { api } from "../services/api";
import type { Cliente, Operacion, Tercero, User } from "../types";

interface Props {
  user: User;
}

export function UsuariosPage({ user }: Props) {
  const soloCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rolSeleccionado, setRolSeleccionado] = useState<User["rol"]>("CLIENTE");
  const [createClienteId, setCreateClienteId] = useState<number | null>(null);
  const [createOperacionIds, setCreateOperacionIds] = useState<number[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [editModal, setEditModal] = useState<{
    id: number;
    nombre: string;
    email: string;
    rol: User["rol"];
    cliente_id?: number | null;
    operacion_ids: number[];
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ id: number; action: "inactivar" | "reactivar" } | null>(null);
  const clientesActivos = useMemo(() => clientes.filter((c) => c.activo), [clientes]);
  const tercerosActivos = useMemo(() => terceros.filter((t) => t.activo), [terceros]);

  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const terceroById = useMemo(() => new Map(terceros.map((t) => [t.id, t])), [terceros]);
  const operacionesByCliente = useMemo(() => {
    const grouped = new Map<number, Operacion[]>();
    for (const op of operaciones) {
      const rows = grouped.get(op.cliente_id) ?? [];
      rows.push(op);
      grouped.set(op.cliente_id, rows);
    }
    return grouped;
  }, [operaciones]);

  async function loadData() {
    try {
      const [us, cs, ts, ops] = await Promise.all([api.usuarios(), api.clientes(), api.terceros(), api.operaciones()]);
      setUsuarios(us);
      setClientes(cs);
      setTerceros(ts);
      setOperaciones(ops);
      setError("");
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar usuarios");
    }
  }

  useEffect(() => {
    if (soloCointraAdmin) {
      void loadData();
    }
  }, [soloCointraAdmin]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const rol = String(form.get("rol") || "CLIENTE") as User["rol"];
    setError("");
    setSuccess("");

    try {
      await api.crearUsuario({
        nombre: String(form.get("nombre") || "").trim(),
        email: String(form.get("email") || "").trim(),
        password: String(form.get("password") || "").trim(),
        rol,
        sub_rol: rol === "COINTRA" ? (String(form.get("sub_rol") || "COINTRA_USER") as "COINTRA_ADMIN" | "COINTRA_USER") : null,
        cliente_id: rol === "CLIENTE" ? Number(form.get("cliente_id")) : null,
        tercero_id: rol === "TERCERO" ? Number(form.get("tercero_id")) : null,
        operacion_ids: rol === "CLIENTE" ? createOperacionIds : [],
      });
      formEl.reset();
      setRolSeleccionado("CLIENTE");
      setCreateClienteId(null);
      setCreateOperacionIds([]);
      setShowPassword(false);
      await loadData();
      setSuccess("Usuario creado exitosamente.");
    } catch (err) {
      setSuccess("");
      setError((err as Error).message || "No se pudo crear el usuario");
    }
  }

  async function onEditConfirm() {
    if (!editModal) return;
    setError("");
    setSuccess("");
    try {
      await api.editarUsuario(editModal.id, {
        nombre: editModal.nombre.trim(),
        email: editModal.email.trim(),
        operacion_ids: editModal.rol === "CLIENTE" ? editModal.operacion_ids : undefined,
      });
      await loadData();
      setSuccess("Usuario actualizado exitosamente.");
      setEditModal(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo actualizar el usuario");
    }
  }

  async function onConfirmAction() {
    if (!confirmModal) return;
    setError("");
    setSuccess("");
    try {
      if (confirmModal.action === "inactivar") {
        await api.inactivarUsuario(confirmModal.id);
        setSuccess("Usuario inactivado exitosamente.");
      } else {
        await api.reactivarUsuario(confirmModal.id);
        setSuccess("Usuario reactivado exitosamente.");
      }
      await loadData();
      setConfirmModal(null);
    } catch (err) {
      setError(
        (err as Error).message ||
          (confirmModal.action === "inactivar"
            ? "No se pudo inactivar el usuario"
            : "No se pudo reactivar el usuario")
      );
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Usuarios</h2>
      {!soloCointraAdmin ? (
        <p className="text-sm text-danger">
          Solo los usuarios COINTRA_ADMIN pueden acceder a esta sección.
        </p>
      ) : (
        <>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          {success && <p className="text-sm font-medium text-success">{success}</p>}

          <form className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-slate-50/70 p-4 md:grid-cols-2" onSubmit={onCreate}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Nombre</label>
              <input name="nombre" required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Email</label>
              <input name="email" type="email" required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Password inicial</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 pr-12 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Rol</label>
              <select
                name="rol"
                value={rolSeleccionado}
                onChange={(e) => {
                  const nextRole = e.target.value as User["rol"];
                  setRolSeleccionado(nextRole);
                  if (nextRole !== "CLIENTE") {
                    setCreateClienteId(null);
                    setCreateOperacionIds([]);
                  }
                }}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="CLIENTE">CLIENTE</option>
                <option value="TERCERO">TERCERO</option>
                <option value="COINTRA">COINTRA</option>
              </select>
            </div>

            {rolSeleccionado === "COINTRA" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Subrol Cointra</label>
                <select
                  name="sub_rol"
                  defaultValue="COINTRA_USER"
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="COINTRA_USER">COINTRA_USER</option>
                  <option value="COINTRA_ADMIN">COINTRA_ADMIN</option>
                </select>
              </div>
            )}

            {rolSeleccionado === "CLIENTE" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Cliente asociado</label>
                <select
                  name="cliente_id"
                  required
                  value={createClienteId ? String(createClienteId) : ""}
                  onChange={(e) => {
                    const nextClienteId = Number(e.target.value);
                    if (nextClienteId > 0) {
                      setCreateClienteId(nextClienteId);
                    } else {
                      setCreateClienteId(null);
                    }
                    setCreateOperacionIds([]);
                  }}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Seleccione...</option>
                  {clientesActivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <label className="mt-3 mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Operaciones asignadas</label>
                <select
                  multiple
                  value={createOperacionIds.map(String)}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                    setCreateOperacionIds(values);
                  }}
                  disabled={!createClienteId}
                  className="h-28 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100"
                >
                  {(operacionesByCliente.get(createClienteId ?? -1) ?? []).map((op) => (
                    <option key={op.id} value={op.id}>{op.nombre}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-neutral">
                  Puedes seleccionar una o varias operaciones para este usuario cliente.
                </p>
              </div>
            )}

            {rolSeleccionado === "TERCERO" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Tercero asociado</label>
                <select
                  name="tercero_id"
                  required
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Seleccione...</option>
                  {tercerosActivos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90">
                Crear usuario
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                  <th className="border-b border-border px-3 py-2 text-left">ID</th>
                  <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                  <th className="border-b border-border px-3 py-2 text-left">Email</th>
                  <th className="border-b border-border px-3 py-2 text-left">Rol</th>
                  <th className="border-b border-border px-3 py-2 text-left">Asociación</th>
                  <th className="border-b border-border px-3 py-2 text-left">Activo</th>
                  <th className="border-b border-border px-3 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{u.id}</td>
                    <td className="px-3 py-2">{u.nombre}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{u.sub_rol ? `${u.rol} (${u.sub_rol})` : u.rol}</td>
                    <td className="px-3 py-2">
                      {u.rol === "CLIENTE"
                        ? (clienteById.get(u.cliente_id ?? -1)?.nombre ?? "-")
                        : u.rol === "TERCERO"
                          ? (terceroById.get(u.tercero_id ?? -1)?.nombre ?? "-")
                          : "-"}
                    </td>
                    <td className="px-3 py-2">{u.activo ? "Sí" : "No"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditModal({
                              id: u.id,
                              nombre: u.nombre,
                              email: u.email,
                              rol: u.rol,
                              cliente_id: u.cliente_id,
                              operacion_ids: u.operacion_ids ?? [],
                            })
                          }
                          className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        {u.activo && (
                          <button
                            type="button"
                            onClick={() => setConfirmModal({ id: u.id, action: "inactivar" })}
                            className="rounded-full border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                          >
                            Inactivar
                          </button>
                        )}
                        {!u.activo && (
                          <button
                            type="button"
                            onClick={() => setConfirmModal({ id: u.id, action: "reactivar" })}
                            className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ActionModal
        open={!!editModal}
        title={editModal ? `Editar usuario #${editModal.id}` : "Editar usuario"}
        confirmText="Guardar cambios"
        onClose={() => setEditModal(null)}
        onConfirm={onEditConfirm}
      >
        <input
          value={editModal?.nombre ?? ""}
          onChange={(e) =>
            setEditModal((prev) => (prev ? { ...prev, nombre: e.target.value } : prev))
          }
          placeholder="Nombre"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={editModal?.email ?? ""}
          onChange={(e) =>
            setEditModal((prev) => (prev ? { ...prev, email: e.target.value } : prev))
          }
          placeholder="Email"
          type="email"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        {editModal?.rol === "CLIENTE" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Operaciones asignadas</p>
            <select
              multiple
              value={editModal.operacion_ids.map(String)}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                setEditModal((prev) => (prev ? { ...prev, operacion_ids: values } : prev));
              }}
              className="h-28 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              {(operacionesByCliente.get(editModal.cliente_id ?? -1) ?? []).map((op) => (
                <option key={op.id} value={op.id}>{op.nombre}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral">
              Puedes seleccionar múltiples operaciones para este usuario cliente.
            </p>
          </>
        )}
      </ActionModal>

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal?.action === "inactivar"
            ? `¿Inactivar usuario #${confirmModal.id}?`
            : `¿Reactivar usuario #${confirmModal?.id}?`
        }
        description="Esta acción quedará registrada en el sistema."
        confirmText={confirmModal?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        confirmTone={confirmModal?.action === "inactivar" ? "danger" : "success"}
        onClose={() => setConfirmModal(null)}
        onConfirm={onConfirmAction}
      />
    </div>
  );
}

