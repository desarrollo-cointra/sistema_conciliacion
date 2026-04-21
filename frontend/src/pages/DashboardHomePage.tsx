import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import type { DashboardIndicators, DashboardLabelValue, DashboardPlacaDesglose, User } from "../types";
import { formatCOP } from "../utils/formatters";

interface Props {
  user: User;
}

export function DashboardHomePage({ user }: Props) {
  const navigate = useNavigate();
  const today = new Date();
  const [mode, setMode] = useState<"current_month" | "year_to_date" | "month_year">("current_month");
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardIndicators | null>(null);

  const yearOptions = useMemo(() => {
    const base = today.getFullYear();
    return Array.from({ length: 6 }, (_, idx) => base - idx);
  }, [today]);

  const monthOptions = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  async function loadIndicators() {
    setLoading(true);
    setError("");
    try {
      const result = await api.dashboardIndicadores({
        mode,
        year: mode === "month_year" || mode === "year_to_date" ? year : undefined,
        month: mode === "month_year" ? month : undefined,
      });
      setData(result);
    } catch (e) {
      setError((e as Error)?.message || "No fue posible cargar los indicadores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, month, year]);

  const isCointra = user.rol === "COINTRA";
  const isCliente = user.rol === "CLIENTE";
  const isTercero = user.rol === "TERCERO";
  const roleMoneyField: "ingresos" | "costos" = isCliente ? "ingresos" : "costos";
  const roleMoneyTitle = isCliente ? "Costos" : "Ingresos";
  const roleMoneyLabel = isCliente ? "Costo" : "Ingreso";

  function goToConciliacionesList() {
    navigate("/conciliaciones#lista-conciliaciones");
  }

  function oneDecimal(value: number): string {
    return value.toFixed(1);
  }

  function roleMoneyValue(row: { ingresos: number; costos: number }): number {
    return roleMoneyField === "ingresos" ? row.ingresos : row.costos;
  }

  function formatCurrency(value: number): string {
    return `$ ${formatCOP(value)}`;
  }

  function StatCard({
    title,
    value,
    hint,
    tone,
    highlightBadge,
    onClick,
  }: {
    title: string;
    value: string;
    hint?: string;
    tone?: "borrador" | "revision" | "aprobada" | "devuelta" | "servicios" | "conciliaciones" | "facturar" | "facturada";
    highlightBadge?: string;
    onClick?: () => void;
  }) {
    const toneClass =
      tone === "borrador"
        ? "border-amber-400 bg-gradient-to-br from-amber-100 via-amber-200 to-amber-300 shadow-amber-300/60"
        : tone === "revision"
          ? "border-sky-400 bg-gradient-to-br from-sky-100 via-sky-200 to-sky-300 shadow-sky-300/60"
          : tone === "aprobada"
            ? "border-emerald-400 bg-gradient-to-br from-emerald-100 via-emerald-200 to-emerald-300 shadow-emerald-300/60"
            : tone === "devuelta"
              ? "border-rose-400 bg-gradient-to-br from-rose-100 via-rose-200 to-rose-300 shadow-rose-300/60"
              : tone === "servicios"
                ? "border-cyan-400 bg-gradient-to-br from-cyan-100 via-cyan-200 to-cyan-300 shadow-cyan-300/60"
                : tone === "conciliaciones"
                  ? "border-indigo-400 bg-gradient-to-br from-indigo-100 via-indigo-200 to-indigo-300 shadow-indigo-300/60"
                  : tone === "facturar"
                    ? "border-violet-400 bg-gradient-to-br from-violet-100 via-violet-200 to-violet-300 shadow-violet-300/60"
                    : tone === "facturada"
                      ? "border-fuchsia-400 bg-gradient-to-br from-fuchsia-100 via-fuchsia-200 to-fuchsia-300 shadow-fuchsia-300/60"
              : "border-emerald-100 bg-white";

    const titleClass = tone ? "text-slate-800" : "text-neutral";
    const valueClass = "text-slate-900";
    const hintClass = tone ? "text-slate-700" : "text-neutral";
    const badgeClass =
      "bg-indigo-700/90 text-white";
    const interactiveClass = onClick
      ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
      : "";

    return (
      <article
        className={`rounded-2xl border p-4 shadow-sm ${toneClass} ${interactiveClass}`}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!onClick) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${titleClass}`}>{title}</p>
          {highlightBadge && (
            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
              {highlightBadge}
            </span>
          )}
        </div>
        <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
        {hint && <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p>}
      </article>
    );
  }

  function estadoConciliacionClase(label: string): string {
    const key = label.toUpperCase();
    if (key === "BORRADOR") return "from-amber-400 to-amber-500";
    if (key === "EN REVISION") return "from-sky-500 to-sky-600";
    if (key === "APROBADA") return "from-emerald-500 to-emerald-600";
    if (key === "DEVUELTA") return "from-rose-500 to-rose-600";
    if (key === "ENVIADA A FACTURAR") return "from-violet-500 to-violet-600";
    if (key === "FACTURADA") return "from-fuchsia-500 to-fuchsia-600";
    return "from-slate-500 to-slate-600";
  }

  function BarList({ title, rows, colorByEstado = false }: { title: string; rows: DashboardLabelValue[]; colorByEstado?: boolean }) {
    const max = Math.max(...rows.map((row) => row.value), 1);
    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="mt-3 space-y-2">
          {rows.length === 0 && <p className="text-xs text-neutral">Sin datos para este período.</p>}
          {rows.map((row) => (
            <div key={row.label} title={`${row.label}: ${row.value}`}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                <span>{row.label}</span>
                <span className="font-semibold">{row.value}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full bg-gradient-to-r ${
                    colorByEstado ? estadoConciliacionClase(row.label) : "from-emerald-500 to-teal-600"
                  }`}
                  style={{ width: `${row.value <= 0 ? 0 : Math.max(6, (row.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
    );
  }

  function TopTable({
    title,
    rows,
    labelHeader,
    singleMetric,
  }: {
    title: string;
    rows: Array<{ label: string; servicios: number; ganancia: number; ingresos: number; costos: number }>;
    labelHeader: string;
    singleMetric?: { label: string; field: "ingresos" | "costos" };
  }) {
    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-neutral">
                <th className="px-2 py-2">{labelHeader}</th>
                <th className="px-2 py-2">Servicios</th>
                {singleMetric ? (
                  <th className="px-2 py-2">{singleMetric.label}</th>
                ) : (
                  <>
                    <th className="px-2 py-2">Ingresos</th>
                    <th className="px-2 py-2">Costos</th>
                    <th className="px-2 py-2">Ganancia</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={singleMetric ? 3 : 5} className="px-2 py-3 text-neutral">Sin datos para este período.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-2 font-semibold text-slate-800">{row.label}</td>
                  <td className="px-2 py-2 text-slate-700">{row.servicios}</td>
                  {singleMetric ? (
                    <td className="px-2 py-2 text-slate-700">{formatCurrency(row[singleMetric.field])}</td>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-slate-700">{formatCurrency(row.ingresos)}</td>
                      <td className="px-2 py-2 text-slate-700">{formatCurrency(row.costos)}</td>
                      <td className="px-2 py-2 text-slate-700">{formatCurrency(row.ganancia)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    );
  }

  function TendenciaValorServicios({
    rows,
    title,
    legend,
  }: {
    rows: Array<{ label: string; value: number }>;
    title: string;
    legend: string;
  }) {
    if (rows.length === 0) {
      return (
        <article className="rounded-2xl border border-border bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-3 text-xs text-neutral">Sin datos para este período.</p>
        </article>
      );
    }

    const width = 860;
    const height = 320;
    const topPad = 20;
    const rightPad = 22;
    const bottomPad = 92;
    const leftPad = 52;
    const chartW = width - leftPad - rightPad;
    const chartH = height - topPad - bottomPad;

    const maxValue = Math.max(...rows.map((row) => row.value), 1);
    const slot = chartW / rows.length;
    const barW = Math.max(12, slot * 0.55);

    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className="text-[11px] text-slate-600">{legend}</span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/40">
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = topPad + (idx / 4) * chartH;
            const value = maxValue * (1 - idx / 4);
            return (
              <g key={idx}>
                <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#dbe5df" strokeDasharray="4 4" />
                <text x={1.5} y={y + 3} textAnchor="start" fontSize="10" fill="#64748b">
                  {formatCurrency(value)}
                </text>
              </g>
            );
          })}

          {rows.map((row, idx) => {
            const x = leftPad + idx * slot + (slot - barW) / 2;
            const h = (row.value / maxValue) * chartH;
            const y = topPad + chartH - h;
            const label = row.label.length > 12 ? `${row.label.slice(0, 12)}...` : row.label;
            return (
              <g key={`${row.label}-${idx}`}>
                <title>{`${row.label} | ${legend}: ${formatCurrency(row.value)}`}</title>
                <rect x={x} y={y} width={barW} height={Math.max(1, h)} rx={5} fill="#0ea5a4" fillOpacity="0.88" />
                <text
                  x={x + barW / 2}
                  y={topPad + chartH + 36}
                  textAnchor="end"
                  fontSize="10"
                  fill="#475569"
                  transform={`rotate(-90 ${x + barW / 2} ${topPad + chartH + 36})`}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </article>
    );
  }

  function TendenciaRentabilidad({
    rows,
  }: {
    rows: Array<{ label: string; ingresos: number; costos: number; ganancia: number }>;
  }) {
    if (rows.length === 0) {
      return (
        <article className="rounded-2xl border border-border bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Evolución de ingresos, costos y ganancia</h3>
          <p className="mt-3 text-xs text-neutral">Sin datos para este período.</p>
        </article>
      );
    }

    const width = 860;
    const height = 320;
    const topPad = 20;
    const rightPad = 22;
    const bottomPad = 92;
    const leftPad = 52;
    const chartW = width - leftPad - rightPad;
    const chartH = height - topPad - bottomPad;

    const maxAxis = Math.max(...rows.map((row) => Math.max(row.ingresos, row.costos, row.ganancia)), 1);
    const minAxis = Math.min(...rows.map((row) => Math.min(0, row.ganancia)), 0);
    const spanAxis = Math.max(maxAxis - minAxis, 1);
    const zeroY = topPad + chartH - ((0 - minAxis) / spanAxis) * chartH;

    const slot = chartW / rows.length;
    const groupW = Math.max(24, slot * 0.68);
    const barW = Math.max(8, groupW / 2 - 3);

    const gananciaLine = rows
      .map((row, idx) => {
        const cx = leftPad + idx * slot + slot / 2;
        const cy = topPad + chartH - ((row.ganancia - minAxis) / spanAxis) * chartH;
        return `${cx},${cy}`;
      })
      .join(" ");

    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Evolución de ingresos, costos y ganancia</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Ingresos</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />Costos</span>
            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-cyan-600" />Ganancia</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/40">
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = topPad + (idx / 4) * chartH;
            const value = maxAxis - (idx / 4) * spanAxis;
            return (
              <g key={idx}>
                <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#dbe5df" strokeDasharray="4 4" />
                <text x={1.5} y={y + 3} textAnchor="start" fontSize="10" fill="#64748b">
                  {formatCurrency(value)}
                </text>
              </g>
            );
          })}
          <line x1={leftPad} y1={zeroY} x2={width - rightPad} y2={zeroY} stroke="#94a3b8" strokeWidth="1.4" />

          {rows.map((row, idx) => {
            const baseX = leftPad + idx * slot + slot / 2 - groupW / 2;
            const ingresosY = topPad + chartH - ((row.ingresos - minAxis) / spanAxis) * chartH;
            const costosY = topPad + chartH - ((row.costos - minAxis) / spanAxis) * chartH;
            const ingresosH = Math.max(1, zeroY - ingresosY);
            const costosH = Math.max(1, zeroY - costosY);
            const label = row.label.length > 10 ? `${row.label.slice(0, 10)}...` : row.label;
            const tooltip = `${row.label} | Ingresos: ${formatCurrency(row.ingresos)} | Costos: ${formatCurrency(row.costos)} | Ganancia: ${formatCurrency(row.ganancia)}`;

            return (
              <g key={`${row.label}-${idx}`}>
                <title>{tooltip}</title>
                <rect x={baseX} y={ingresosY} width={barW} height={ingresosH} rx={4} fill="#10b981" fillOpacity="0.86" />
                <rect x={baseX + barW + 6} y={costosY} width={barW} height={costosH} rx={4} fill="#f59e0b" fillOpacity="0.9" />
                <text
                  x={leftPad + idx * slot + slot / 2}
                  y={topPad + chartH + 36}
                  textAnchor="end"
                  fontSize="10"
                  fill="#475569"
                  transform={`rotate(-90 ${leftPad + idx * slot + slot / 2} ${topPad + chartH + 36})`}
                >
                  {label}
                </text>
              </g>
            );
          })}

          <polyline points={gananciaLine} fill="none" stroke="#0891b2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {rows.map((row, idx) => {
            const cx = leftPad + idx * slot + slot / 2;
            const cy = topPad + chartH - ((row.ganancia - minAxis) / spanAxis) * chartH;
            return (
              <g key={`g-${idx}`}>
                <title>{`${row.label} | Ganancia: ${formatCurrency(row.ganancia)}`}</title>
                <circle cx={cx} cy={cy} r={3.8} fill="#0891b2" stroke="#ecfeff" strokeWidth="2" />
              </g>
            );
          })}
        </svg>
      </article>
    );
  }

  function EmbudoConciliaciones() {
    const steps = [
      { label: "Borrador", value: data?.kpis.conc_borrador ?? 0, tone: "from-amber-400 to-amber-500" },
      { label: "En revisión", value: data?.kpis.conc_en_revision ?? 0, tone: "from-sky-500 to-sky-600" },
      { label: "Aprobada", value: data?.kpis.conc_aprobada ?? 0, tone: "from-emerald-500 to-emerald-600" },
      { label: "Devuelta", value: data?.kpis.conc_devuelta ?? 0, tone: "from-rose-500 to-rose-600" },
      { label: "Enviada a facturar", value: data?.kpis.conc_enviada_facturar ?? 0, tone: "from-violet-500 to-violet-600" },
      { label: "Facturada", value: data?.kpis.conc_facturada ?? 0, tone: "from-fuchsia-500 to-fuchsia-600" },
    ];
    const max = Math.max(...steps.map((step) => step.value), 1);

    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Embudo de estado de conciliaciones</h3>
        <div className="mt-3 space-y-2.5">
          {steps.map((step) => (
            <div key={step.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                <span>{step.label}</span>
                <span className="font-semibold">{step.value}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full bg-gradient-to-r ${step.tone}`}
                  style={{ width: `${step.value <= 0 ? 0 : Math.max(6, (step.value / max) * 100)}%` }}
                  title={`${step.label}: ${step.value}`}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
    );
  }

  function ParetoGanancia({
    title,
    rows,
    metricLabel = "Ganancia",
  }: {
    title: string;
    rows: Array<{ label: string; ganancia: number }>;
    metricLabel?: string;
  }) {
    if (rows.length === 0) {
      return (
        <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-3 text-xs text-neutral">Sin datos para este período.</p>
        </article>
      );
    }

    const sorted = [...rows].sort((a, b) => b.ganancia - a.ganancia).slice(0, 8);
    const total = sorted.reduce((acc, row) => acc + Math.max(0, row.ganancia), 0);
    const maxGan = Math.max(...sorted.map((row) => row.ganancia), 1);

    let running = 0;
    const prepared = sorted.map((row) => {
      running += Math.max(0, row.ganancia);
      return {
        ...row,
        acumuladoPct: total > 0 ? (running / total) * 100 : 0,
      };
    });

    const width = 700;
    const height = 280;
    const topPad = 18;
    const rightPad = 20;
    const bottomPad = 60;
    const leftPad = 44;
    const chartW = width - leftPad - rightPad;
    const chartH = height - topPad - bottomPad;
    const slot = chartW / prepared.length;
    const barW = Math.max(20, slot * 0.5);
    const line = prepared
      .map((row, idx) => {
        const cx = leftPad + idx * slot + slot / 2;
        const y = topPad + chartH - (row.acumuladoPct / 100) * chartH;
        return `${cx},${y}`;
      })
      .join(" ");

    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-600">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span>Barra: {metricLabel.toLowerCase()} | Línea: acumulado %</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-white to-sky-50/40">
          {Array.from({ length: 4 }).map((_, idx) => {
            const y = topPad + (idx / 3) * chartH;
            const moneyValue = maxGan * (1 - idx / 3);
            const pctValue = 100 * (1 - idx / 3);
            return (
              <g key={idx}>
                <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#dbe5df" strokeDasharray="4 4" />
                <text x={1.5} y={y + 3} textAnchor="start" fontSize="10" fill="#64748b">
                  {formatCurrency(moneyValue)}
                </text>
                <text x={width - 1.5} y={y + 3} textAnchor="end" fontSize="10" fill="#0c4a6e">
                  {pctValue.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {prepared.map((row, idx) => {
            const x = leftPad + idx * slot + (slot - barW) / 2;
            const barH = (Math.max(0, row.ganancia) / maxGan) * chartH;
            const y = topPad + chartH - barH;
            const label = row.label.length > 12 ? `${row.label.slice(0, 12)}...` : row.label;
            return (
              <g key={`${row.label}-${idx}`}>
                <title>{`${row.label} | ${metricLabel}: ${formatCurrency(row.ganancia)} | Acumulado: ${row.acumuladoPct.toFixed(1)}%`}</title>
                <rect x={x} y={y} width={barW} height={Math.max(1, barH)} rx={6} fill="#0ea5a4" fillOpacity="0.85" />
                <text x={x + barW / 2} y={topPad + chartH + 14} textAnchor="middle" fontSize="10" fill="#475569">{label}</text>
              </g>
            );
          })}

          <polyline points={line} fill="none" stroke="#0369a1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {prepared.map((row, idx) => {
            const cx = leftPad + idx * slot + slot / 2;
            const cy = topPad + chartH - (row.acumuladoPct / 100) * chartH;
            return (
              <g key={`p-${idx}`}>
                <title>{`${row.label} | Acumulado: ${row.acumuladoPct.toFixed(1)}%`}</title>
                <circle cx={cx} cy={cy} r={3.6} fill="#0369a1" stroke="#f0f9ff" strokeWidth="2" />
              </g>
            );
          })}
        </svg>
      </article>
    );
  }

  function GraficoOperacionesGananciaServicios({
    rows,
    title = "Ganancia por operación vs servicios",
    metricLabel = "Ganancia",
  }: {
    rows: Array<{ label: string; servicios: number; ganancia: number }>;
    title?: string;
    metricLabel?: string;
  }) {
    if (rows.length === 0) {
      return (
        <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-3 text-xs text-neutral">Sin datos para este período.</p>
        </article>
      );
    }

    const width = 760;
    const height = 300;
    const topPad = 20;
    const rightPad = 20;
    const bottomPad = 64;
    const leftPad = 52;

    const chartW = width - leftPad - rightPad;
    const chartH = height - topPad - bottomPad;
    const maxGanancia = Math.max(...rows.map((row) => row.ganancia), 1);
    const maxServicios = Math.max(...rows.map((row) => row.servicios), 1);
    const slot = chartW / rows.length;
    const barW = Math.max(20, slot * 0.46);

    const linePoints = rows
      .map((row, idx) => {
        const cx = leftPad + idx * slot + slot / 2;
        const y = topPad + chartH - (row.servicios / maxServicios) * chartH;
        return `${cx},${y}`;
      })
      .join(" ");

    return (
      <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {metricLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-cyan-600" /> Servicios
            </span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/40">
          {Array.from({ length: 4 }).map((_, idx) => {
            const y = topPad + (idx / 3) * chartH;
            const metricValue = maxGanancia * (1 - idx / 3);
            const srvValue = Math.round(maxServicios * (1 - idx / 3));
            return (
              <g key={idx}>
                <line x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke="#dbe5df" strokeDasharray="4 4" />
                <text x={1.5} y={y + 3} textAnchor="start" fontSize="10" fill="#64748b">
                  {formatCurrency(metricValue)}
                </text>
                <text x={width - 1.5} y={y + 3} textAnchor="end" fontSize="10" fill="#155e75">
                  {srvValue}
                </text>
              </g>
            );
          })}

          {rows.map((row, idx) => {
            const x = leftPad + idx * slot + (slot - barW) / 2;
            const barH = (row.ganancia / maxGanancia) * chartH;
            const y = topPad + chartH - barH;
            const label = row.label.length > 14 ? `${row.label.slice(0, 14)}...` : row.label;
            const tooltip = `${row.label} | ${metricLabel}: ${formatCurrency(row.ganancia)} | Servicios: ${row.servicios}`;
            return (
              <g key={`${row.label}-${idx}`}>
                <title>{tooltip}</title>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(1, barH)}
                  rx={6}
                  fill="#10b981"
                  fillOpacity="0.85"
                />
                <text
                  x={x + barW / 2}
                  y={topPad + chartH + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#475569"
                >
                  {label}
                </text>
                <text
                  x={x + barW / 2}
                  y={topPad + chartH + 30}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#0f766e"
                  fontWeight="600"
                >
                  {formatCurrency(row.ganancia)}
                </text>
              </g>
            );
          })}

          <polyline points={linePoints} fill="none" stroke="#0891b2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {rows.map((row, idx) => {
            const cx = leftPad + idx * slot + slot / 2;
            const cy = topPad + chartH - (row.servicios / maxServicios) * chartH;
            return (
              <g key={`dot-${idx}`}>
                <title>{`${row.label} | Servicios: ${row.servicios}`}</title>
                <circle cx={cx} cy={cy} r={4.2} fill="#0891b2" stroke="#ecfeff" strokeWidth="2" />
                <text x={cx} y={cy - 9} textAnchor="middle" fontSize="10" fill="#155e75" fontWeight="700">
                  {row.servicios}
                </text>
              </g>
            );
          })}
        </svg>
      </article>
    );
  }

  function PlacaDesgloseTable({ rows }: { rows: DashboardPlacaDesglose[] }) {
    if (rows.length === 0) return null;
    const useCliente = isCliente;
    const viajesVal = (row: DashboardPlacaDesglose) => useCliente ? row.viajes_cliente : row.viajes;
    const dispVal = (row: DashboardPlacaDesglose) => useCliente ? row.disponibilidad_cliente : row.disponibilidad;
    const totalVal = (row: DashboardPlacaDesglose) => useCliente ? row.total_cliente : row.total;
    const maxTotal = Math.max(...rows.map(totalVal), 1);
    const hint = useCliente ? "Tarifa cliente · ordenado por mayor total" : "Costo tercero · ordenado por mayor total";
    return (
      <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">Viajes vs Disponibilidad por placa</h3>
          <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Placa</th>
                <th className="px-4 py-2 text-right">Viajes</th>
                <th className="px-4 py-2 text-right">Disponibilidad</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 w-36">Distribución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const v = viajesVal(row);
                const d = dispVal(row);
                const t = totalVal(row);
                const viajesPct = t > 0 ? Math.round((v / t) * 100) : 0;
                const dispPct = 100 - viajesPct;
                return (
                  <tr key={row.placa} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 font-semibold text-slate-800">{row.placa}</td>
                    <td className="px-4 py-2 text-right text-sky-700">$ {formatCOP(v)}</td>
                    <td className="px-4 py-2 text-right text-violet-700">$ {formatCOP(d)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">$ {formatCOP(t)}</td>
                    <td className="px-4 py-2">
                      <div
                        className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
                        title={`Viajes ${viajesPct}% · Disponibilidad ${dispPct}%`}
                      >
                        <div className="h-full bg-sky-400" style={{ width: `${(v / maxTotal) * 100}%` }} />
                        <div className="h-full bg-violet-400" style={{ width: `${(d / maxTotal) * 100}%` }} />
                      </div>
                      <div className="mt-1 flex gap-2 text-[10px]">
                        {viajesPct > 0 && <span className="text-sky-600">{viajesPct}% V</span>}
                        {d > 0 && <span className="text-violet-600">{dispPct}% D</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 border-t border-border px-5 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-sky-400" /> Viajes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-violet-400" /> Disponibilidad
          </span>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900 p-6 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-14 left-1/3 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mt-1 text-2xl font-bold">Indicadores de gestión y conciliación</h2>
            <p className="mt-2 text-sm text-emerald-50/90">
              Bienvenido, {user.nombre}. Vista de consulta con rentabilidad, productividad y estado operativo.
            </p>
            {data?.period?.label && (
              <p className="mt-2 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold">
                Período: {data.period.label}
              </p>
            )}
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode("current_month")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                mode === "current_month" ? "bg-white text-teal-900" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              Mes actual
            </button>
            <button
              type="button"
              onClick={() => setMode("year_to_date")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                mode === "year_to_date" ? "bg-white text-teal-900" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              Año acumulado
            </button>
            <button
              type="button"
              onClick={() => setMode("month_year")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                mode === "month_year" ? "bg-white text-teal-900" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              Mes histórico
            </button>

            {(mode === "month_year" || mode === "year_to_date") && (
              <>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-lg border border-white/20 bg-white/15 px-2 py-2 text-xs font-semibold text-white outline-none"
                >
                  {yearOptions.map((option) => (
                    <option key={option} value={option} className="text-slate-900">
                      {option}
                    </option>
                  ))}
                </select>

                {mode === "month_year" && (
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="rounded-lg border border-white/20 bg-white/15 px-2 py-2 text-xs font-semibold text-white outline-none"
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => void loadIndicators()}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-teal-900"
                >
                  Actualizar
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {loading || !data ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl border border-border bg-white" />
          ))}
        </section>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {isCointra ? (
              <>
                <StatCard title="Ingresos" value={formatCurrency(data.kpis.ingresos)} hint="Tarifa cliente acumulada" />
                <StatCard title="Costos" value={formatCurrency(data.kpis.costos)} hint="Tarifa tercero acumulada" />
                <StatCard title="Ganancia" value={formatCurrency(data.kpis.ganancia)} hint={`Margen ${oneDecimal(data.kpis.margen_pct)}%`} />
                <StatCard title="Servicios" value={String(data.kpis.servicios)} hint={`Ticket medio ${formatCurrency(data.kpis.ticket_promedio)}`} />
                <StatCard
                  title="Conciliaciones"
                  value={String(data.kpis.conciliaciones)}
                  hint="Total del período"
                  highlightBadge={`Aprobación ${oneDecimal(data.kpis.aprobacion_items_pct)}%`}
                />
                <StatCard title="Manifiestos" value={String(data.kpis.manifiestos)} hint="Asociados al período" />
                <StatCard title="Placas activas" value={String(data.kpis.placas_activas)} hint="Vehículos con movimiento" />
                <StatCard
                  title="Variación ganancia"
                  value={`${data.kpis.variacion_ganancia_pct > 0 ? "+" : ""}${oneDecimal(data.kpis.variacion_ganancia_pct)}%`}
                  hint="Comparado con período anterior equivalente"
                />
                <StatCard title="Servicios pendientes" value={String(data.kpis.viajes_pendientes)} />
                <StatCard title="Servicios en revisión" value={String(data.kpis.viajes_en_revision)} />
              </>
            ) : (
              <>
                <StatCard
                  title={roleMoneyTitle}
                  value={formatCurrency(roleMoneyField === "ingresos" ? data.kpis.ingresos : data.kpis.costos)}
                  hint={isCliente ? "Tarifa cliente acumulada" : "Tarifa tercero acumulada"}
                />
                <StatCard title="Servicios" value={String(data.kpis.servicios)} />
                <StatCard
                  title="Conciliaciones"
                  value={String(data.kpis.conciliaciones)}
                  hint="Total del período"
                  highlightBadge={`Aprobación ${oneDecimal(data.kpis.aprobacion_items_pct)}%`}
                />
                <StatCard title="Manifiestos" value={String(data.kpis.manifiestos)} hint="Asociados al período" />
                <StatCard title="Placas activas" value={String(data.kpis.placas_activas)} hint="Vehículos con movimiento" />
                <StatCard title="Servicios pendientes" value={String(data.kpis.viajes_pendientes)} />
                <StatCard title="Servicios en revisión" value={String(data.kpis.viajes_en_revision)} />
                <StatCard title="Servicios conciliados" value={String(data.kpis.viajes_conciliados)} />
              </>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {isCointra && <StatCard title="Servicios conciliados" value={String(data.kpis.viajes_conciliados)} />}
            <StatCard title="Conciliaciones borrador" value={String(data.kpis.conc_borrador)} hint="Creadas en el período" tone="borrador" onClick={goToConciliacionesList} />
            <StatCard title="Conciliaciones en revisión" value={String(data.kpis.conc_en_revision)} hint="Creadas en el período" tone="revision" onClick={goToConciliacionesList} />
            <StatCard title="Conciliaciones aprobadas" value={String(data.kpis.conc_aprobada)} hint="Creadas en el período" tone="aprobada" onClick={goToConciliacionesList} />
            <StatCard title="Conciliaciones devueltas" value={String(data.kpis.conc_devuelta)} hint="Con devolución registrada" tone="devuelta" onClick={goToConciliacionesList} />
            <StatCard title="Enviadas a facturar" value={String(data.kpis.conc_enviada_facturar)} hint="Con marca de facturación" tone="facturar" onClick={goToConciliacionesList} />
            <StatCard title="Facturadas" value={String(data.kpis.conc_facturada)} hint="Factura enviada al cliente" tone="facturada" onClick={goToConciliacionesList} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {isCointra ? (
              <TendenciaRentabilidad rows={data.charts.serie} />
            ) : (
              <TendenciaValorServicios
                rows={data.charts.serie.map((row) => ({ label: row.label, value: roleMoneyField === "ingresos" ? row.ingresos : row.costos }))}
                title={`Evolución de ${roleMoneyTitle.toLowerCase()} por servicio`}
                legend={isCliente ? "Costo (valor cliente)" : "Ingreso (valor tercero)"}
              />
            )}
            <EmbudoConciliaciones />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <BarList title="Servicios por tipo" rows={data.charts.items_tipo} />
            <BarList title="Items por estado" rows={data.charts.items_estado} />
            <BarList title="Costo por tipo de servicio" rows={data.charts.costo_por_tipo} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <GraficoOperacionesGananciaServicios
              rows={
                isCointra
                  ? data.charts.top_operaciones
                  : data.charts.top_operaciones.map((row) => ({
                      ...row,
                      ganancia: roleMoneyField === "ingresos" ? row.ingresos : row.costos,
                    }))
              }
              title={isCointra ? "Ganancia por operación vs servicios" : `${roleMoneyLabel} por operación vs servicios`}
              metricLabel={isCointra ? "Ganancia" : roleMoneyLabel}
            />
            {isCointra && <ParetoGanancia title="Pareto de ganancia por cliente" rows={data.charts.top_clientes} />}
            {isCliente && (
              <ParetoGanancia
                title="Pareto de costo por tercero"
                rows={data.charts.top_terceros.map((row) => ({ label: row.label, ganancia: row.ingresos }))}
                metricLabel="Costo"
              />
            )}
            {isTercero && (
              <ParetoGanancia
                title="Pareto de ingreso por cliente"
                rows={data.charts.top_clientes.map((row) => ({ label: row.label, ganancia: row.costos }))}
                metricLabel="Ingreso"
              />
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {isCointra && <ParetoGanancia title="Pareto de ganancia por tercero" rows={data.charts.top_terceros} />}
            <TopTable
              title={isCointra ? "Top placas con mayor ganancia" : `Top placas con mayor ${roleMoneyTitle.toLowerCase()}`}
              rows={data.charts.top_placas}
              labelHeader="Placa"
              singleMetric={isCointra ? undefined : { label: roleMoneyLabel, field: roleMoneyField }}
            />
          </section>

          {data.charts.placa_desglose.length > 0 && (
            <section>
              <PlacaDesgloseTable rows={data.charts.placa_desglose} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

