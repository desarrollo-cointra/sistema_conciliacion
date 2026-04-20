import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../services/api";
import { AvansatCacheRow, AvansatCacheStats, User } from "../types";

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
    // Mensaje ya plano
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "No fue posible conectar con el servidor";
  }
  return message;
}

export function AvansatPage({ user }: Props) {
  const [rows, setRows] = useState<AvansatCacheRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [filters, setFilters] = useState({
    estado: "",
    manifiesto: "",
    conciliacion_id: "",
    has_conciliacion: "",
    fecha_emision: "",
    placa_vehiculo: "",
    trayler: "",
    remesa: "",
    producto: "",
    ciudad_origen: "",
    ciudad_destino: "",
  });
  const [loading, setLoading] = useState(false);
  const [syncingMesAnterior, setSyncingMesAnterior] = useState(false);
  const [syncingAyerHoy, setSyncingAyerHoy] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [cacheStats, setCacheStats] = useState<AvansatCacheStats | null>(null);

  async function loadCache(nextPage = page, overrideFilters?: typeof filters) {
    setError("");
    setLoading(true);
    try {
      const activeFilters = overrideFilters ?? filters;
      const hasConciliacionParam =
        activeFilters.has_conciliacion === "si" ? true
        : activeFilters.has_conciliacion === "no" ? false
        : undefined;
      const data = await api.avansatCache({
        ...activeFilters,
        conciliacion_id: activeFilters.conciliacion_id ? Number(activeFilters.conciliacion_id) : undefined,
        estado: (activeFilters.estado as "SINCRONIZADO" | "") || undefined,
        has_conciliacion: hasConciliacionParam,
        page: nextPage,
        page_size: pageSize,
      });
      setRows(data.rows);
      setTotalRows(data.total);
      setPage(data.page);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCache(1);
    api.avansatCacheStats().then(setCacheStats).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCache(1);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function runSyncMesAnterior() {
    setSyncMessage("");
    setError("");
    setSyncingMesAnterior(true);
    try {
      const result = await api.syncAvansatMesAnterior();
      setSyncMessage(
        `Sincronizacion completada (${result.start_date} a ${result.end_date}). Recibidos: ${result.total}, nuevos: ${result.inserted}, ya existentes: ${result.skipped}.`
      );
      await loadCache(1);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSyncingMesAnterior(false);
    }
  }

  async function runSyncAyerHoy() {
    setSyncMessage("");
    setError("");
    setSyncingAyerHoy(true);
    try {
      const result = await api.syncAvansatAyerHoy();
      setSyncMessage(
        `Sincronizacion completada (${result.start_date} a ${result.end_date}). Recibidos: ${result.total}, nuevos: ${result.inserted}, ya existentes: ${result.skipped}.`
      );
      await loadCache(1);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setSyncingAyerHoy(false);
    }
  }

  function formatColombiaDateTime(value: string | null): string {
    if (!value) return "-";
    const normalized = value.endsWith("Z") ? value : `${value}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function clearFilters() {
    const emptyFilters = {
      estado: "",
      manifiesto: "",
      conciliacion_id: "",
      has_conciliacion: "",
      fecha_emision: "",
      placa_vehiculo: "",
      trayler: "",
      remesa: "",
      producto: "",
      ciudad_origen: "",
      ciudad_destino: "",
    };
    setFilters(emptyFilters);
    setPage(1);
    void loadCache(1, emptyFilters);
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  function getVisiblePages(): number[] {
    const maxLinks = 6;
    if (totalPages <= maxLinks) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    const half = Math.floor(maxLinks / 2);
    let start = Math.max(1, page - half);
    let end = start + maxLinks - 1;

    if (end > totalPages) {
      end = totalPages;
      start = end - maxLinks + 1;
    }

    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }

  function renderPaginationControls() {
    const visiblePages = getVisiblePages();
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => void loadCache(page - 1)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Anterior
          </button>

          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => void loadCache(1)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Inicio
          </button>

          {visiblePages.map((num) => (
            <button
              key={num}
              type="button"
              disabled={loading || num === page}
              onClick={() => void loadCache(num)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                num === page
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-slate-700 enabled:hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => void loadCache(totalPages)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fin
          </button>

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => void loadCache(page + 1)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Siguiente
          </button>
        </div>

        <span className="text-xs text-neutral">Pagina {page} de {totalPages} · Total: {totalRows} registros</span>
      </div>
    );
  }

  if (user.rol !== "COINTRA") {
    return (
      <section className="rounded-xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-sm font-semibold text-danger">No tienes permisos para este modulo.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Avansat</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Consulta Avansat (cache interna)</h2>
        <p className="mt-2 text-sm text-neutral">
          Esta tabla muestra la informacion guardada en la tabla manifiestos_avansat de la base de datos.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {user.sub_rol === "COINTRA_ADMIN" && (
            <button
              type="button"
              onClick={() => void runSyncMesAnterior()}
              disabled={syncingMesAnterior || syncingAyerHoy}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {syncingMesAnterior ? "Sincronizando..." : "Sincronizar desde el mes anterior..."}
            </button>
          )}
          <button
            type="button"
            onClick={() => void runSyncAyerHoy()}
            disabled={syncingMesAnterior || syncingAyerHoy}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {syncingAyerHoy ? "Sincronizando..." : "Sincronizar ayer y hoy..."}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Borrar filtros
          </button>
          <button
            type="button"
            onClick={() => void loadCache()}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Recargar
          </button>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        {syncMessage && <p className="mt-3 text-sm font-medium text-emerald-700">{syncMessage}</p>}
      </section>

      <section className="rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">Manifiestos almacenados</h3>
          <span className="text-xs font-semibold text-neutral">Mostrando {rows.length} de {totalRows}</span>
        </div>

        <div className="mb-3">
          {renderPaginationControls()}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1160px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                <th className="border-b border-border px-3 py-2 text-left">Manifiesto</th>
                <th className="border-b border-border px-3 py-2 text-left">Conciliacion</th>
                <th className="border-b border-border px-3 py-2 text-left">Fecha Emision</th>
                <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                <th className="border-b border-border px-3 py-2 text-left">Trayler</th>
                <th className="border-b border-border px-3 py-2 text-left">Remesa</th>
                <th className="border-b border-border px-3 py-2 text-left">Producto</th>
                <th className="border-b border-border px-3 py-2 text-left">Ciudad Origen</th>
                <th className="border-b border-border px-3 py-2 text-left">Ciudad Destino</th>
                <th className="border-b border-border px-3 py-2 text-left">Ultima sync</th>
              </tr>
              <tr className="bg-white">
                <th className="border-b border-border px-2 py-2"><input value={filters.manifiesto} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, manifiesto: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><select value={filters.has_conciliacion} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, has_conciliacion: e.target.value })); }} className="w-full rounded border border-border px-1 py-1 text-xs"><option value="">Todas</option><option value="si">Con conciliacion</option><option value="no">Sin conciliacion</option></select></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.fecha_emision} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, fecha_emision: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.placa_vehiculo} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, placa_vehiculo: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.trayler} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, trayler: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.remesa} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, remesa: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.producto} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, producto: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.ciudad_origen} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, ciudad_origen: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-2 py-2"><input value={filters.ciudad_destino} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, ciudad_destino: e.target.value })); }} className="w-full rounded border border-border px-2 py-1 text-xs" /></th>
                <th className="border-b border-border px-3 py-2 text-xs text-neutral">-</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((row) => (
                <tr key={row.manifiesto_numero} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.manifiesto_numero}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.conciliacion_id ? (
                      <Link
                        to={`/conciliaciones?open_conciliacion_id=${row.conciliacion_id}`}
                        className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        #{row.conciliacion_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.fecha_emision || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.placa_vehiculo || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.trayler || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.remesa || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.producto || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.ciudad_origen || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.ciudad_destino || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{formatColombiaDateTime(row.created_at)}</td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-neutral">Cargando datos de cache...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-neutral">No hay manifiestos para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {cacheStats !== null && (
          <p className="mt-3 text-xs font-semibold text-neutral">
            Manifiestos con conciliacion asociada: <span className="text-slate-800">{cacheStats.total_con_conciliacion}</span> de {cacheStats.total_cached} en cache
          </p>
        )}

        <div className="mt-4">
          {renderPaginationControls()}
        </div>
      </section>
    </div>
  );
}
