import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ActionModal } from "../components/common/ActionModal";
import excelLogo from "../assets/excel-logo.svg";
import { api } from "../services/api";
import { Conciliacion, Item, Operacion, Servicio, TarifaLookup, TipoVehiculo, User, Vehiculo, Viaje } from "../types";
import { formatCOP } from "../utils/formatters";

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `$ ${formatCOP(value)}`;
}

function getDateSortValue(value: string | null | undefined): number {
  const normalized = String(value ?? "").trim();
  if (!normalized) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;
  const fallback = Date.parse(`${normalized}T00:00:00`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.POSITIVE_INFINITY;
}

function sortByFechaAsc<T extends { fecha_servicio?: string | null; id?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dateDiff = getDateSortValue(a.fecha_servicio) - getDateSortValue(b.fecha_servicio);
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function toSpanishError(error: unknown): string {
  const message = (error as Error)?.message || "";
  if (!message) return "Ocurrio un error inesperado";
  try {
    const parsed = JSON.parse(message) as { detail?: string | { message?: string } };
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
    if (parsed.detail && typeof parsed.detail === "object" && typeof parsed.detail.message === "string") {
      return parsed.detail.message;
    }
  } catch {
    // No-op: mensaje plano
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "No fue posible conectar con el servidor";
  }
  return message;
}

function parseFacturacionError(
  message: string
): { summary: string; viajesPendientes: string[]; viajeIds: number[]; recomendacion: string } | null {
  if (!message) return null;

  const normalized = message.replace(/\r\n/g, "\n").trim();
  const pendingMatch = normalized.match(/Viajes pendientes\s*\(\d+\)\s*:\s*(.+?)(?:\.\s*(?:Completa|Actualiza|Verifica)|\n|$)/i);

  if (!pendingMatch) return null;

  const viajesPendientes = pendingMatch[1]
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (viajesPendientes.length === 0) return null;

  const viajeIds = Array.from(
    new Set(
      viajesPendientes
        .map((entry) => {
          const match = entry.match(/viaje\s*#\s*(\d+)/i);
          return match ? Number(match[1]) : null;
        })
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
    )
  );

  const summary = normalized.split("\n")[0]?.trim() || "No se pudo generar la facturacion por datos faltantes.";
  const recommendationMatch = normalized.match(/(Completa[^\n]+|Actualiza[^\n]+|Verifica[^\n]+)$/i);

  return {
    summary,
    viajesPendientes,
    viajeIds,
    recomendacion: recommendationMatch?.[1]?.trim() || "Completa los datos pendientes de los servicios y vuelve a intentar.",
  };
}

interface EditableCellProps {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
  helperText?: string;
}

function EditableCell({ initialValue, onSave, placeholder, type = "text", className, helperText }: EditableCellProps) {
  const [value, setValue] = useState(initialValue);
  const [tabDirection, setTabDirection] = useState<-1 | 0 | 1>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function focusSibling(direction: -1 | 1) {
    if (!inputRef.current) return;
    const focusables = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-editable-cell='true']")
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    const currentIndex = focusables.indexOf(inputRef.current);
    if (currentIndex === -1) return;
    const next = focusables[currentIndex + direction];
    if (next) next.focus();
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        data-editable-cell="true"
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            setTabDirection(e.shiftKey ? -1 : 1);
            e.currentTarget.blur();
          }
        }}
        onBlur={async () => {
          if (value !== initialValue) {
            await onSave(value);
          }
          if (tabDirection !== 0) {
            const dir = tabDirection;
            setTabDirection(0);
            requestAnimationFrame(() => focusSibling(dir));
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      {helperText && <p className="text-[11px] text-neutral">{helperText}</p>}
    </div>
  );
}

interface Props {
  user: User;
  operaciones: Operacion[];
  conciliaciones: Conciliacion[];
  onRefreshConciliaciones: () => Promise<void>;
  openConciliacionId?: number | null;
  onOpenConciliacionHandled?: () => void;
}

export function DashboardPage({ user, operaciones, conciliaciones, onRefreshConciliaciones, openConciliacionId, onOpenConciliacionHandled }: Props) {
  const SERVICIOS_PAGE_SIZE = 25;
  const location = useLocation();
  const [activeModule, setActiveModule] = useState<"viajes" | "conciliaciones">("viajes");
  const conciliacionesListRef = useRef<HTMLElement | null>(null);

  function scrollToConciliacionesList() {
    const el = conciliacionesListRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    el.focus({ preventScroll: true });
  }
  const isCointraAdmin = user.rol === "COINTRA" && user.sub_rol === "COINTRA_ADMIN";
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [tiposVehiculo, setTiposVehiculo] = useState<TipoVehiculo[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tarifaLookup, setTarifaLookup] = useState<TarifaLookup | null>(null);
  const [viajeForm, setViajeForm] = useState({
    operacion_id: "",
    servicio_id: "",
    titulo: "",
    fecha_servicio: "",
    origen: "",
    destino: "",
    placa: "",
    hora_inicio: "",
    conductor: "",
    tarifa_tercero: "",
    tarifa_cliente: "",
    descripcion: "",
  });
  const [selectedConciliacion, setSelectedConciliacion] = useState<number | null>(null);
  const [pendingViajes, setPendingViajes] = useState<Viaje[]>([]);
  const [selectedViajeIds, setSelectedViajeIds] = useState<number[]>([]);
  const [removingLiquidacionItemId, setRemovingLiquidacionItemId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewRecipient, setReviewRecipient] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [selectedViajeDetalle, setSelectedViajeDetalle] = useState<Item | null>(null);
  const [filtroConciliacionId, setFiltroConciliacionId] = useState("");
  const [filtroConciliacionNombre, setFiltroConciliacionNombre] = useState("");
  const [filtroOperacionId, setFiltroOperacionId] = useState("");
  const [filtroConciliacionCreadaDesde, setFiltroConciliacionCreadaDesde] = useState("");
  const [filtroConciliacionCreadaHasta, setFiltroConciliacionCreadaHasta] = useState("");
  const [filtroEstadoViaje, setFiltroEstadoViaje] = useState<"TODOS" | "PENDIENTE" | "EN_REVISION" | "CONCILIADO">("TODOS");
  const [serviciosPage, setServiciosPage] = useState(1);
  const [filtrosTablaViajes, setFiltrosTablaViajes] = useState({
    titulo: "",
    servicio: "",
    operacion: "",
    ruta: "",
    placa: "",
    estado: "",
    activo: "",
    conciliacion: "",
  });
  const [filtrosTablaItemsConciliacion, setFiltrosTablaItemsConciliacion] = useState({
    id: "",
    tipo: "",
    estado: "",
    fecha: "",
    origen: "",
    destino: "",
    placa: "",
    manifiesto: "",
  });
  const [filtrosTablaItemsViajeBajoLiquidacion, setFiltrosTablaItemsViajeBajoLiquidacion] = useState({
    id: "",
    tipo: "",
    estado: "",
    fecha: "",
    origen: "",
    destino: "",
    placa: "",
    manifiesto: "",
  });
  const [filtroEstadoConciliacion, setFiltroEstadoConciliacion] = useState<"TODOS" | "BORRADOR" | "EN_REVISION" | "APROBADA" | "ENVIADA_A_FACTURAR" | "FACTURADO">("TODOS");
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState("");
  const [highlightSelectedConciliacion, setHighlightSelectedConciliacion] = useState(false);
  const [clientItemSelections, setClientItemSelections] = useState<Record<number, boolean>>({});
  const [clientDecisionError, setClientDecisionError] = useState("");
  const [clientDecisionModal, setClientDecisionModal] = useState<{
    action: "aprobar" | "devolver";
    observacion: string;
    enviarCorreo: boolean;
    destinatario: string;
    mensaje: string;
    poNumero: string;
  } | null>(null);
  const [facturacionPanelOpen, setFacturacionPanelOpen] = useState(false);
  const [facturacionRecipient, setFacturacionRecipient] = useState("");
  const [facturacionMessage, setFacturacionMessage] = useState("");
  const [facturacionError, setFacturacionError] = useState("");
  const [facturaClientePanelOpen, setFacturaClientePanelOpen] = useState(false);
  const [facturaClienteRecipient, setFacturaClienteRecipient] = useState("");
  const [facturaClienteMessage, setFacturaClienteMessage] = useState("");
  const [facturaClienteFile, setFacturaClienteFile] = useState<File | null>(null);
  const [isSendingFacturaCliente, setIsSendingFacturaCliente] = useState(false);
  const [facturaClienteError, setFacturaClienteError] = useState("");
  const [isSendingReview, setIsSendingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isSendingFacturacion, setIsSendingFacturacion] = useState(false);
  const [suggestedReviewRecipient, setSuggestedReviewRecipient] = useState("");
  const [suggestedClientReplyRecipient, setSuggestedClientReplyRecipient] = useState("");
  const [showLiquidacionContratoFijoPanel, setShowLiquidacionContratoFijoPanel] = useState(false);
  const [isCreatingLiquidacionContratoFijo, setIsCreatingLiquidacionContratoFijo] = useState(false);
  const [isSavingConciliacion, setIsSavingConciliacion] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [saveResultModal, setSaveResultModal] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [liquidacionContratoFijoForm, setLiquidacionContratoFijoForm] = useState({
    periodo_inicio: "",
    periodo_fin: "",
    placa: "",
    valor_tercero: "",
  });
  const [liquidacionItemEditModal, setLiquidacionItemEditModal] = useState<
    {
      id: number;
      placa: string;
      tarifa_tercero: string;
    } | null
  >(null);
  const [liquidacionItemDeleteConfirmId, setLiquidacionItemDeleteConfirmId] = useState<number | null>(null);
  const [viajeEditModal, setViajeEditModal] = useState<
    { id: number; titulo: string; origen: string; destino: string } | null
  >(null);
  const [conciliacionEditModal, setConciliacionEditModal] = useState<
    { id: number; nombre: string; fecha_inicio: string; fecha_fin: string } | null
  >(null);
  const [confirmModal, setConfirmModal] = useState<
    {
      entity: "viaje" | "conciliacion";
      action: "inactivar" | "reactivar";
      id: number;
      clearSelectionOnSuccess?: boolean;
    } | null
  >(null);
  const selectedConciliacionRef = useRef<HTMLElement | null>(null);
  const reviewRecipientDirtyRef = useRef(false);
  const suggestedReviewForConciliacionRef = useRef<number | null>(null);

  const selected = conciliaciones.find((c) => c.id === selectedConciliacion) || null;
  const maxDate = new Date().toISOString().split("T")[0];
  const maxMonth = maxDate.slice(0, 7);
  const operacionesActivas = useMemo(() => operaciones.filter((op) => op.activa), [operaciones]);
  const serviciosActivos = useMemo(() => servicios.filter((servicio) => servicio.activo), [servicios]);
  const vehiculosActivos = useMemo(() => vehiculos.filter((vehiculo) => vehiculo.activo), [vehiculos]);
  const tiposVehiculoActivos = useMemo(() => tiposVehiculo.filter((tipo) => tipo.activo), [tiposVehiculo]);
  const selectedServicio = useMemo(
    () => serviciosActivos.find((servicio) => servicio.id === Number(viajeForm.servicio_id)),
    [serviciosActivos, viajeForm.servicio_id]
  );
  const servicioRequiereOrigenDestino = selectedServicio?.requiere_origen_destino ?? false;
  const isServicioHoraExtra = selectedServicio?.codigo === "HORA_EXTRA";
  const isServicioConductorRelevo = selectedServicio?.codigo === "CONDUCTOR_RELEVO";
  const isServicioViaje = !selectedServicio || ["VIAJE", "VIAJE_ADICIONAL"].includes(selectedServicio.codigo);
  const shouldUseManualTarifa = !isServicioViaje && !tarifaLookup;
  const horasExtraCalculadas = useMemo(() => {
    if (!isServicioHoraExtra || !viajeForm.hora_inicio) return 0;
    const [h, m] = viajeForm.hora_inicio.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    const start = h * 60 + m;
    const cut = 6 * 60;
    let minutes = (cut - start) % (24 * 60);
    if (minutes < 0) {
      minutes += 24 * 60;
    }
    if (minutes === 0) {
      minutes = 24 * 60;
    }
    return Number((minutes / 60).toFixed(2));
  }, [isServicioHoraExtra, viajeForm.hora_inicio]);
  const tarifaHoraTercero = tarifaLookup?.tarifa_tercero ?? Number(viajeForm.tarifa_tercero || 0);
  const tarifaHoraCliente = tarifaLookup?.tarifa_cliente ?? Number(viajeForm.tarifa_cliente || 0);
  const totalHoraExtraTercero = Number((horasExtraCalculadas * tarifaHoraTercero).toFixed(2));
  const totalHoraExtraCliente = Number((horasExtraCalculadas * tarifaHoraCliente).toFixed(2));
  const fechaServicioInputValue = isServicioConductorRelevo
    ? viajeForm.fecha_servicio.slice(0, 7)
    : viajeForm.fecha_servicio.length === 7
      ? `${viajeForm.fecha_servicio}-01`
      : viajeForm.fecha_servicio;
  const conciliacionById = useMemo(() => {
    return new Map(conciliaciones.map((c) => [c.id, c]));
  }, [conciliaciones]);
  const operacionById = useMemo(() => {
    return new Map(operaciones.map((op) => [op.id, op]));
  }, [operaciones]);
  const selectedOperacion = useMemo(
    () => (selected ? operacionById.get(selected.operacion_id) ?? null : null),
    [selected, operacionById]
  );
  const vehiculosOperacionTercero = useMemo(() => {
    if (!selectedOperacion) return [];
    return vehiculosActivos
      .filter((vehiculo) => vehiculo.tercero_id === selectedOperacion.tercero_id)
      .sort((a, b) => a.placa.localeCompare(b.placa));
  }, [selectedOperacion, vehiculosActivos]);
  const tipoVehiculoById = useMemo(() => {
    return new Map(tiposVehiculo.map((tipo) => [tipo.id, tipo.nombre]));
  }, [tiposVehiculo]);
  const configuracionVehiculoByPlaca = useMemo(() => {
    const map = new Map<string, string>();
    for (const vehiculo of vehiculos) {
      const placa = String(vehiculo.placa || "").trim().toUpperCase();
      if (!placa) continue;
      const configuracion = tipoVehiculoById.get(vehiculo.tipo_vehiculo_id);
      if (configuracion) {
        map.set(placa, configuracion);
      }
    }
    return map;
  }, [vehiculos, tipoVehiculoById]);

  const conciliacionesFiltradas = useMemo(() => {
    return conciliaciones.filter((c) => {
      const estadoLabel = getConciliacionEstadoLabel(c);
      if (filtroEstadoConciliacion !== "TODOS" && estadoLabel !== filtroEstadoConciliacion) {
        return false;
      }

      if (filtroConciliacionId && !String(c.id).includes(filtroConciliacionId.trim())) {
        return false;
      }

      if (filtroConciliacionNombre && !c.nombre.toLowerCase().includes(filtroConciliacionNombre.toLowerCase().trim())) {
        return false;
      }

      if (filtroOperacionId && c.operacion_id !== Number(filtroOperacionId)) {
        return false;
      }

      const createdDate = c.created_at ? c.created_at.slice(0, 10) : "";
      if (filtroConciliacionCreadaDesde && createdDate < filtroConciliacionCreadaDesde) {
        return false;
      }
      if (filtroConciliacionCreadaHasta && createdDate > filtroConciliacionCreadaHasta) {
        return false;
      }

      return true;
    });
  }, [
    conciliaciones,
    filtroEstadoConciliacion,
    filtroConciliacionId,
    filtroConciliacionNombre,
    filtroOperacionId,
    filtroConciliacionCreadaDesde,
    filtroConciliacionCreadaHasta,
  ]);

  const viajesFiltrados = useMemo(() => {
    const normalize = (value: string | number | null | undefined) =>
      String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim();

    const includesFilter = (value: string | number | null | undefined, filterValue: string) => {
      if (!filterValue.trim()) return true;
      return normalize(value).includes(normalize(filterValue));
    };

    const filtered = viajes.filter((v) => {
      const estadoVisible = getEstadoVisibleViaje(v);
      if (filtroEstadoViaje !== "TODOS") {
        if (filtroEstadoViaje === "EN_REVISION" && estadoVisible !== "EN REVISIÓN") {
          return false;
        }
        if (filtroEstadoViaje !== "EN_REVISION" && estadoVisible !== filtroEstadoViaje) {
          return false;
        }
      }

      const operacionNombre = operacionById.get(v.operacion_id)?.nombre ?? `Operacion #${v.operacion_id}`;
      const conciliacion = v.conciliacion_id ? conciliacionById.get(v.conciliacion_id) : undefined;
      const conciliacionLabel = conciliacion ? `${conciliacion.nombre} (#${conciliacion.id})` : "-";
      const activoLabel = v.activo ? "si" : "no";
      const ruta = `${v.origen} - ${v.destino}`;

      return (
        includesFilter(v.titulo, filtrosTablaViajes.titulo) &&
        includesFilter(v.servicio_nombre ?? "Viaje", filtrosTablaViajes.servicio) &&
        includesFilter(operacionNombre, filtrosTablaViajes.operacion) &&
        includesFilter(ruta, filtrosTablaViajes.ruta) &&
        includesFilter(v.placa, filtrosTablaViajes.placa) &&
        includesFilter(estadoVisible, filtrosTablaViajes.estado) &&
        includesFilter(activoLabel, filtrosTablaViajes.activo) &&
        includesFilter(conciliacionLabel, filtrosTablaViajes.conciliacion)
      );
    });
    return sortByFechaAsc(filtered);
  }, [viajes, filtroEstadoViaje, filtrosTablaViajes, operacionById, conciliacionById]);

  const totalServiciosPages = Math.max(1, Math.ceil(viajesFiltrados.length / SERVICIOS_PAGE_SIZE));
  const serviciosPageSafe = Math.min(serviciosPage, totalServiciosPages);
  const viajesFiltradosPaginados = useMemo(() => {
    const start = (serviciosPageSafe - 1) * SERVICIOS_PAGE_SIZE;
    return viajesFiltrados.slice(start, start + SERVICIOS_PAGE_SIZE);
  }, [viajesFiltrados, serviciosPageSafe]);

  const visibleServiciosPages = useMemo(() => {
    const maxVisible = 7;
    if (totalServiciosPages <= maxVisible) {
      return Array.from({ length: totalServiciosPages }, (_, idx) => idx + 1);
    }
    let start = Math.max(1, serviciosPageSafe - 3);
    let end = Math.min(totalServiciosPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }, [serviciosPageSafe, totalServiciosPages]);

  const viajeStatusCounts = useMemo(() => {
    const counts = {
      TODOS: viajes.length,
      PENDIENTE: 0,
      EN_REVISION: 0,
      CONCILIADO: 0,
    };
    for (const viaje of viajes) {
      const estadoVisible = getEstadoVisibleViaje(viaje);
      if (estadoVisible === "PENDIENTE") counts.PENDIENTE += 1;
      if (estadoVisible === "EN REVISIÓN") counts.EN_REVISION += 1;
      if (estadoVisible === "CONCILIADO") counts.CONCILIADO += 1;
    }
    return counts;
  }, [viajes]);

  const conciliacionStatusCounts = useMemo(() => {
    const counts = {
      TODOS: conciliaciones.length,
      BORRADOR: 0,
      EN_REVISION: 0,
      APROBADA: 0,
      ENVIADA_A_FACTURAR: 0,
      FACTURADO: 0,
    };
    for (const conciliacion of conciliaciones) {
      const estado = getConciliacionEstadoLabel(conciliacion);
      if (estado === "BORRADOR") counts.BORRADOR += 1;
      if (estado === "EN_REVISION") counts.EN_REVISION += 1;
      if (estado === "APROBADA") counts.APROBADA += 1;
      if (estado === "ENVIADA_A_FACTURAR") counts.ENVIADA_A_FACTURAR += 1;
      if (estado === "FACTURADO") counts.FACTURADO += 1;
    }
    return counts;
  }, [conciliaciones]);

  useEffect(() => {
    if (!selectedViajeDetalle) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedViajeDetalle(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedViajeDetalle]);

  useEffect(() => {
    setServiciosPage(1);
  }, [filtroEstadoViaje, filtrosTablaViajes]);

  useEffect(() => {
    if (serviciosPage > totalServiciosPages) {
      setServiciosPage(totalServiciosPages);
    }
  }, [serviciosPage, totalServiciosPages]);

  useEffect(() => {
    if (!openConciliacionId) return;
    setActiveModule("conciliaciones");
    void (async () => {
      const opened = await loadItems(openConciliacionId, true);
      if (opened) {
        onOpenConciliacionHandled?.();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConciliacionId]);

  useEffect(() => {
    if (location.hash !== "#lista-conciliaciones") return;
    setActiveModule("conciliaciones");
  }, [location.hash]);

  useEffect(() => {
    if (activeModule !== "conciliaciones") return;
    if (location.hash !== "#lista-conciliaciones") return;
    requestAnimationFrame(() => {
      scrollToConciliacionesList();
      window.setTimeout(() => {
        scrollToConciliacionesList();
      }, 180);
    });
  }, [activeModule, location.hash]);

  useEffect(() => {
    if (!selected) {
      setSuggestedReviewRecipient("");
      setSuggestedClientReplyRecipient("");
      reviewRecipientDirtyRef.current = false;
      suggestedReviewForConciliacionRef.current = null;
      return;
    }

    const selectedChanged = suggestedReviewForConciliacionRef.current !== selected.id;
    if (selectedChanged) {
      reviewRecipientDirtyRef.current = false;
    }

    if (user.rol === "COINTRA") {
      void api
        .destinatariosSugeridos(selected.id, "cliente_revision")
        .then((rows) => {
          const firstEmail = rows.find((r) => !!r.email)?.email ?? "";
          setSuggestedReviewRecipient(firstEmail);
          if (!reviewRecipientDirtyRef.current) {
            setReviewRecipient(firstEmail);
          }
          suggestedReviewForConciliacionRef.current = selected.id;
        })
        .catch(() => null);
      return;
    }

    if (user.rol === "CLIENTE") {
      void api
        .destinatariosSugeridos(selected.id, "respuesta_cliente")
        .then((rows) => {
          const firstEmail = rows.find((r) => !!r.email)?.email ?? "";
          setSuggestedClientReplyRecipient(firstEmail);
        })
        .catch(() => null);
    }
  }, [selected, user.rol]);

  function getGananciaCointra(tarifaCliente: number | null | undefined, tarifaTercero: number | null | undefined): number | null {
    if (tarifaCliente === null || tarifaCliente === undefined || tarifaTercero === null || tarifaTercero === undefined) {
      return null;
    }
    return tarifaCliente - tarifaTercero;
  }

  const itemsViajeBajoLiquidacion = useMemo(
    () =>
      items.filter(
        (item) => !item.liquidacion_contrato_fijo && String(item.servicio_codigo || "").trim().toUpperCase() === "VIAJE"
      ),
    [items]
  );
  const itemsConciliacion = useMemo(
    () =>
      items.filter(
        (item) => !item.liquidacion_contrato_fijo && String(item.servicio_codigo || "").trim().toUpperCase() !== "VIAJE"
      ),
    [items]
  );
  const itemsConciliacionFiltrados = useMemo(() => {
    const normalize = (value: string | number | null | undefined) =>
      String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim();

    const includesFilter = (value: string | number | null | undefined, filterValue: string) => {
      if (!filterValue.trim()) return true;
      return normalize(value).includes(normalize(filterValue));
    };

    const filtered = itemsConciliacion.filter((item) => {
      const tipoLabel = getItemServicioLabel(item);
      const estadoLabel = item.estado.toUpperCase();
      return (
        includesFilter(item.viaje_id ?? item.id, filtrosTablaItemsConciliacion.id) &&
        includesFilter(tipoLabel, filtrosTablaItemsConciliacion.tipo) &&
        includesFilter(estadoLabel, filtrosTablaItemsConciliacion.estado) &&
        includesFilter(item.fecha_servicio, filtrosTablaItemsConciliacion.fecha) &&
        includesFilter(item.origen, filtrosTablaItemsConciliacion.origen) &&
        includesFilter(item.destino, filtrosTablaItemsConciliacion.destino) &&
        includesFilter(item.placa, filtrosTablaItemsConciliacion.placa) &&
        includesFilter(item.manifiesto_numero, filtrosTablaItemsConciliacion.manifiesto)
      );
    });
    return sortByFechaAsc(filtered);
  }, [itemsConciliacion, filtrosTablaItemsConciliacion]);
  const itemsViajeBajoLiquidacionFiltrados = useMemo(() => {
    const normalize = (value: string | number | null | undefined) =>
      String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim();

    const includesFilter = (value: string | number | null | undefined, filterValue: string) => {
      if (!filterValue.trim()) return true;
      return normalize(value).includes(normalize(filterValue));
    };

    const filtered = itemsViajeBajoLiquidacion.filter((item) => {
      const tipoLabel = getItemServicioLabel(item);
      const estadoLabel = item.estado.toUpperCase();
      return (
        includesFilter(item.viaje_id ?? item.id, filtrosTablaItemsViajeBajoLiquidacion.id) &&
        includesFilter(tipoLabel, filtrosTablaItemsViajeBajoLiquidacion.tipo) &&
        includesFilter(estadoLabel, filtrosTablaItemsViajeBajoLiquidacion.estado) &&
        includesFilter(item.fecha_servicio, filtrosTablaItemsViajeBajoLiquidacion.fecha) &&
        includesFilter(item.origen, filtrosTablaItemsViajeBajoLiquidacion.origen) &&
        includesFilter(item.destino, filtrosTablaItemsViajeBajoLiquidacion.destino) &&
        includesFilter(item.placa, filtrosTablaItemsViajeBajoLiquidacion.placa) &&
        includesFilter(item.manifiesto_numero, filtrosTablaItemsViajeBajoLiquidacion.manifiesto)
      );
    });
    return sortByFechaAsc(filtered);
  }, [itemsViajeBajoLiquidacion, filtrosTablaItemsViajeBajoLiquidacion]);
  const itemsLiquidacion = useMemo(
    () => items.filter((item) => !!item.liquidacion_contrato_fijo),
    [items]
  );
  const totalServiciosConciliacion = itemsConciliacion.length + itemsViajeBajoLiquidacion.length;
  const liquidacionResumen = useMemo(() => {
    const totals = itemsLiquidacion.reduce<{ tarifaTercero: number; tarifaCliente: number }>(
      (acc, item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0 }
    );
    const gananciaCointra = totals.tarifaCliente - totals.tarifaTercero;
    const rentabilidadPct = totals.tarifaCliente > 0 ? (gananciaCointra / totals.tarifaCliente) * 100 : 0;
    return {
      ...totals,
      gananciaCointra,
      rentabilidadPct,
    };
  }, [itemsLiquidacion]);
  const totals = useMemo(() => {
    return itemsConciliacion.reduce<{ tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }>(
      (acc: { tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }, item: Item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        acc.gananciaCointra += (item.tarifa_cliente ?? 0) - (item.tarifa_tercero ?? 0);
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0, gananciaCointra: 0 }
    );
  }, [itemsConciliacion]);
  const totalsViajesBajoLiquidacion = useMemo(() => {
    return itemsViajeBajoLiquidacion.reduce<{ tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }>(
      (acc: { tarifaTercero: number; tarifaCliente: number; gananciaCointra: number }, item: Item) => {
        acc.tarifaTercero += item.tarifa_tercero ?? 0;
        acc.tarifaCliente += item.tarifa_cliente ?? 0;
        acc.gananciaCointra += (item.tarifa_cliente ?? 0) - (item.tarifa_tercero ?? 0);
        return acc;
      },
      { tarifaTercero: 0, tarifaCliente: 0, gananciaCointra: 0 }
    );
  }, [itemsViajeBajoLiquidacion]);

  const itemsClienteRevision = useMemo(
    () => items,
    [items]
  );

  const allClientItemsChecked =
    user.rol === "CLIENTE" && itemsClienteRevision.length > 0
      ? itemsClienteRevision.every((item) => clientItemSelections[item.id] === true)
      : false;
  const allClientItemsConciliacionChecked =
    user.rol === "CLIENTE" && itemsConciliacion.length > 0
      ? itemsConciliacion.every((item) => clientItemSelections[item.id] === true)
      : false;
  const allClientItemsViajesBajoLiquidacionChecked =
    user.rol === "CLIENTE" && itemsViajeBajoLiquidacion.length > 0
      ? itemsViajeBajoLiquidacion.every((item) => clientItemSelections[item.id] === true)
      : false;
  const allClientItemsLiquidacionChecked =
    user.rol === "CLIENTE" && itemsLiquidacion.length > 0
      ? itemsLiquidacion.every((item) => clientItemSelections[item.id] === true)
      : false;
  const facturacionErrorParsed = useMemo(() => parseFacturacionError(facturacionError), [facturacionError]);

  function getEstadoVisibleViaje(viaje: Viaje): "PENDIENTE" | "EN REVISIÓN" | "CONCILIADO" {
    const estadoConciliacion = viaje.estado_conciliacion ?? null;

    if (estadoConciliacion === "EN_REVISION") return "EN REVISIÓN";
    if (estadoConciliacion === "APROBADA" || estadoConciliacion === "CERRADA" || viaje.conciliado) {
      return "CONCILIADO";
    }
    return "PENDIENTE";
  }

  function getItemServicioLabel(item: Item): string {
    if (item.liquidacion_contrato_fijo) {
      if (item.liquidacion_es_relevo) return "CONDUCTOR RELEVO (CONTRATO FIJO)";
      return "LIQUIDACIÓN CONTRATO FIJO";
    }
    if (item.servicio_nombre?.trim()) return item.servicio_nombre;
    if (item.servicio_codigo?.trim()) return item.servicio_codigo.replace(/_/g, " ");
    return item.tipo.replace(/_/g, " ");
  }

  function getItemLiquidacionPeriodoLabel(item: Item): string | null {
    if (!item.liquidacion_contrato_fijo) return null;
    if (!item.liquidacion_periodo_inicio || !item.liquidacion_periodo_fin) return null;
    return `${item.liquidacion_periodo_inicio} a ${item.liquidacion_periodo_fin}`;
  }

  function getConfiguracionVehiculoByPlaca(placa: string | null | undefined): string {
    const normalized = String(placa || "").trim().toUpperCase();
    if (!normalized) return "-";
    return configuracionVehiculoByPlaca.get(normalized) ?? "-";
  }

  function isHoraExtraItem(item: Item): boolean {
    return item.servicio_codigo === "HORA_EXTRA" || item.tipo === "HORA_EXTRA";
  }

  function isTransportServiceItem(item: Item): boolean {
    const codigo = String(item.servicio_codigo || "").trim().toUpperCase();
    return codigo === "VIAJE" || codigo === "VIAJE_ADICIONAL";
  }

  function getConciliacionEstadoLabel(conciliacion: Conciliacion): string {
    if (conciliacion.factura_cliente_enviada && conciliacion.estado === "CERRADA") return "FACTURADO";
    if (conciliacion.enviada_facturacion && conciliacion.estado === "APROBADA") return "ENVIADA_A_FACTURAR";
    return conciliacion.estado;
  }

  function getConciliacionEstadoClasses(conciliacion: Conciliacion): string {
    const estado = getConciliacionEstadoLabel(conciliacion);
    if (estado === "BORRADOR") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    if (estado === "EN_REVISION") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    if (estado === "APROBADA") return "bg-teal-50 text-teal-800 ring-1 ring-teal-200";
    if (estado === "ENVIADA_A_FACTURAR") return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    if (estado === "FACTURADO") return "bg-lime-50 text-lime-800 ring-1 ring-lime-200";
    return "bg-lime-50 text-lime-800 ring-1 ring-lime-200";
  }

  function getConciliacionValorCell(conciliacion: Conciliacion): string {
    const valorCliente = Number(conciliacion.valor_cliente ?? 0);
    const valorTercero = Number(conciliacion.valor_tercero ?? 0);
    const ganancia = valorCliente - valorTercero;
    if (user.rol === "CLIENTE") return formatCOP(valorCliente);
    if (user.rol === "TERCERO") return formatCOP(valorTercero);
    return `Cliente: ${formatCOP(valorCliente)} | Tercero: ${formatCOP(valorTercero)} | Ganancia: ${formatCOP(ganancia)}`;
  }

  function formatTimelineDate(value?: string | null): string {
    if (!value) return "-";
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Bogota",
    });
  }

  async function loadViajes() {
    try {
      const data = await api.viajes(undefined, false);
      setViajes(data);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function loadVehiculosData() {
    try {
      const [vs, ts, ss] = await Promise.all([api.vehiculos(), api.tiposVehiculo(), api.servicios()]);
      setVehiculos(vs);
      setTiposVehiculo(ts);
      setServicios(ss);
    } catch {
      // silencioso en UI de viajes; se puede gestionar mejor en pagina de vehiculos
    }
  }

  useEffect(() => {
    const servicioId = Number(viajeForm.servicio_id || 0);
    const placa = viajeForm.placa;
    if (!servicioId || !placa) {
      setTarifaLookup(null);
      return;
    }

    const vehiculo = vehiculos.find((v) => v.placa === placa);
    if (!vehiculo?.tipo_vehiculo_id) {
      setTarifaLookup(null);
      return;
    }

    void api
      .lookupTarifaCatalogo(servicioId, vehiculo.tipo_vehiculo_id)
      .then((lookup) => setTarifaLookup(lookup))
      .catch(() => setTarifaLookup(null));
  }, [viajeForm.servicio_id, viajeForm.placa, vehiculos]);

  async function loadItems(conciliacionId: number, focusOnOpen = false): Promise<boolean> {
    setSelectedConciliacion(conciliacionId);
    setLoadingItems(true);
    setItems([]);
    setError("");
    try {
      const itemData = await api.items(conciliacionId);
      setItems(itemData);
      if (user.rol === "CLIENTE") {
        const initialSelections: Record<number, boolean> = {};
        for (const item of itemData) {
          initialSelections[item.id] = item.estado === "APROBADO";
        }
        setClientItemSelections(initialSelections);
      }

      const conc = conciliacionById.get(conciliacionId);
      if (conc?.estado === "BORRADOR") {
        const pending = await api.viajesPendientesConciliacion(conciliacionId);
        setPendingViajes(pending);
      } else {
        setPendingViajes([]);
      }

      setSelectedViajeIds([]);
      if (focusOnOpen) {
        window.requestAnimationFrame(() => {
          selectedConciliacionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setHighlightSelectedConciliacion(true);
          window.setTimeout(() => setHighlightSelectedConciliacion(false), 2200);
        });
      }
      return true;
    } catch (e) {
      setError(toSpanishError(e));
      return false;
    } finally {
      setLoadingItems(false);
    }
  }

  async function createConciliacion(formData: FormData) {
    const operacion_id = Number(formData.get("operacion_id"));
    const nombre = String(formData.get("nombre") || "");
    const fecha_inicio = String(formData.get("fecha_inicio") || "");
    const fecha_fin = String(formData.get("fecha_fin") || "");

    const created = await api.crearConciliacion({ operacion_id, nombre, fecha_inicio, fecha_fin });
    await onRefreshConciliaciones();
    setActiveModule("conciliaciones");
    await loadItems(created.id, true);
  }

  async function createViaje() {
    setError("");
    if (
      !viajeForm.operacion_id ||
      !viajeForm.servicio_id ||
      !viajeForm.titulo.trim() ||
      !viajeForm.fecha_servicio ||
      (!isServicioConductorRelevo && !viajeForm.placa)
    ) {
      setError(
        isServicioConductorRelevo
          ? "Debes completar operación, tipo de servicio, título y mes."
          : "Debes completar operación, tipo de servicio, título, fecha y placa."
      );
      return;
    }

    if (isServicioHoraExtra && !viajeForm.hora_inicio) {
      setError("Para Hora Extra debes ingresar hora inicio (hora fin fija a las 06:00). ");
      return;
    }

    if (servicioRequiereOrigenDestino && (!viajeForm.origen.trim() || !viajeForm.destino.trim())) {
      setError("Debes completar origen y destino para este tipo de servicio.");
      return;
    }

    if (!isServicioViaje && shouldUseManualTarifa && !viajeForm.tarifa_tercero) {
      setError("No hay tarifa parametrizada para este servicio/tipo de vehículo. Ingresa tarifa manual.");
      return;
    }

    const payload = {
      operacion_id: Number(viajeForm.operacion_id),
      servicio_id: Number(viajeForm.servicio_id),
      titulo: viajeForm.titulo,
      fecha_servicio:
        isServicioConductorRelevo && viajeForm.fecha_servicio.length === 7
          ? `${viajeForm.fecha_servicio}-01`
          : viajeForm.fecha_servicio,
      origen: viajeForm.origen.trim() || undefined,
      destino: viajeForm.destino.trim() || undefined,
      placa: isServicioConductorRelevo ? "" : viajeForm.placa,
      hora_inicio: isServicioHoraExtra ? viajeForm.hora_inicio : undefined,
      conductor: isServicioHoraExtra || isServicioConductorRelevo ? undefined : (viajeForm.conductor || ""),
      tarifa_tercero:
        isServicioViaje || shouldUseManualTarifa
          ? Number(viajeForm.tarifa_tercero || 0)
          : undefined,
      tarifa_cliente:
        isServicioViaje || shouldUseManualTarifa
          ? Number(viajeForm.tarifa_cliente || 0)
          : undefined,
      descripcion: viajeForm.descripcion || "",
    };

    try {
      await api.crearViaje(payload);
      setViajeForm({
        operacion_id: "",
        servicio_id: "",
        titulo: "",
        fecha_servicio: "",
        origen: "",
        destino: "",
        placa: "",
        hora_inicio: "",
        conductor: "",
        tarifa_tercero: "",
        tarifa_cliente: "",
        descripcion: "",
      });
      setTarifaLookup(null);
      await loadViajes();
      setSaveResultModal({
        title: "Servicio cargado",
        description: "El servicio se registró correctamente.",
      });
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function editViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setViajeEditModal({ id: v.id, titulo: v.titulo, origen: v.origen, destino: v.destino });
  }

  async function onConfirmEditViaje() {
    if (!viajeEditModal) return;
    setError("");
    try {
      await api.editarViaje(viajeEditModal.id, {
        titulo: viajeEditModal.titulo.trim(),
        origen: viajeEditModal.origen.trim(),
        destino: viajeEditModal.destino.trim(),
      });
      await loadViajes();
      setViajeEditModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function deactivateViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "viaje", action: "inactivar", id: v.id });
  }

  async function reactivateViaje(v: Viaje) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "viaje", action: "reactivar", id: v.id });
  }

  async function editConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConciliacionEditModal({
      id: c.id,
      nombre: c.nombre,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
    });
  }

  async function onConfirmEditConciliacion() {
    if (!conciliacionEditModal) return;
    setError("");
    try {
      await api.editarConciliacion(conciliacionEditModal.id, {
        nombre: conciliacionEditModal.nombre.trim(),
        fecha_inicio: conciliacionEditModal.fecha_inicio.trim(),
        fecha_fin: conciliacionEditModal.fecha_fin.trim(),
      });
      await onRefreshConciliaciones();
      if (selectedConciliacion === conciliacionEditModal.id) {
        await loadItems(conciliacionEditModal.id);
      }
      setConciliacionEditModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function deactivateConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConfirmModal({
      entity: "conciliacion",
      action: "inactivar",
      id: c.id,
      clearSelectionOnSuccess: selectedConciliacion === c.id,
    });
  }

  async function reactivateConciliacion(c: Conciliacion) {
    if (!isCointraAdmin) return;
    setConfirmModal({ entity: "conciliacion", action: "reactivar", id: c.id });
  }

  async function onConfirmAction() {
    if (!confirmModal) return;
    setError("");
    try {
      if (confirmModal.entity === "viaje") {
        if (confirmModal.action === "inactivar") {
          await api.inactivarViaje(confirmModal.id);
        } else {
          await api.reactivarViaje(confirmModal.id);
        }
        await loadViajes();
        if (selected) {
          await loadItems(selected.id);
        }
      } else {
        if (confirmModal.action === "inactivar") {
          await api.inactivarConciliacion(confirmModal.id);
        } else {
          await api.reactivarConciliacion(confirmModal.id);
        }
        await onRefreshConciliaciones();
        if (confirmModal.clearSelectionOnSuccess) {
          setSelectedConciliacion(null);
          setItems([]);
        }
        await loadViajes();
      }
      setConfirmModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function attachPendingViajes() {
    if (!selected || selectedViajeIds.length === 0) return;

    if (selected.estado !== "BORRADOR") {
      setError("Solo puedes adjuntar viajes cuando la conciliacion esta en BORRADOR");
      return;
    }

    await api.adjuntarViajesConciliacion(selected.id, selectedViajeIds);
    await onRefreshConciliaciones();
    await loadItems(selected.id);
    await loadViajes();
  }

  async function removeViajeFromConciliacion(viajeId: number) {
    if (!selected) return;

    if (selected.estado !== "BORRADOR") {
      setError("Solo puedes quitar viajes cuando la conciliacion esta en BORRADOR");
      return;
    }

    setError("");
    try {
      await api.quitarViajeConciliacion(selected.id, viajeId);
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      await loadViajes();
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function crearLiquidacionContratoFijo() {
    if (!selected) return;
    setError("");

    const {
      periodo_inicio,
      periodo_fin,
      placa,
      valor_tercero,
    } = liquidacionContratoFijoForm;

    if (!periodo_inicio || !periodo_fin) {
      setError("Debes seleccionar el periodo de liquidación.");
      return;
    }
    if (!placa.trim()) {
      setError("Debes ingresar la placa para la liquidación.");
      return;
    }

    const valorTerceroNum = Number(valor_tercero || 0);
    if (!Number.isFinite(valorTerceroNum) || valorTerceroNum <= 0) {
      setError("Debes ingresar un valor tercero válido mayor a cero.");
      return;
    }

    setIsCreatingLiquidacionContratoFijo(true);
    try {
      await api.crearLiquidacionContratoFijo(selected.id, {
        periodo_inicio,
        periodo_fin,
        placas: [placa.trim().toUpperCase()],
        valor_tercero: valorTerceroNum,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      setLiquidacionContratoFijoForm({
        periodo_inicio,
        periodo_fin,
        placa: "",
        valor_tercero: "",
      });
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setIsCreatingLiquidacionContratoFijo(false);
    }
  }

  async function descargarConciliacionExcel() {
    if (!selected) return;
    setError("");
    setIsDownloadingExcel(true);
    try {
      const blob = await api.descargarConciliacionExcel(selected.id);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `conciliacion_${selected.id}_resumen.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setIsDownloadingExcel(false);
    }
  }

  async function eliminarRegistroLiquidacion(itemId: number) {
    if (!selected) return;
    setError("");
    setRemovingLiquidacionItemId(itemId);
    try {
      await api.eliminarRegistroLiquidacionContratoFijo(itemId);
      await onRefreshConciliaciones();
      await loadItems(selected.id);
    } catch (e) {
      setError(toSpanishError(e));
    } finally {
      setRemovingLiquidacionItemId(null);
    }
  }

  async function confirmarEliminarRegistroLiquidacion() {
    if (liquidacionItemDeleteConfirmId === null) return;
    await eliminarRegistroLiquidacion(liquidacionItemDeleteConfirmId);
    setLiquidacionItemDeleteConfirmId(null);
  }

  function editarRegistroLiquidacion(item: Item) {
    if (!selected || user.rol !== "COINTRA" || selected.estado !== "BORRADOR") return;
    setLiquidacionItemEditModal({
      id: item.id,
      placa: item.placa ?? "",
      tarifa_tercero: item.tarifa_tercero !== null && item.tarifa_tercero !== undefined ? String(item.tarifa_tercero) : "",
    });
  }

  async function onConfirmEditLiquidacionRegistro() {
    if (!liquidacionItemEditModal || !selected) return;
    const tarifaTerceroRaw = liquidacionItemEditModal.tarifa_tercero.trim();
    const tarifaTercero = tarifaTerceroRaw === "" ? null : Number(tarifaTerceroRaw);

    if (tarifaTerceroRaw !== "" && Number.isNaN(tarifaTercero)) {
      setError("Verifica los valores numéricos del registro.");
      return;
    }

    setError("");
    try {
      const updated = await api.patchConciliacionItem(liquidacionItemEditModal.id, {
        placa: liquidacionItemEditModal.placa.trim().toUpperCase() || null,
        tarifa_tercero: tarifaTercero,
      });
      setItems((prev) => prev.map((item) => (item.id === liquidacionItemEditModal.id ? updated : item)));
      await onRefreshConciliaciones();
      setLiquidacionItemEditModal(null);
    } catch (e) {
      setError(toSpanishError(e));
    }
  }

  async function guardarConciliacionBorrador() {
    if (!selected || selected.estado !== "BORRADOR") return;
    setError("");
    setIsSavingConciliacion(true);
    try {
      await api.guardarConciliacionBorrador(selected.id);
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      setSaveResultModal({
        title: "Conciliación guardada",
        description: "La conciliación se guardó correctamente y ya puedes enviarla a revisión.",
      });
    } catch (e) {
      const msg = toSpanishError(e);
      setError(msg);
      setSaveResultModal({
        title: "Error al guardar",
        description: msg,
      });
    } finally {
      setIsSavingConciliacion(false);
    }
  }

  function openViajeDetalle(item: Item) {
    if (!item.viaje_id) return;
    setSelectedViajeDetalle(item);
  }

  async function sendToReview() {
    if (!selected || user.rol !== "COINTRA") return;
    if (!selected.borrador_guardado) {
      setReviewError("Debes guardar la conciliación antes de enviarla a revisión.");
      return;
    }
    setReviewError("");
    setIsSendingReview(true);
    try {
      const observacion = `Destinatario: ${reviewRecipient || "(sin destinatario)"}\nMensaje: ${reviewMessage || "(sin mensaje)"}`;
      await api.enviarRevisionConciliacion(selected.id, {
        observacion,
        destinatario_email: reviewRecipient || undefined,
        mensaje: reviewMessage || undefined,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      await loadViajes();
      setShowReviewPanel(false);
      setReviewSuccessMessage("Correo enviado correctamente y usuario notificado en el sistema.");
      setReviewRecipient("");
      reviewRecipientDirtyRef.current = false;
      setReviewMessage("");
    } catch (e) {
      setReviewError(toSpanishError(e));
    } finally {
      setIsSendingReview(false);
    }
  }

  async function submitClientDecision() {
    if (!selected || !clientDecisionModal || user.rol !== "CLIENTE") return;

    const shouldApproveAll = clientDecisionModal.action === "aprobar";
    if (shouldApproveAll && !allClientItemsChecked) {
      setClientDecisionError("Para autorizar debes marcar como aprobados todos los registros de la conciliación (contrato fijo y demás servicios).");
      return;
    }

    if (!shouldApproveAll && !clientDecisionModal.observacion.trim()) {
      setClientDecisionError("Debes escribir observaciones para devolver la conciliación.");
      return;
    }

    if (!shouldApproveAll && allClientItemsChecked) {
      setClientDecisionError("No puedes devolver la conciliación si todos los registros están aprobados.");
      return;
    }

    if (shouldApproveAll && !clientDecisionModal.enviarCorreo) {
      setClientDecisionError("Al aprobar la conciliación es obligatorio enviar el correo de autorización.");
      return;
    }

    if (shouldApproveAll && !clientDecisionModal.destinatario.trim()) {
      setClientDecisionError("Debes indicar el correo destinatario para la autorización.");
      return;
    }

    if (shouldApproveAll && clientDecisionModal.enviarCorreo && !clientDecisionModal.poNumero.trim()) {
      setClientDecisionError("Debes registrar el número de PO para autorizar y notificar la conciliación.");
      return;
    }

    setClientDecisionError("");
    try {
      for (const item of itemsClienteRevision) {
        const nextApproved = !!clientItemSelections[item.id];
        const nextEstado = nextApproved ? "APROBADO" : "RECHAZADO";
        if (item.estado !== nextEstado) {
          await api.decidirItemCliente(item.id, {
            estado: nextEstado,
            comentario: !nextApproved ? clientDecisionModal.observacion : undefined,
          });
        }
      }

      const payload = {
        observacion: clientDecisionModal.observacion || undefined,
        destinatario_email:
          clientDecisionModal.enviarCorreo && clientDecisionModal.destinatario.trim()
            ? clientDecisionModal.destinatario.trim()
            : undefined,
        mensaje:
          clientDecisionModal.enviarCorreo && clientDecisionModal.mensaje.trim()
            ? clientDecisionModal.mensaje.trim()
            : undefined,
        po_numero:
          shouldApproveAll && clientDecisionModal.poNumero.trim()
            ? clientDecisionModal.poNumero.trim()
            : undefined,
      };

      if (shouldApproveAll) {
        await api.aprobarConciliacionCliente(selected.id, payload);
        setReviewSuccessMessage("Autorización confirmada y conciliación aprobada.");
      } else {
        await api.devolverConciliacionCliente(selected.id, payload);
        setReviewSuccessMessage("Conciliación devuelta a Cointra con observaciones.");
      }

      await onRefreshConciliaciones();
      await loadItems(selected.id);
      await loadViajes();
      setClientDecisionModal(null);
      setClientDecisionError("");
    } catch (e) {
      setClientDecisionError(toSpanishError(e));
    }
  }

  async function sendToFacturacion() {
    if (!selected || user.rol !== "COINTRA") return;

    setFacturacionError("");
    setIsSendingFacturacion(true);
    try {
      await api.enviarFacturacionConciliacion(selected.id, {
        destinatario_email: facturacionRecipient || undefined,
        mensaje: facturacionMessage || undefined,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      setFacturacionPanelOpen(false);
      setFacturacionRecipient("");
      setFacturacionMessage("");
      setReviewSuccessMessage("Conciliación enviada a facturación con archivo Excel adjunto por correo.");
    } catch (e) {
      setFacturacionError(toSpanishError(e));
    } finally {
      setIsSendingFacturacion(false);
    }
  }

  async function sendFacturaToCliente() {
    if (!selected || user.rol !== "COINTRA") return;
    if (!facturaClienteFile) {
      setFacturaClienteError("Debes adjuntar el PDF de la factura.");
      return;
    }
    if (!facturaClienteFile.name.toLowerCase().endsWith(".pdf")) {
      setFacturaClienteError("El archivo adjunto debe estar en formato PDF.");
      return;
    }

    setFacturaClienteError("");
    setIsSendingFacturaCliente(true);
    try {
      await api.enviarFacturaClienteConciliacion(selected.id, {
        destinatario_email: facturaClienteRecipient || undefined,
        mensaje: facturaClienteMessage || undefined,
        archivo_factura: facturaClienteFile,
      });
      await onRefreshConciliaciones();
      await loadItems(selected.id);
      setFacturaClientePanelOpen(false);
      setFacturaClienteRecipient("");
      setFacturaClienteMessage("");
      setFacturaClienteFile(null);
      setReviewSuccessMessage("Factura enviada al cliente con PDF adjunto. La conciliación quedó en estado FACTURADO.");
    } catch (e) {
      setFacturaClienteError(toSpanishError(e));
    } finally {
      setIsSendingFacturaCliente(false);
    }
  }

  async function patchItemAndSync(
    itemId: number,
    payload: {
      placa?: string | null;
      manifiesto_numero?: string | null;
      tarifa_tercero?: number | null;
      tarifa_cliente?: number | null;
      rentabilidad?: number | null;
    }
  ) {
    const updated = await api.patchConciliacionItem(itemId, payload);
    setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    await onRefreshConciliaciones();
  }

  async function patchLiquidacionItemAndSync(
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
  ) {
    const updated = await api.patchConciliacionItem(itemId, payload);
    setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    await onRefreshConciliaciones();
  }

  useEffect(() => {
    if (activeModule === "viajes") {
      void loadViajes();
      void loadVehiculosData();
    }
    if (activeModule === "conciliaciones") {
      void loadVehiculosData();
    }
  }, [activeModule]);

  return (
    <div className="space-y-6">
      {activeModule === "viajes" && (
        <>
          <section className="w-full rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-white/90 p-2 shadow-sm">
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
                Modulo Viajes/Adicionales
              </button>
              <button
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => setActiveModule("conciliaciones")}
              >
                Modulo Conciliaciones
              </button>
            </div>
            {user.rol !== "CLIENTE" ? (
            <div className="min-w-0">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Cargar viaje/adicional</h3>
              <form
                onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  await createViaje();
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
                      value={viajeForm.operacion_id}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, operacion_id: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione...</option>
                      {operacionesActivas.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Tipo de servicio
                    </label>
                    <select
                      name="servicio_id"
                      required
                      value={viajeForm.servicio_id}
                      onChange={(e) =>
                        setViajeForm((prev) => ({
                          ...prev,
                          servicio_id: e.target.value,
                          origen: "",
                          destino: "",
                          placa: "",
                          conductor: "",
                          hora_inicio: "",
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione...</option>
                      {serviciosActivos.map((servicio) => (
                        <option key={servicio.id} value={servicio.id}>
                          {servicio.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Título del servicio
                    </label>
                    <input
                      name="titulo"
                      required
                      value={viajeForm.titulo}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      placeholder="Ej. Urbano Montevideo"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      {isServicioConductorRelevo ? "Mes" : "Fecha"}
                    </label>
                    <input
                      name="fecha_servicio"
                      type={isServicioConductorRelevo ? "month" : "date"}
                      required
                      max={isServicioConductorRelevo ? maxMonth : maxDate}
                      value={fechaServicioInputValue}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, fecha_servicio: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  {!isServicioConductorRelevo && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Placa
                    </label>
                    <select
                      name="placa"
                      required
                      value={viajeForm.placa}
                      onChange={(e) => setViajeForm((prev) => ({ ...prev, placa: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Seleccione un vehículo...</option>
                      {vehiculosActivos.map((v) => (
                        <option key={v.id} value={v.placa}>
                          {v.placa}
                        </option>
                      ))}
                    </select>
                    {viajeForm.placa && (
                      <p className="mt-1 text-xs text-neutral">
                        Tipo de vehículo:{" "}
                        <span className="font-medium text-slate-900">
                          {(() => {
                            const vehiculo = vehiculosActivos.find((v) => v.placa === viajeForm.placa);
                            if (!vehiculo) return "Sin información";
                            const tipo = tiposVehiculoActivos.find((t) => t.id === vehiculo.tipo_vehiculo_id);
                            return tipo?.nombre ?? "Sin información";
                          })()}
                        </span>
                      </p>
                    )}
                  </div>
                  )}

                  {servicioRequiereOrigenDestino && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Origen
                        </label>
                        <input
                          name="origen"
                          required
                          value={viajeForm.origen}
                          onChange={(e) => setViajeForm((prev) => ({ ...prev, origen: e.target.value }))}
                          placeholder="Origen"
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
                          value={viajeForm.destino}
                          onChange={(e) => setViajeForm((prev) => ({ ...prev, destino: e.target.value }))}
                          placeholder="Destino"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                    </>
                  )}

                  {!isServicioHoraExtra && !isServicioConductorRelevo && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Conductor (opcional)
                      </label>
                      <input
                        name="conductor"
                        value={viajeForm.conductor}
                        onChange={(e) => setViajeForm((prev) => ({ ...prev, conductor: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  )}

                  {isServicioHoraExtra && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Hora inicio
                        </label>
                        <input
                          name="hora_inicio"
                          type="time"
                          required
                          value={viajeForm.hora_inicio}
                          onChange={(e) => setViajeForm((prev) => ({ ...prev, hora_inicio: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Hora fin
                        </label>
                        <input
                          type="time"
                          value="06:00"
                          disabled
                          className="w-full rounded-lg border border-border bg-slate-100 px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none"
                        />
                      </div>
                      <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Resumen Hora Extra</p>
                        <p className="mt-1 text-sm text-sky-900">
                          Horas a cobrar: <span className="font-semibold">{horasExtraCalculadas > 0 ? horasExtraCalculadas.toFixed(2) : "0.00"}</span>
                        </p>
                        {horasExtraCalculadas > 0 && (tarifaHoraTercero > 0 || tarifaHoraCliente > 0) && (
                          <p className="mt-1 text-sm text-sky-900">
                            <>Total tercero estimado: <span className="font-semibold">{formatCOP(totalHoraExtraTercero)}</span>{user.rol === "COINTRA" ? " · " : ""}</>
                            {user.rol !== "TERCERO" && (
                              <>Total cliente estimado: <span className="font-semibold">{formatCOP(totalHoraExtraCliente)}</span></>
                            )}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {isServicioViaje || shouldUseManualTarifa ? (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          {shouldUseManualTarifa ? "Tarifa Tercero (manual)" : "Tarifa Tercero"}
                        </label>
                        <input
                          name="tarifa_tercero"
                          type="number"
                          required
                          value={viajeForm.tarifa_tercero}
                          onChange={(e) =>
                            setViajeForm((prev) => ({ ...prev, tarifa_tercero: e.target.value }))
                          }
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
                            value={viajeForm.tarifa_cliente}
                            onChange={(e) =>
                              setViajeForm((prev) => ({ ...prev, tarifa_cliente: e.target.value }))
                            }
                            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      )}
                      {shouldUseManualTarifa && (
                        <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                          No hay tarifa parametrizada en catálogo para este servicio y tipo de vehículo. Puedes registrar tarifa manual para este caso.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Tarifa parametrizada</p>
                      <div className="mt-1 text-sm text-emerald-900">
                        {tarifaLookup ? (
                          <>
                            {user.rol === "TERCERO" && <>Tarifa tercero: {formatCOP(tarifaLookup.tarifa_tercero ?? tarifaLookup.tarifa)}</>}
                            {user.rol === "COINTRA" && (
                              <>
                                Tarifa cliente: {formatMoney(tarifaLookup.tarifa_cliente ?? tarifaLookup.tarifa)} · Tarifa tercero: {formatMoney(tarifaLookup.tarifa_tercero ?? 0)} · Rentabilidad: {(tarifaLookup.rentabilidad_pct ?? 0).toFixed(1)}%
                              </>
                            )}
                          </>
                        ) : (
                          <span>Selecciona un servicio y una placa con tarifa configurada en el catálogo.</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Descripción
                    </label>
                    <input
                      name="descripcion"
                      value={viajeForm.descripcion}
                      onChange={(e) =>
                        setViajeForm((prev) => ({ ...prev, descripcion: e.target.value }))
                      }
                      placeholder="Observaciones del servicio"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Guardar servicio
                </button>
              </form>
            </div>
            ) : (
              <p className="text-sm text-neutral">Selecciona el módulo y consulta el listado de servicios en el contenedor inferior.</p>
            )}
          </section>

            <section className="w-full rounded-2xl border border-border bg-white/90 p-5 shadow-sm outline-none">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Servicios cargados</h3>
                <div className="flex flex-1 items-center justify-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      ["TODOS", `Total servicios (${viajeStatusCounts.TODOS})`],
                      ["PENDIENTE", `Servicios pendientes (${viajeStatusCounts.PENDIENTE})`],
                      ["EN_REVISION", `Servicios en revisión (${viajeStatusCounts.EN_REVISION})`],
                      ["CONCILIADO", `Servicios conciliados (${viajeStatusCounts.CONCILIADO})`],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFiltroEstadoViaje(value as "TODOS" | "PENDIENTE" | "EN_REVISION" | "CONCILIADO")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          filtroEstadoViaje === value
                            ? "bg-emerald-600 text-white"
                            : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltrosTablaViajes({
                        titulo: "",
                        servicio: "",
                        operacion: "",
                        ruta: "",
                        placa: "",
                        estado: "",
                        activo: "",
                        conciliacion: "",
                      })
                    }
                    className="ml-auto inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1320px] border-collapse text-[13px] [&_th]:align-top [&_td]:align-top">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="w-[3%] border-b border-border px-2 py-2 text-left">ID</th>
                      <th className="w-[6%] border-b border-border px-2 py-2 text-left">Fecha</th>
                      <th className="w-[9%] border-b border-border px-2 py-2 text-left">Título</th>
                      <th className="w-[7%] border-b border-border px-2 py-2 text-left">Servicio</th>
                      <th className="w-[8%] border-b border-border px-2 py-2 text-left">Operación</th>
                      <th className="w-[10%] border-b border-border px-2 py-2 text-left">Ruta</th>
                      <th className="w-[5%] border-b border-border px-2 py-2 text-left">Placa</th>
                      <th className="w-[6%] border-b border-border px-2 py-2 text-left">Estado</th>
                      {isCointraAdmin && (
                        <th className="w-[4%] border-b border-border px-2 py-2 text-left">Activo</th>
                      )}
                      <th className="w-[9%] border-b border-border px-2 py-2 text-left">Conciliación</th>
                      {user.rol !== "CLIENTE" && (
                        <th className="w-[6%] border-b border-border px-2 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="w-[6%] border-b border-border px-2 py-2 text-left">Tarifa Cliente</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="w-[6%] border-b border-border px-2 py-2 text-left">Ganancia Cointra</th>
                      )}
                      {isCointraAdmin && (
                        <th className="w-[8%] border-b border-border px-2 py-2 text-left">Acciones</th>
                      )}
                    </tr>
                    <tr className="bg-white text-xs text-slate-600">
                      <th className="border-b border-border px-3 py-1.5" />
                      <th className="border-b border-border px-3 py-1.5" />
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.titulo}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, titulo: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.servicio}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, servicio: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.operacion}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, operacion: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.ruta}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, ruta: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.placa}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, placa: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.estado}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, estado: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      {isCointraAdmin && (
                        <th className="border-b border-border px-3 py-1.5">
                          <input
                            value={filtrosTablaViajes.activo}
                            onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, activo: e.target.value }))}
                            placeholder="si/no"
                            className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                          />
                        </th>
                      )}
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaViajes.conciliacion}
                          onChange={(e) => setFiltrosTablaViajes((prev) => ({ ...prev, conciliacion: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      {user.rol !== "CLIENTE" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol !== "TERCERO" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol === "COINTRA" && <th className="border-b border-border px-3 py-1.5" />}
                      {isCointraAdmin && <th className="border-b border-border px-3 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {viajesFiltradosPaginados.map((v) => (
                      <tr key={v.id} className="border-b border-border last:border-0">
                        {(() => {
                          const estadoVisible = getEstadoVisibleViaje(v);
                          const conc = v.conciliacion_id ? conciliacionById.get(v.conciliacion_id) : undefined;
                          const estadoClass =
                            estadoVisible === "CONCILIADO"
                              ? "bg-success/10 text-success"
                              : estadoVisible === "EN REVISIÓN"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600";
                          return (
                            <>
                        <td className="px-2 py-2 whitespace-nowrap">{v.id}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{v.fecha_servicio}</td>
                        <td className="px-2 py-2 max-w-[150px] truncate" title={v.titulo}>{v.titulo}</td>
                        <td className="px-2 py-2 max-w-[130px] truncate" title={v.servicio_nombre ?? "Viaje"}>{v.servicio_nombre ?? "Viaje"}</td>
                        <td className="px-2 py-2 max-w-[170px] truncate" title={operacionById.get(v.operacion_id)?.nombre ?? `Operación #${v.operacion_id}`}>
                          {operacionById.get(v.operacion_id)?.nombre ?? `Operación #${v.operacion_id}`}
                        </td>
                        <td className="px-2 py-2 max-w-[220px] truncate" title={`${v.origen} - ${v.destino}`}>
                          {v.origen} - {v.destino}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{v.placa}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoClass}`}>
                            {estadoVisible}
                          </span>
                        </td>
                        {isCointraAdmin && (
                          <td className="px-2 py-2 whitespace-nowrap">{v.activo ? "Sí" : "No"}</td>
                        )}
                        <td className="px-2 py-2 max-w-[180px] truncate">
                          {v.conciliacion_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModule("conciliaciones");
                                void loadItems(v.conciliacion_id as number, true);
                              }}
                              className="inline-block max-w-[170px] truncate text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                              title={conc ? `${conc.nombre} (#${conc.id})` : `Conciliación #${v.conciliacion_id}`}
                            >
                              {conc ? `${conc.nombre} (#${conc.id})` : `Conciliación #${v.conciliacion_id}`}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        {user.rol !== "CLIENTE" && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatMoney(v.tarifa_tercero)}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatMoney(v.tarifa_cliente)}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatMoney(getGananciaCointra(v.tarifa_cliente, v.tarifa_tercero))}
                          </td>
                        )}
                        {isCointraAdmin && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void editViaje(v)}
                                className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              {v.activo && (
                                <button
                                  type="button"
                                  onClick={() => void deactivateViaje(v)}
                                  className="rounded-full border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                                >
                                  Inactivar
                                </button>
                              )}
                              {!v.activo && (
                                <button
                                  type="button"
                                  onClick={() => void reactivateViaje(v)}
                                  className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20"
                                >
                                  Reactivar
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-neutral">
                  Mostrando {viajesFiltradosPaginados.length} de {viajesFiltrados.length} servicios filtrados.
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setServiciosPage(1)}
                    disabled={serviciosPageSafe === 1}
                    className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Inicio
                  </button>
                  {visibleServiciosPages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setServiciosPage(pageNumber)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
                        pageNumber === serviciosPageSafe
                          ? "bg-emerald-600 text-white"
                          : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setServiciosPage(totalServiciosPages)}
                    disabled={serviciosPageSafe === totalServiciosPages}
                    className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Final
                  </button>
                </div>
              </div>
            </section>
        </>
      )}

      {activeModule === "conciliaciones" && (
        <>
          <section className="w-full rounded-2xl border border-border bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-white/90 p-2 shadow-sm">
              <button
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => {
                  setActiveModule("viajes");
                  void loadViajes();
                }}
              >
                Modulo Viajes/Adicionales
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
            </div>
            {user.rol === "COINTRA" ? (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-slate-900">Nueva conciliación</h3>
                <form
                  onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    try {
                      setError("");
                      await createConciliacion(new FormData(form));
                      form.reset();
                    } catch (err) {
                      setError(toSpanishError(err));
                    }
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
                        {operacionesActivas.map((op) => (
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
              </div>
            ) : (
              <p className="text-sm text-neutral">Selecciona una conciliación desde el listado inferior para revisar su detalle.</p>
            )}
          </section>

            <section
              id="lista-conciliaciones"
              ref={conciliacionesListRef}
              tabIndex={-1}
              className="w-full rounded-2xl border border-border bg-white/90 p-5 shadow-sm outline-none"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Conciliaciones</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    ["TODOS", `Todos (${conciliacionStatusCounts.TODOS})`],
                    ["BORRADOR", `Borrador (${conciliacionStatusCounts.BORRADOR})`],
                    ["EN_REVISION", `En revisión (${conciliacionStatusCounts.EN_REVISION})`],
                    ["APROBADA", `Aprobada (${conciliacionStatusCounts.APROBADA})`],
                    ["ENVIADA_A_FACTURAR", `Enviada a facturar (${conciliacionStatusCounts.ENVIADA_A_FACTURAR})`],
                    ["FACTURADO", `Facturado (${conciliacionStatusCounts.FACTURADO})`],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setFiltroEstadoConciliacion(
                          value as "TODOS" | "BORRADOR" | "EN_REVISION" | "APROBADA" | "ENVIADA_A_FACTURAR"
                          | "FACTURADO"
                        )
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        filtroEstadoConciliacion === value
                          ? "bg-emerald-600 text-white"
                          : "border border-border bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <input
                  value={filtroConciliacionId}
                  onChange={(e) => setFiltroConciliacionId(e.target.value)}
                  placeholder="Filtrar por número"
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <input
                  value={filtroConciliacionNombre}
                  onChange={(e) => setFiltroConciliacionNombre(e.target.value)}
                  placeholder="Filtrar por nombre"
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <select
                  value={filtroOperacionId}
                  onChange={(e) => setFiltroOperacionId(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Todas las operaciones</option>
                  {operacionesActivas.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={filtroConciliacionCreadaDesde}
                  onChange={(e) => setFiltroConciliacionCreadaDesde(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  title="Creada desde"
                />
                <input
                  type="date"
                  value={filtroConciliacionCreadaHasta}
                  onChange={(e) => setFiltroConciliacionCreadaHasta(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  title="Creada hasta"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFiltroConciliacionId("");
                    setFiltroConciliacionNombre("");
                    setFiltroOperacionId("");
                    setFiltroConciliacionCreadaDesde("");
                    setFiltroConciliacionCreadaHasta("");
                    setFiltroEstadoConciliacion("TODOS");
                  }}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-left">ID</th>
                      <th className="border-b border-border px-3 py-2 text-left">Nombre</th>
                      <th className="border-b border-border px-3 py-2 text-left">Operación</th>
                      <th className="border-b border-border px-3 py-2 text-left">Cliente</th>
                      <th className="border-b border-border px-3 py-2 text-left">Tercero</th>
                      <th className="border-b border-border px-3 py-2 text-left">Creada por</th>
                      <th className="border-b border-border px-3 py-2 text-left">Estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Valor</th>
                      <th className="border-b border-border px-3 py-2 text-left">Usuario estado</th>
                      <th className="border-b border-border px-3 py-2 text-left">Periodo</th>
                      <th className="border-b border-border px-3 py-2 text-left">Creada</th>
                      {isCointraAdmin && (
                        <th className="border-b border-border px-3 py-2 text-left">Activo</th>
                      )}
                      <th className="border-b border-border px-3 py-2 text-left">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacionesFiltradas.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{c.id}</td>
                        <td className="px-3 py-2">{c.nombre}</td>
                        <td className="px-3 py-2">{operacionById.get(c.operacion_id)?.nombre ?? `Operación #${c.operacion_id}`}</td>
                        <td className="px-3 py-2">{c.cliente_nombre ?? "-"}</td>
                        <td className="px-3 py-2">{c.tercero_nombre ?? "-"}</td>
                        <td className="px-3 py-2">{c.creador_nombre ?? `Usuario #${c.created_by}`}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getConciliacionEstadoClasses(c)}`}>
                            {getConciliacionEstadoLabel(c).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">{getConciliacionValorCell(c)}</td>
                        <td className="px-3 py-2">{c.estado_actualizado_por_nombre ?? "-"}</td>
                        <td className="px-3 py-2">
                          {c.fecha_inicio} - {c.fecha_fin}
                        </td>
                        <td className="px-3 py-2">{c.created_at?.slice(0, 10) ?? "-"}</td>
                        {isCointraAdmin && <td className="px-3 py-2">{c.activo ? "Sí" : "No"}</td>}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => loadItems(c.id, true)}
                              className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              Ver items
                            </button>
                            {isCointraAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void editConciliacion(c)}
                                  className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                                >
                                  Editar
                                </button>
                                {c.activo && (
                                  <button
                                    type="button"
                                    onClick={() => void deactivateConciliacion(c)}
                                    className="inline-flex items-center rounded-full border border-danger/40 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger shadow-sm hover:bg-danger/10"
                                  >
                                    Inactivar
                                  </button>
                                )}
                                {!c.activo && (
                                  <button
                                    type="button"
                                    onClick={() => void reactivateConciliacion(c)}
                                    className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success shadow-sm hover:bg-success/20"
                                  >
                                    Reactivar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

      {selected && (
        <section
          ref={selectedConciliacionRef}
          className={`w-full space-y-6 rounded-2xl border bg-white/90 p-5 shadow-sm transition-all duration-300 ${
            highlightSelectedConciliacion ? "border-emerald-300 ring-4 ring-emerald-100" : "border-border"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Conciliación</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {selected.nombre} ({totalServiciosConciliacion} servicios)
              </h2>
              <p className="mt-1 text-sm text-neutral">
                #{selected.id} · {selected.fecha_inicio} a {selected.fecha_fin}
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-800">
                Operación: {operacionById.get(selected.operacion_id)?.nombre ?? `Operación #${selected.operacion_id}`}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Cliente: {selected.cliente_nombre ?? "-"} · Tercero: {selected.tercero_nombre ?? "-"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Creada por: {selected.creador_nombre ?? `Usuario #${selected.created_by}`}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Estado actualizado por: {selected.estado_actualizado_por_nombre ?? "-"}
              </p>
              <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-2 xl:grid-cols-6">
                <p><span className="font-semibold">Creada:</span> {formatTimelineDate(selected.fecha_creacion ?? selected.created_at)}</p>
                <p><span className="font-semibold">Enviada a revisión:</span> {formatTimelineDate(selected.fecha_envio_revision)}</p>
                <p><span className="font-semibold">Aprobada:</span> {formatTimelineDate(selected.fecha_aprobacion)}</p>
                <p><span className="font-semibold">Rechazada:</span> {formatTimelineDate(selected.fecha_rechazo)}</p>
                <p><span className="font-semibold">Enviada a facturar:</span> {formatTimelineDate(selected.fecha_envio_facturacion)}</p>
                <p><span className="font-semibold">Facturada:</span> {formatTimelineDate(selected.fecha_facturado)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void descargarConciliacionExcel()}
                disabled={selected.estado === "BORRADOR"}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                title={
                  selected.estado === "BORRADOR"
                    ? "La descarga se habilita desde EN_REVISION"
                    : "Descargar conciliación en Excel"
                }
              >
                <img src={excelLogo} alt="Excel" className="h-5 w-5" />
                Descargar
              </button>
              <span className={`inline-flex rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-sm ${getConciliacionEstadoClasses(selected)}`}>
                {getConciliacionEstadoLabel(selected).split("_").join(" ")}
              </span>
            </div>
          </div>

          {user.rol === "COINTRA" && pendingViajes.length > 0 && (
            <>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  Servicios pendientes por conciliar
                </h3>
                <p className="text-xs text-neutral">
                  {pendingViajes.length} servicios pendientes en la operación
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral">
                  Selecciona los servicios que deseas adjuntar a esta conciliación.
                </span>
                <button
                  type="button"
                  onClick={attachPendingViajes}
                  disabled={selectedViajeIds.length === 0}
                  className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Adjuntar seleccionados ({selectedViajeIds.length})
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-neutral">
                      <th className="border-b border-border px-3 py-2 text-center" />
                      <th className="border-b border-border px-3 py-2 text-center">ID</th>
                      <th className="border-b border-border px-3 py-2 text-center">Título servicio</th>
                      <th className="border-b border-border px-3 py-2 text-center">Operación</th>
                      <th className="border-b border-border px-3 py-2 text-center">Tipo servicio</th>
                      <th className="border-b border-border px-3 py-2 text-center">Fecha</th>
                      <th className="border-b border-border px-3 py-2 text-center">Ruta</th>
                      <th className="border-b border-border px-3 py-2 text-center">Placa</th>
                      <th className="border-b border-border px-3 py-2 text-center">Tarifa tercero</th>
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
                        <td className="px-3 py-2">{v.titulo || "-"}</td>
                        <td className="px-3 py-2">{selectedOperacion?.nombre ?? `Operación #${selected.operacion_id}`}</td>
                        <td className="px-3 py-2">{v.servicio_nombre || v.servicio_codigo || "-"}</td>
                        <td className="px-3 py-2">{v.fecha_servicio}</td>
                        <td className="px-3 py-2">
                          {v.origen} - {v.destino}
                        </td>
                        <td className="px-3 py-2">{v.placa}</td>
                        <td className="px-3 py-2">{formatMoney(v.tarifa_tercero)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              Servicios en esta conciliación
            </h3>
            <p className="text-xs text-neutral">
              Listado de servicios asociados a la conciliación #{selected.id}.
            </p>
          </div>
          {((user.rol === "COINTRA" && selected.estado === "BORRADOR") || itemsLiquidacion.length > 0) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Liquidación Contrato Fijo</p>
                  <p className="text-xs text-neutral">
                    {user.rol === "COINTRA" && selected.estado === "BORRADOR"
                      ? "Agrega registros de placa y valor dentro de esta conciliación."
                      : "Registros de contrato fijo asociados a esta conciliación."}
                  </p>
                </div>
                {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                  <button
                    type="button"
                    onClick={() => setShowLiquidacionContratoFijoPanel((prev) => !prev)}
                    className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    Agregar Liquidación Contrato Fijo
                  </button>
                )}
              </div>

              {((showLiquidacionContratoFijoPanel || itemsLiquidacion.length > 0) || !(user.rol === "COINTRA" && selected.estado === "BORRADOR")) && (
                <div className="mt-3 space-y-3">
                  {user.rol === "COINTRA" && selected.estado === "BORRADOR" && showLiquidacionContratoFijoPanel && (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Periodo inicio</label>
                          <input
                            type="date"
                            value={liquidacionContratoFijoForm.periodo_inicio}
                            onChange={(e) =>
                              setLiquidacionContratoFijoForm((prev) => ({ ...prev, periodo_inicio: e.target.value }))
                            }
                            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Periodo fin</label>
                          <input
                            type="date"
                            value={liquidacionContratoFijoForm.periodo_fin}
                            onChange={(e) =>
                              setLiquidacionContratoFijoForm((prev) => ({ ...prev, periodo_fin: e.target.value }))
                            }
                            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Placa</label>
                          <select
                            value={liquidacionContratoFijoForm.placa}
                            onChange={(e) =>
                              setLiquidacionContratoFijoForm((prev) => ({ ...prev, placa: e.target.value }))
                            }
                            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          >
                            <option value="">Selecciona una placa del tercero</option>
                            {vehiculosOperacionTercero.map((vehiculo) => (
                              <option key={vehiculo.id} value={vehiculo.placa}>
                                {vehiculo.placa}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">Valor tercero</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={liquidacionContratoFijoForm.valor_tercero}
                            onChange={(e) =>
                              setLiquidacionContratoFijoForm((prev) => ({ ...prev, valor_tercero: e.target.value }))
                            }
                            placeholder="Ej. 150000"
                            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void crearLiquidacionContratoFijo()}
                          disabled={isCreatingLiquidacionContratoFijo}
                          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {isCreatingLiquidacionContratoFijo ? "Guardando..." : "Agregar registro"}
                        </button>
                      </div>
                    </>
                  )}

                  {itemsLiquidacion.length === 0 ? (
                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                      <p className="text-xs text-neutral">Aún no hay registros de contrato fijo en esta conciliación.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-indigo-50 text-indigo-900">
                              {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                                <th className="border-b border-indigo-100 px-2 py-1 text-left">
                                  <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-indigo-900">
                                    <input
                                      type="checkbox"
                                      checked={allClientItemsLiquidacionChecked}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setClientItemSelections((prev) => {
                                          const next = { ...prev };
                                          for (const it of itemsLiquidacion) {
                                            next[it.id] = checked;
                                          }
                                          return next;
                                        });
                                      }}
                                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                                    />
                                    Aprobar todos
                                  </label>
                                </th>
                              )}
                              <th className="border-b border-indigo-100 px-2 py-1 text-left">Placa</th>
                              <th className="border-b border-indigo-100 px-2 py-1 text-left">Configuración vehículo</th>
                              <th className="border-b border-indigo-100 px-2 py-1 text-left">Tipo</th>
                              <th className="border-b border-indigo-100 px-2 py-1 text-left">Estado</th>
                              {user.rol !== "CLIENTE" && (
                                <th className="border-b border-indigo-100 px-2 py-1 text-left">Valor tercero</th>
                              )}
                              {user.rol !== "TERCERO" && (
                                <th className="border-b border-indigo-100 px-2 py-1 text-left">Valor cliente</th>
                              )}
                              {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                                <th className="border-b border-indigo-100 px-2 py-1 text-left">Acción</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {itemsLiquidacion.map((item) => (
                              <tr key={item.id} className="border-b border-indigo-50 last:border-0">
                                {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                                  <td className="px-2 py-1 text-center">
                                    <input
                                      type="checkbox"
                                      checked={!!clientItemSelections[item.id]}
                                      onChange={(e) =>
                                        setClientItemSelections((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.checked,
                                        }))
                                      }
                                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                                    />
                                  </td>
                                )}
                                <td className="px-2 py-1">
                                  {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                    <EditableCell
                                      initialValue={item.placa ?? ""}
                                      onSave={async (val) => {
                                        await patchLiquidacionItemAndSync(item.id, {
                                          placa: val.trim().toUpperCase() || null,
                                        });
                                      }}
                                      placeholder="Placa"
                                      className="w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                    />
                                  ) : (
                                    item.placa ?? "-"
                                  )}
                                </td>
                                <td className="px-2 py-1">{getConfiguracionVehiculoByPlaca(item.placa)}</td>
                                <td className="px-2 py-1">{item.liquidacion_es_relevo ? "Conductor relevo" : "Contrato fijo"}</td>
                                <td className="px-2 py-1">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                      item.estado === "RECHAZADO"
                                        ? "bg-red-100 text-red-700"
                                        : item.estado === "APROBADO"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {item.estado.toUpperCase()}
                                  </span>
                                </td>
                                {user.rol !== "CLIENTE" && (
                                  <td className="px-2 py-1">
                                    {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                      <EditableCell
                                        initialValue={String(item.tarifa_tercero ?? "")}
                                        type="number"
                                        onSave={async (val) => {
                                          await patchLiquidacionItemAndSync(item.id, {
                                            tarifa_tercero: Number(val),
                                          });
                                        }}
                                        placeholder="0"
                                        helperText={
                                          item.tarifa_tercero !== null && item.tarifa_tercero !== undefined
                                            ? `Actual: ${formatCOP(item.tarifa_tercero)}`
                                            : "Actual: -"
                                        }
                                        className="w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                      />
                                    ) : (
                                      formatCOP(item.tarifa_tercero)
                                    )}
                                  </td>
                                )}
                                {user.rol !== "TERCERO" && (
                                  <td className="px-2 py-1">
                                    {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                      <EditableCell
                                        initialValue={String(item.tarifa_cliente ?? "")}
                                        type="number"
                                        onSave={async (val) => {
                                          await patchLiquidacionItemAndSync(item.id, {
                                            tarifa_cliente: Number(val),
                                          });
                                        }}
                                        placeholder="0"
                                        helperText={
                                          item.tarifa_cliente !== null && item.tarifa_cliente !== undefined
                                            ? `Actual: ${formatCOP(item.tarifa_cliente)}`
                                            : "Actual: -"
                                        }
                                        className="w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                      />
                                    ) : (
                                      formatCOP(item.tarifa_cliente)
                                    )}
                                  </td>
                                )}
                                {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                                  <td className="px-2 py-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => editarRegistroLiquidacion(item)}
                                        className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLiquidacionItemDeleteConfirmId(item.id)}
                                        disabled={removingLiquidacionItemId === item.id}
                                        className="inline-flex items-center rounded-full border border-danger/30 bg-white px-2 py-1 text-[10px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                                      >
                                        {removingLiquidacionItemId === item.id ? "Eliminando..." : "Eliminar"}
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-indigo-900">
                        {user.rol !== "CLIENTE" && (
                          <span>Valor tercero: {formatCOP(liquidacionResumen.tarifaTercero)}</span>
                        )}
                        {user.rol !== "TERCERO" && (
                          <span>Valor cliente: {formatCOP(liquidacionResumen.tarifaCliente)}</span>
                        )}
                        {user.rol === "COINTRA" && (
                          <>
                            <span>Rentabilidad: {liquidacionResumen.rentabilidadPct.toFixed(1)}%</span>
                            <span>Ganancia Cointra: {formatMoney(liquidacionResumen.gananciaCointra)}</span>
                          </>
                        )}
                      </div>

                      {itemsViajeBajoLiquidacion.length > 0 && (
                        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                          <div className="mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">Servicios VIAJE</p>
                            <p className="text-[11px] text-indigo-800/80">
                              Estos VIAJES corresponden a la contratacion fija.
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                              <thead>
                                <tr className="bg-indigo-100/70 text-xs font-semibold uppercase tracking-wide text-indigo-900">
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">ID</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Tipo</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Estado</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Fecha</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Origen</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Destino</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Placa</th>
                                  <th className="border-b border-indigo-100 px-3 py-2 text-left">Manifiesto</th>
                                  {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">
                                      <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-indigo-900">
                                        <input
                                          type="checkbox"
                                          checked={allClientItemsViajesBajoLiquidacionChecked}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            setClientItemSelections((prev) => {
                                              const next = { ...prev };
                                              for (const it of itemsViajeBajoLiquidacion) {
                                                next[it.id] = checked;
                                              }
                                              return next;
                                            });
                                          }}
                                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                                        />
                                        Aprobar todos
                                      </label>
                                    </th>
                                  )}
                                  {user.rol !== "CLIENTE" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">Tarifa Tercero</th>
                                  )}
                                  {user.rol !== "TERCERO" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">Tarifa Cliente</th>
                                  )}
                                  {user.rol === "COINTRA" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">Ganancia Cointra</th>
                                  )}
                                  {user.rol === "COINTRA" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">Rentabilidad %</th>
                                  )}
                                  {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                                    <th className="border-b border-indigo-100 px-3 py-2 text-left">Acciones</th>
                                  )}
                                </tr>
                                <tr className="bg-white text-xs text-slate-600">
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.id}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, id: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.tipo}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, tipo: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.estado}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, estado: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.fecha}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, fecha: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.origen}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, origen: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.destino}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, destino: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.placa}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, placa: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  <th className="border-b border-indigo-100 px-3 py-1.5">
                                    <input
                                      value={filtrosTablaItemsViajeBajoLiquidacion.manifiesto}
                                      onChange={(e) => setFiltrosTablaItemsViajeBajoLiquidacion((prev) => ({ ...prev, manifiesto: e.target.value }))}
                                      placeholder="Filtrar"
                                      className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                                    />
                                  </th>
                                  {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                  {user.rol !== "CLIENTE" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                  {user.rol !== "TERCERO" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                  {user.rol === "COINTRA" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                  {user.rol === "COINTRA" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                  {user.rol === "COINTRA" && selected.estado === "BORRADOR" && <th className="border-b border-indigo-100 px-3 py-1.5" />}
                                </tr>
                              </thead>
                              <tbody>
                                {itemsViajeBajoLiquidacionFiltrados.map((item) => (
                                  <tr key={item.id} className="border-b border-indigo-50 last:border-0">
                                    <td className="px-3 py-2">
                                      {item.viaje_id ? (
                                        <button
                                          type="button"
                                          onClick={() => openViajeDetalle(item)}
                                          className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                                        >
                                          {item.viaje_id}
                                        </button>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-slate-900">{getItemServicioLabel(item)}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                          item.estado === "RECHAZADO"
                                            ? "bg-red-100 text-red-700"
                                            : item.estado === "APROBADO"
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-slate-100 text-slate-600"
                                        }`}
                                      >
                                        {item.estado.toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">{item.fecha_servicio || "-"}</td>
                                    <td className="px-3 py-2">{item.origen || "-"}</td>
                                    <td className="px-3 py-2">{item.destino || "-"}</td>
                                    <td className="px-3 py-2">{item.placa || "-"}</td>
                                    <td className="px-3 py-2">
                                      {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                        <EditableCell
                                          initialValue={String(item.manifiesto_numero ?? "")}
                                          onSave={async (val) => {
                                            await patchItemAndSync(item.id, {
                                              manifiesto_numero: val.trim() || null,
                                            });
                                          }}
                                          placeholder="Ej. 0522318"
                                          helperText={item.manifiesto_numero ? `Actual: ${item.manifiesto_numero}` : undefined}
                                          className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                        />
                                      ) : (
                                        item.manifiesto_numero || "-"
                                      )}
                                    </td>
                                    {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          type="checkbox"
                                          checked={!!clientItemSelections[item.id]}
                                          onChange={(e) =>
                                            setClientItemSelections((prev) => ({
                                              ...prev,
                                              [item.id]: e.target.checked,
                                            }))
                                          }
                                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                                        />
                                      </td>
                                    )}
                                    {user.rol !== "CLIENTE" && (
                                      <td className="px-3 py-2">
                                        {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                          <EditableCell
                                            initialValue={String(item.tarifa_tercero ?? "")}
                                            type="number"
                                            onSave={async (val) => {
                                              await patchItemAndSync(item.id, { tarifa_tercero: Number(val) });
                                            }}
                                            placeholder="0"
                                            helperText={
                                              item.tarifa_tercero !== null && item.tarifa_tercero !== undefined
                                                ? `Actual: ${formatCOP(item.tarifa_tercero)}`
                                                : "Actual: -"
                                            }
                                            className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                          />
                                        ) : (
                                          formatCOP(item.tarifa_tercero)
                                        )}
                                      </td>
                                    )}
                                    {user.rol !== "TERCERO" && (
                                      <td className="px-3 py-2">
                                        {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                                          <EditableCell
                                            initialValue={String(item.tarifa_cliente ?? "")}
                                            type="number"
                                            onSave={async (val) => {
                                              await patchItemAndSync(item.id, { tarifa_cliente: Number(val) });
                                            }}
                                            placeholder="0"
                                            helperText={
                                              item.tarifa_cliente !== null && item.tarifa_cliente !== undefined
                                                ? `Actual: ${formatCOP(item.tarifa_cliente)}`
                                                : "Actual: -"
                                            }
                                            className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                          />
                                        ) : (
                                          formatCOP(item.tarifa_cliente)
                                        )}
                                      </td>
                                    )}
                                    {user.rol === "COINTRA" && (
                                      <td className="px-3 py-2">
                                        {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                      </td>
                                    )}
                                    {user.rol === "COINTRA" && (
                                      <td className="px-3 py-2">
                                        {selected.estado === "BORRADOR" ? (
                                          <div className="space-y-1">
                                            <EditableCell
                                              initialValue={String(item.rentabilidad ?? "")}
                                              type="number"
                                              onSave={async (val) => {
                                                await patchItemAndSync(item.id, { rentabilidad: Number(val) });
                                              }}
                                              placeholder="%"
                                              className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                            />
                                            <p className="text-[11px] text-neutral">
                                              Valor: {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                            </p>
                                          </div>
                                        ) : (
                                          <>
                                            <span>
                                              {item.rentabilidad !== null && item.rentabilidad !== undefined
                                                ? `${item.rentabilidad.toFixed(1)}%`
                                                : "-"}
                                            </span>
                                            <p className="text-[11px] text-neutral">
                                              Valor: {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                            </p>
                                          </>
                                        )}
                                      </td>
                                    )}
                                    {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                                      <td className="px-3 py-2">
                                        {item.viaje_id ? (
                                          <button
                                            type="button"
                                            onClick={() => void removeViajeFromConciliacion(item.viaje_id as number)}
                                            className="inline-flex items-center rounded-full border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                                          >
                                            Quitar
                                          </button>
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-indigo-900">
                            {user.rol === "TERCERO" && (
                              <span>Total a cobrar: {formatCOP(totalsViajesBajoLiquidacion.tarifaTercero)}</span>
                            )}
                            {user.rol === "CLIENTE" && (
                              <span>Total a pagar: {formatCOP(totalsViajesBajoLiquidacion.tarifaCliente)}</span>
                            )}
                            {user.rol === "COINTRA" && (
                              <span>Total Tercero: {formatCOP(totalsViajesBajoLiquidacion.tarifaTercero)}</span>
                            )}
                            {user.rol === "COINTRA" && (
                              <span>Total Cliente: {formatCOP(totalsViajesBajoLiquidacion.tarifaCliente)}</span>
                            )}
                            {user.rol === "COINTRA" && (
                              <span>Total Ganancia Cointra: {formatMoney(totalsViajesBajoLiquidacion.gananciaCointra)}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          )}
          {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
            <div className="rounded-xl border border-border bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Flujo de revisión</p>
                  <p className="text-xs text-neutral">
                    Primero guarda la conciliación. Después podrás enviarla al cliente para revisión.
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${selected.borrador_guardado ? "text-emerald-700" : "text-amber-700"}`}>
                    {selected.borrador_guardado ? "Borrador guardado" : "Pendiente por guardar"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void guardarConciliacionBorrador()}
                    disabled={isSavingConciliacion}
                    className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isSavingConciliacion ? "Guardando..." : "Guardar conciliación"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReviewPanel((prev) => !prev)}
                    disabled={!selected.borrador_guardado}
                    className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                    title={
                      !selected.borrador_guardado
                        ? "Debes guardar la conciliación antes"
                        : "Enviar a revisión"
                    }
                  >
                    Enviar a revisión
                  </button>
                </div>
              </div>
              {showReviewPanel && (
                isSendingReview ? (
                  <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border bg-white/70 py-8">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                    <p className="text-sm font-medium text-slate-700">Enviando correo al cliente, por favor espera…</p>
                    <div className="w-full max-w-xs space-y-2 px-6">
                      <div className="h-3 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(260px,1.1fr),minmax(260px,1.4fr),auto]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Enviar a
                        </label>
                        <input
                          type="text"
                          value={reviewRecipient}
                          onChange={(e) => {
                            reviewRecipientDirtyRef.current = true;
                            setReviewRecipient(e.target.value);
                          }}
                          placeholder="correo1@empresa.com, correo2@empresa.com"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                        <p className="mt-1 text-[11px] text-neutral">
                          Puedes escribir varios correos separados por coma o punto y coma.
                        </p>
                        {suggestedReviewRecipient && (
                          <p className="mt-1 text-[11px] text-emerald-700">Sugerido: {suggestedReviewRecipient}</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Mensaje
                        </label>
                        <textarea
                          value={reviewMessage}
                          onChange={(e) => setReviewMessage(e.target.value)}
                          placeholder="Mensaje para el cliente"
                          className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => void sendToReview()}
                          disabled={isSendingReview}
                          className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-success/90 disabled:opacity-60"
                        >
                          Confirmar envío
                        </button>
                      </div>
                    </div>
                    {reviewError && (
                      <p className="whitespace-pre-line rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">{reviewError}</p>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {user.rol === "COINTRA" && selected.estado === "APROBADA" && !selected.enviada_facturacion && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Enviar a facturación</p>
                  <p className="text-xs text-neutral">
                    Envía correo interno con Excel adjunto y marca la conciliación como enviada a facturar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFacturacionPanelOpen((prev) => !prev)}
                  className="inline-flex items-center rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
                >
                  Enviar a facturar
                </button>
              </div>
              {facturacionPanelOpen && (
                isSendingFacturacion ? (
                  <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-sky-200 bg-white/70 py-8">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
                    <p className="text-sm font-medium text-slate-700">Generando Excel y enviando correo, por favor espera…</p>
                    <div className="w-full max-w-xs space-y-2 px-6">
                      <div className="h-3 animate-pulse rounded bg-sky-100" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-sky-100" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-sky-100" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(260px,1.1fr),minmax(260px,1.4fr),auto]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Correos de destino
                        </label>
                        <input
                          type="text"
                          value={facturacionRecipient}
                          onChange={(e) => setFacturacionRecipient(e.target.value)}
                          placeholder="correo1@empresa.com; correo2@empresa.com"
                          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                        <p className="mt-1 text-[11px] text-neutral">
                          Puedes escribir varios correos separados por coma o punto y coma.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                          Mensaje
                        </label>
                        <textarea
                          value={facturacionMessage}
                          onChange={(e) => setFacturacionMessage(e.target.value)}
                          placeholder="Mensaje interno para facturación"
                          className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => void sendToFacturacion()}
                          disabled={isSendingFacturacion}
                          className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
                        >
                          Confirmar envío
                        </button>
                      </div>
                    </div>
                    {facturacionError && (
                      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                        {facturacionErrorParsed ? (
                          <>
                            <p className="font-semibold">{facturacionErrorParsed.summary}</p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-danger/80">Servicios pendientes</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {facturacionErrorParsed.viajesPendientes.map((viaje, index) => (
                                <span
                                  key={`${viaje}-${index}`}
                                  className="inline-flex items-center rounded-full border border-danger/30 bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow-sm"
                                >
                                  {viaje}
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 text-sm">{facturacionErrorParsed.recomendacion}</p>
                          </>
                        ) : (
                          <p className="font-medium">{facturacionError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {user.rol === "COINTRA" && getConciliacionEstadoLabel(selected) === "ENVIADA_A_FACTURAR" && !selected.factura_cliente_enviada && (
            <div className="rounded-xl border border-lime-200 bg-lime-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Enviar factura al cliente</p>
                  <p className="text-xs text-neutral">
                    Adjunta el PDF de la factura para el cliente. Al enviar, la conciliación pasa a FACTURADO y se cierra el ciclo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFacturaClientePanelOpen((prev) => !prev)}
                  className="inline-flex items-center rounded-full bg-lime-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-lime-800"
                >
                  Enviar factura cliente
                </button>
              </div>
              {facturaClientePanelOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                        Correos de destino
                      </label>
                      <input
                        type="text"
                        value={facturaClienteRecipient}
                        onChange={(e) => setFacturaClienteRecipient(e.target.value)}
                        placeholder="correo1@empresa.com; correo2@empresa.com"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      Mensaje
                    </label>
                    <textarea
                      value={facturaClienteMessage}
                      onChange={(e) => setFacturaClienteMessage(e.target.value)}
                      placeholder="Mensaje para cliente"
                      className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral">
                      PDF factura
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => setFacturaClienteFile(e.target.files?.[0] ?? null)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-lime-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-lime-800"
                    />
                    {facturaClienteFile && (
                      <p className="mt-1 text-[11px] text-slate-700">Adjunto: {facturaClienteFile.name}</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void sendFacturaToCliente()}
                      disabled={isSendingFacturaCliente}
                      className="rounded-lg bg-lime-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-lime-800 disabled:opacity-60"
                    >
                      {isSendingFacturaCliente ? "Enviando..." : "Confirmar envío"}
                    </button>
                  </div>
                  {facturaClienteError && (
                    <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">
                      {facturaClienteError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
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
                      <th className="border-b border-border px-3 py-2 text-left">Placa</th>
                      <th className="border-b border-border px-3 py-2 text-left">Manifiesto</th>
                      {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                        <th className="border-b border-border px-3 py-2 text-left">
                          <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={allClientItemsConciliacionChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setClientItemSelections((prev) => {
                                  const next = { ...prev };
                                  for (const it of itemsConciliacion) {
                                    next[it.id] = checked;
                                  }
                                  return next;
                                });
                              }}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                            />
                            Aprobar todos
                          </label>
                        </th>
                      )}
                      {user.rol !== "CLIENTE" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Tercero</th>
                      )}
                      {user.rol !== "TERCERO" && (
                        <th className="border-b border-border px-3 py-2 text-left">Tarifa Cliente</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Ganancia Cointra</th>
                      )}
                      {user.rol === "COINTRA" && (
                        <th className="border-b border-border px-3 py-2 text-left">Rentabilidad %</th>
                      )}
                      {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                        <th className="border-b border-border px-3 py-2 text-left">Acciones</th>
                      )}
                    </tr>
                    <tr className="bg-white text-xs text-slate-600">
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.id}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, id: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.tipo}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, tipo: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.estado}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, estado: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.fecha}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, fecha: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.origen}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, origen: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.destino}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, destino: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.placa}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, placa: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      <th className="border-b border-border px-3 py-1.5">
                        <input
                          value={filtrosTablaItemsConciliacion.manifiesto}
                          onChange={(e) => setFiltrosTablaItemsConciliacion((prev) => ({ ...prev, manifiesto: e.target.value }))}
                          placeholder="Filtrar"
                          className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
                        />
                      </th>
                      {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol !== "CLIENTE" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol !== "TERCERO" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol === "COINTRA" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol === "COINTRA" && <th className="border-b border-border px-3 py-1.5" />}
                      {user.rol === "COINTRA" && selected.estado === "BORRADOR" && <th className="border-b border-border px-3 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsConciliacionFiltrados.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {item.viaje_id ? (
                            <button
                              type="button"
                              onClick={() => openViajeDetalle(item)}
                              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {item.viaje_id}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{getItemServicioLabel(item)}</div>
                          {isHoraExtraItem(item) && item.horas_cantidad !== null && item.horas_cantidad !== undefined && (
                            <p className="text-[11px] text-slate-500">{item.horas_cantidad.toFixed(2)} horas</p>
                          )}
                          {item.liquidacion_contrato_fijo && (
                            <>
                              {getItemLiquidacionPeriodoLabel(item) && (
                                <p className="text-[11px] text-slate-500">Periodo: {getItemLiquidacionPeriodoLabel(item)}</p>
                              )}
                              {item.liquidacion_es_relevo && (
                                <p className="text-[11px] text-slate-500">
                                  Conductor relevo {item.liquidacion_relevo_con_valor ? "con valor" : "sin valor"}
                                </p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              item.estado === "RECHAZADO"
                                ? "bg-red-100 text-red-700"
                                : item.estado === "APROBADO"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.estado.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.fecha_servicio}</td>
                        <td className="px-3 py-2">{item.origen || "-"}</td>
                        <td className="px-3 py-2">{item.destino || "-"}</td>
                        <td className="px-3 py-2">{item.placa || "-"}</td>
                        <td className="px-3 py-2">
                          {isTransportServiceItem(item) ? (
                            user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                              <EditableCell
                                initialValue={String(item.manifiesto_numero ?? "")}
                                onSave={async (val) => {
                                  await patchItemAndSync(item.id, {
                                    manifiesto_numero: val.trim() || null,
                                  });
                                }}
                                placeholder="Ej. 0522318"
                                helperText={item.manifiesto_numero ? `Actual: ${item.manifiesto_numero}` : undefined}
                                className="w-32 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                              />
                            ) : (
                              item.manifiesto_numero || "-"
                            )
                          ) : (
                            null
                          )}
                        </td>
                        {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!clientItemSelections[item.id]}
                              onChange={(e) =>
                                setClientItemSelections((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                            />
                          </td>
                        )}
                        {user.rol !== "CLIENTE" && (
                          <td className="px-3 py-2">
                            {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                              <EditableCell
                                initialValue={String(item.tarifa_tercero ?? "")}
                                type="number"
                                onSave={async (val) => {
                                  await patchItemAndSync(item.id, { tarifa_tercero: Number(val) });
                                }}
                                placeholder="0"
                                helperText={
                                  item.tarifa_tercero !== null && item.tarifa_tercero !== undefined
                                    ? `Actual: ${formatCOP(item.tarifa_tercero)}`
                                    : "Actual: -"
                                }
                                className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                              />
                            ) : (
                              formatCOP(item.tarifa_tercero)
                            )}
                          </td>
                        )}
                        {user.rol !== "TERCERO" && (
                          <td className="px-3 py-2">
                            {user.rol === "COINTRA" && selected.estado === "BORRADOR" ? (
                              <EditableCell
                                initialValue={String(item.tarifa_cliente ?? "")}
                                type="number"
                                onSave={async (val) => {
                                  await patchItemAndSync(item.id, { tarifa_cliente: Number(val) });
                                }}
                                placeholder="0"
                                helperText={
                                  item.tarifa_cliente !== null && item.tarifa_cliente !== undefined
                                    ? `Actual: ${formatCOP(item.tarifa_cliente)}`
                                    : "Actual: -"
                                }
                                className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                              />
                            ) : (
                              formatCOP(item.tarifa_cliente)
                            )}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">
                            {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                          </td>
                        )}
                        {user.rol === "COINTRA" && (
                          <td className="px-3 py-2">
                            {selected.estado === "BORRADOR" ? (
                              <div className="space-y-1">
                                <EditableCell
                                  initialValue={String(item.rentabilidad ?? "")}
                                  type="number"
                                  onSave={async (val) => {
                                    await patchItemAndSync(item.id, { rentabilidad: Number(val) });
                                  }}
                                  placeholder="%"
                                  className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
                                />
                                <p className="text-[11px] text-neutral">
                                  Valor: {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                </p>
                              </div>
                            ) : (
                              <>
                                <span>
                                  {item.rentabilidad !== null && item.rentabilidad !== undefined
                                    ? `${item.rentabilidad.toFixed(1)}%`
                                    : "-"}
                                </span>
                                <p className="text-[11px] text-neutral">
                                  Valor: {formatMoney(getGananciaCointra(item.tarifa_cliente, item.tarifa_tercero))}
                                </p>
                              </>
                            )}
                          </td>
                        )}
                        {user.rol === "COINTRA" && selected.estado === "BORRADOR" && (
                          <td className="px-3 py-2">
                            {item.viaje_id ? (
                              <button
                                type="button"
                                onClick={() => void removeViajeFromConciliacion(item.viaje_id as number)}
                                className="inline-flex items-center rounded-full border border-danger/30 bg-danger/5 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                              >
                                Quitar
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-900">
                {user.rol === "TERCERO" && (
                  <span>Total a cobrar: {formatCOP(totals.tarifaTercero)}</span>
                )}
                {user.rol === "CLIENTE" && (
                  <span>Total a pagar: {formatCOP(totals.tarifaCliente)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Tercero: {formatCOP(totals.tarifaTercero)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Cliente: {formatCOP(totals.tarifaCliente)}</span>
                )}
                {user.rol === "COINTRA" && (
                  <span>Total Ganancia Cointra: {formatMoney(totals.gananciaCointra)}</span>
                )}
              </div>
              {user.rol === "CLIENTE" && selected.estado === "EN_REVISION" && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setClientDecisionModal({
                        action: "aprobar",
                        observacion: "",
                        enviarCorreo: true,
                        destinatario: suggestedClientReplyRecipient,
                        mensaje: "",
                        poNumero: "",
                      })
                    }
                    onMouseDown={() => setClientDecisionError("")}
                    className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-success/90"
                  >
                    Confirmar autorización
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setClientDecisionModal({
                        action: "devolver",
                        observacion: "",
                        enviarCorreo: true,
                        destinatario: suggestedClientReplyRecipient,
                        mensaje: "",
                        poNumero: "",
                      })
                    }
                    onMouseDown={() => setClientDecisionError("")}
                    disabled={allClientItemsChecked}
                    className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title={allClientItemsChecked ? "No puedes devolver cuando todos los registros están aprobados" : "Devolver a Cointra"}
                  >
                    Devolver a Cointra
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      </>
      )}

      <ActionModal
        open={!!saveResultModal}
        title={saveResultModal?.title ?? "Resultado"}
        description={saveResultModal?.description ?? ""}
        confirmText="Aceptar"
        onClose={() => setSaveResultModal(null)}
        onConfirm={async () => setSaveResultModal(null)}
      />

      <ActionModal
        open={!!viajeEditModal}
        title={viajeEditModal ? `Editar viaje #${viajeEditModal.id}` : "Editar viaje"}
        confirmText="Guardar cambios"
        onClose={() => setViajeEditModal(null)}
        onConfirm={onConfirmEditViaje}
      >
        <input
          value={viajeEditModal?.titulo ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, titulo: e.target.value } : prev))
          }
          placeholder="Título"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={viajeEditModal?.origen ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, origen: e.target.value } : prev))
          }
          placeholder="Origen"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={viajeEditModal?.destino ?? ""}
          onChange={(e) =>
            setViajeEditModal((prev) => (prev ? { ...prev, destino: e.target.value } : prev))
          }
          placeholder="Destino"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!conciliacionEditModal}
        title={
          conciliacionEditModal
            ? `Editar conciliación #${conciliacionEditModal.id}`
            : "Editar conciliación"
        }
        confirmText="Guardar cambios"
        onClose={() => setConciliacionEditModal(null)}
        onConfirm={onConfirmEditConciliacion}
      >
        <input
          value={conciliacionEditModal?.nombre ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) => (prev ? { ...prev, nombre: e.target.value } : prev))
          }
          placeholder="Nombre"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={conciliacionEditModal?.fecha_inicio ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) =>
              prev ? { ...prev, fecha_inicio: e.target.value } : prev
            )
          }
          type="date"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          value={conciliacionEditModal?.fecha_fin ?? ""}
          onChange={(e) =>
            setConciliacionEditModal((prev) =>
              prev ? { ...prev, fecha_fin: e.target.value } : prev
            )
          }
          type="date"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={!!liquidacionItemEditModal}
        title={liquidacionItemEditModal ? `Editar registro liquidación #${liquidacionItemEditModal.id}` : "Editar registro liquidación"}
        confirmText="Guardar cambios"
        onClose={() => setLiquidacionItemEditModal(null)}
        onConfirm={onConfirmEditLiquidacionRegistro}
      >
        <input
          value={liquidacionItemEditModal?.placa ?? ""}
          onChange={(e) =>
            setLiquidacionItemEditModal((prev) => (prev ? { ...prev, placa: e.target.value.toUpperCase() } : prev))
          }
          placeholder="Placa"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <input
          type="number"
          value={liquidacionItemEditModal?.tarifa_tercero ?? ""}
          onChange={(e) =>
            setLiquidacionItemEditModal((prev) => (prev ? { ...prev, tarifa_tercero: e.target.value } : prev))
          }
          placeholder="Valor tercero"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </ActionModal>

      <ActionModal
        open={liquidacionItemDeleteConfirmId !== null}
        title={
          liquidacionItemDeleteConfirmId !== null
            ? `¿Eliminar registro de liquidación #${liquidacionItemDeleteConfirmId}?`
            : "¿Eliminar registro de liquidación?"
        }
        description="Este registro se quitará del listado de liquidación contrato fijo en esta conciliación."
        confirmText="Sí, eliminar registro"
        confirmTone="danger"
        onClose={() => setLiquidacionItemDeleteConfirmId(null)}
        onConfirm={confirmarEliminarRegistroLiquidacion}
      />

      <ActionModal
        open={!!confirmModal}
        title={
          confirmModal
            ? `¿${confirmModal.action === "inactivar" ? "Inactivar" : "Reactivar"} ${
                confirmModal.entity === "viaje" ? "viaje" : "conciliación"
              } #${confirmModal.id}?`
            : "Confirmar acción"
        }
        description="Esta acción quedará registrada en el sistema."
        confirmText={confirmModal?.action === "inactivar" ? "Inactivar" : "Reactivar"}
        confirmTone={confirmModal?.action === "inactivar" ? "danger" : "success"}
        onClose={() => setConfirmModal(null)}
        onConfirm={onConfirmAction}
      />

      <ActionModal
        open={!!clientDecisionModal}
        title={
          clientDecisionModal?.action === "aprobar"
            ? "Confirmar autorización de conciliación"
            : "Devolver conciliación a Cointra"
        }
        description={
          clientDecisionModal?.action === "aprobar"
            ? "Se aprobarán todos los registros marcados (contrato fijo y demás servicios) y la conciliación quedará autorizada."
            : "Incluye observaciones para que Cointra ajuste y vuelva a enviar."
        }
        confirmText={clientDecisionModal?.action === "aprobar" ? "Confirmar" : "Devolver"}
        confirmTone={clientDecisionModal?.action === "aprobar" ? "success" : "danger"}
        onClose={() => {
          setClientDecisionModal(null);
          setClientDecisionError("");
        }}
        onConfirm={submitClientDecision}
      >
        {clientDecisionModal?.action === "devolver" && (
          <textarea
            value={clientDecisionModal.observacion}
            onChange={(e) =>
              setClientDecisionModal((prev) =>
                prev ? { ...prev, observacion: e.target.value } : prev
              )
            }
            placeholder="Observaciones de la devolución"
            className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        )}

        {clientDecisionModal?.action === "aprobar" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            El envío de correo es obligatorio al autorizar la conciliación.
          </p>
        ) : (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!clientDecisionModal?.enviarCorreo}
              onChange={(e) =>
                setClientDecisionModal((prev) =>
                  prev ? { ...prev, enviarCorreo: e.target.checked } : prev
                )
              }
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
            />
            Notificar por correo esta novedad
          </label>
        )}

        {clientDecisionModal?.enviarCorreo && (
          <>
            <input
              value={clientDecisionModal.destinatario}
              onChange={(e) =>
                setClientDecisionModal((prev) =>
                  prev ? { ...prev, destinatario: e.target.value } : prev
                )
              }
              placeholder="Correos destinatario (opcional): correo1@empresa.com; correo2@empresa.com"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <textarea
              value={clientDecisionModal.mensaje}
              onChange={(e) =>
                setClientDecisionModal((prev) =>
                  prev ? { ...prev, mensaje: e.target.value } : prev
                )
              }
              placeholder="Mensaje de correo (opcional)"
              className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {clientDecisionModal.action === "aprobar" && (
              <input
                value={clientDecisionModal.poNumero}
                onChange={(e) =>
                  setClientDecisionModal((prev) =>
                    prev ? { ...prev, poNumero: e.target.value } : prev
                  )
                }
                placeholder="Número de PO de autorización"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            )}
            <p className="text-[11px] text-neutral">Puedes ingresar múltiples correos separados por coma o punto y coma.</p>
          </>
        )}
        {clientDecisionError && <p className="text-sm font-medium text-danger">{clientDecisionError}</p>}
      </ActionModal>

      {selectedViajeDetalle &&
        createPortal(
          <div
            className="fixed left-0 top-0 z-[120] h-screen w-screen flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[10px]"
            onClick={() => setSelectedViajeDetalle(null)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border border-emerald-100 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">Detalle del viaje</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Viaje #{selectedViajeDetalle.viaje_id ?? "-"}</h3>
                <p className="mt-1 text-sm text-neutral">
                  {selectedViajeDetalle.fecha_servicio} · {selectedViajeDetalle.origen || "-"} - {selectedViajeDetalle.destino || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedViajeDetalle(null)}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Placa</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedViajeDetalle.placa || "-"}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Conductor</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedViajeDetalle.conductor || "-"}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Tarifa tercero</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(selectedViajeDetalle.tarifa_tercero)}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Tarifa cliente</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(selectedViajeDetalle.tarifa_cliente)}</p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Rentabilidad</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedViajeDetalle.rentabilidad !== null && selectedViajeDetalle.rentabilidad !== undefined
                    ? `${selectedViajeDetalle.rentabilidad.toFixed(1)}%`
                    : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral">Ganancia Cointra</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatMoney(getGananciaCointra(selectedViajeDetalle.tarifa_cliente, selectedViajeDetalle.tarifa_tercero))}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Observaciones / descripcion</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                {selectedViajeDetalle.descripcion?.trim() || "Sin observaciones registradas para este viaje."}
              </p>
            </div>
            </div>
          </div>,
          document.body
        )}
      {reviewSuccessMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
            onClick={() => setReviewSuccessMessage("")}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Envío confirmado</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Correo enviado correctamente</h3>
              <p className="mt-3 text-sm text-slate-700">{reviewSuccessMessage}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setReviewSuccessMessage("")}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isDownloadingExcel &&
        createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Generando archivo Excel</p>
                  <p className="text-xs text-neutral">Consultando manifiestos y preparando la descarga.</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
