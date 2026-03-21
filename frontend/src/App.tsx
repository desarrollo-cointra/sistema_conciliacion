import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ActionModal } from "./components/common/ActionModal";
import { LoginForm } from "./components/LoginForm";
import { Layout } from "./components/layout/Layout";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { OperacionesPage } from "./pages/OperacionesPage";
import { AvansatPage } from "./pages/AvansatPage";
import { ClientesPage } from "./pages/ClientesPage";
import { TercerosPage } from "./pages/TercerosPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { VehiculosPage } from "./pages/VehiculosPage";
import { ServiciosPage } from "./pages/ServiciosPage";
import { CatalogoTarifasPage } from "./pages/CatalogoTarifasPage";
import { api, setUnauthorizedHandler } from "./services/api";
import { Conciliacion, Notificacion, Operacion, User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [lastAlertSignatureSeen, setLastAlertSignatureSeen] = useState("");
  const [pendingConciliacionId, setPendingConciliacionId] = useState<number | null>(null);
  const [pendingNotificacionId, setPendingNotificacionId] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryOpenConciliacionId = useMemo(() => {
    if (location.pathname !== "/conciliaciones") return null;
    const raw = new URLSearchParams(location.search).get("open_conciliacion_id");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.pathname, location.search]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
    setOperaciones([]);
    setConciliaciones([]);
    setNotificaciones([]);
    setShowAlertsModal(false);
    setLastAlertSignatureSeen("");
    setPendingConciliacionId(null);
    setPendingNotificacionId(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  async function refreshAlertsData() {
    const [con, notifs] = await Promise.all([
      api.conciliaciones(),
      api.misNotificaciones(true).catch(() => []),
    ]);
    setConciliaciones(con);
    setNotificaciones(notifs);
  }

  async function loadInitialData() {
    const [ops, con, notifs] = await Promise.all([
      api.operaciones(),
      api.conciliaciones(),
      api.misNotificaciones(true).catch(() => []),
    ]);
    setOperaciones(ops);
    setConciliaciones(con);
    setNotificaciones(notifs);
  }

  const clientePendientes =
    user?.rol === "CLIENTE"
      ? conciliaciones.filter((c) => c.estado === "EN_REVISION").length
      : 0;

  const cointraPendientes =
    user?.rol === "COINTRA"
      ? notificaciones.filter((n) => ["APROBACION", "DEVOLUCION"].includes(n.tipo)).length
      : 0;

  const alertCount = user?.rol === "CLIENTE" ? clientePendientes : cointraPendientes;

  const alertSignature = useMemo(() => {
    if (!user) return "";
    if (user.rol === "CLIENTE") {
      return conciliaciones
        .filter((c) => c.estado === "EN_REVISION")
        .map((c) => String(c.id))
        .sort()
        .join("|");
    }
    if (user.rol === "COINTRA") {
      return notificaciones
        .filter((n) => ["APROBACION", "DEVOLUCION"].includes(n.tipo))
        .map((n) => String(n.id))
        .sort()
        .join("|");
    }
    return "";
  }, [user, conciliaciones, notificaciones]);

  useEffect(() => {
    const baseTitle = "Sistema de Conciliación";
    document.title = alertCount > 0 ? `(${alertCount}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [alertCount]);

  useEffect(() => {
    if (!user) return;
    if (!alertSignature) {
      setLastAlertSignatureSeen("");
      return;
    }

    if (alertSignature !== lastAlertSignatureSeen) {
      setShowAlertsModal(true);
      setLastAlertSignatureSeen(alertSignature);
    }
  }, [user, alertSignature, lastAlertSignatureSeen]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void refreshAlertsData();
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      handleLogout();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [handleLogout]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthChecked(true);
      return;
    }

    api
      .me()
      .then(async (me) => {
        setUser(me);
        await loadInitialData();
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  async function handleLogin(email: string, password: string) {
    const token = await api.login(email, password);
    localStorage.setItem("token", token.access_token);
    const me = await api.me();
    setUser(me);
    await loadInitialData();
    navigate("/dashboard", { replace: true });
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/92 p-8 shadow-lg shadow-emerald-900/10">
          <p className="text-sm text-neutral">Validando sesion...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/92 p-8 shadow-lg shadow-emerald-900/10">
          <Routes>
            <Route path="/login" element={<LoginForm onLogin={handleLogin} />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        user={user}
        onLogout={handleLogout}
        onChangePassword={() => navigate("/cambiar-password")}
        alertCount={alertCount}
        onOpenAlerts={() => setShowAlertsModal(true)}
      >
        <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/dashboard" replace />} />
        <Route path="/reset-password" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardHomePage user={user} />} />
        <Route path="/cambiar-password" element={<ChangePasswordPage onPasswordChanged={handleLogout} />} />
        <Route
          path="/conciliaciones"
          element={
            <DashboardPage
              user={user}
              operaciones={operaciones}
              conciliaciones={conciliaciones}
              onRefreshConciliaciones={async () => {
                await refreshAlertsData();
              }}
              openConciliacionId={pendingConciliacionId ?? queryOpenConciliacionId}
              onOpenConciliacionHandled={() => {
                setPendingConciliacionId(null);
                if (queryOpenConciliacionId) {
                  navigate("/conciliaciones", { replace: true });
                }
                if (pendingNotificacionId) {
                  setNotificaciones((prev) => {
                    const next = prev.filter((x) => x.id !== pendingNotificacionId);
                    const nextSignature = next
                      .filter((n) => ["APROBACION", "DEVOLUCION"].includes(n.tipo))
                      .map((n) => String(n.id))
                      .sort()
                      .join("|");
                    setLastAlertSignatureSeen(nextSignature);
                    return next;
                  });
                  void api.marcarNotificacionLeida(pendingNotificacionId).catch(() => null);
                  setPendingNotificacionId(null);
                }
                setShowAlertsModal(false);
              }}
            />
          }
        />
        <Route path="/operaciones" element={<OperacionesPage user={user} />} />
        <Route path="/avansat" element={<AvansatPage user={user} />} />
        <Route path="/vehiculos" element={<VehiculosPage user={user} />} />
        <Route path="/servicios" element={<ServiciosPage user={user} />} />
        <Route path="/catalogo-tarifas" element={<CatalogoTarifasPage user={user} />} />
        <Route path="/clientes" element={<ClientesPage user={user} />} />
        <Route path="/terceros" element={<TercerosPage user={user} />} />
        <Route path="/usuarios" element={<UsuariosPage user={user} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>

      <ActionModal
        open={showAlertsModal}
        title={
          user.rol === "CLIENTE"
            ? "Tienes conciliaciones pendientes por revisar"
            : "Tienes novedades de conciliación por revisar"
        }
        description={
          user.rol === "CLIENTE"
            ? "Estas conciliaciones fueron enviadas por Cointra y requieren tu decisión."
            : "Hay conciliaciones aprobadas o devueltas por cliente que requieren tu atención."
        }
        confirmText="Entendido"
        onClose={() => setShowAlertsModal(false)}
        onConfirm={() => setShowAlertsModal(false)}
      >
        {user.rol === "CLIENTE" ? (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {conciliaciones
              .filter((c) => c.estado === "EN_REVISION")
              .slice(0, 8)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setShowAlertsModal(false);
                    setLastAlertSignatureSeen(alertSignature);
                    setPendingConciliacionId(c.id);
                    navigate("/conciliaciones");
                  }}
                  className="w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                >
                  <p className="font-semibold text-slate-900">{c.nombre}</p>
                  <p className="text-xs text-neutral">#{c.id} · {c.fecha_inicio} a {c.fecha_fin} · <span className="text-emerald-700 font-medium">Clic para gestionar →</span></p>
                </button>
              ))}
            {clientePendientes === 0 && (
              <p className="text-sm text-neutral">No tienes conciliaciones pendientes.</p>
            )}
          </div>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {notificaciones
              .filter((n) => ["APROBACION", "DEVOLUCION"].includes(n.tipo))
              .slice(0, 8)
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setShowAlertsModal(false);
                    setLastAlertSignatureSeen(alertSignature);
                    if (n.conciliacion_id) {
                      // Navigate + open conciliation; notification removed when conciliation actually opens
                      setPendingConciliacionId(n.conciliacion_id);
                      setPendingNotificacionId(n.id);
                    } else {
                      // No specific conciliation ID (old notification), mark as read immediately
                      setNotificaciones((prev) => prev.filter((x) => x.id !== n.id));
                      void api.marcarNotificacionLeida(n.id).catch(() => null);
                    }
                    navigate("/conciliaciones");
                  }}
                  className="w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                >
                  <p className="font-semibold text-slate-900">{n.titulo}</p>
                  <p className="text-xs text-neutral">{n.mensaje}</p>
                  <p className="text-xs text-emerald-700 font-medium mt-0.5">Clic para gestionar →</p>
                </button>
              ))}
            {cointraPendientes === 0 && (
              <p className="text-sm text-neutral">No tienes novedades pendientes.</p>
            )}
          </div>
        )}
      </ActionModal>
    </>
  );
}
