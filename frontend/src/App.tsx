import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginForm } from "./components/LoginForm";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { OperacionesPage } from "./pages/OperacionesPage";
import { ClientesPage } from "./pages/ClientesPage";
import { TercerosPage } from "./pages/TercerosPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { api } from "./services/api";
import { Conciliacion, Operacion, User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);

  async function loadInitialData() {
    const [ops, con] = await Promise.all([api.operaciones(), api.conciliaciones()]);
    setOperaciones(ops);
    setConciliaciones(con);
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    api
      .me()
      .then(async (me) => {
        setUser(me);
        await loadInitialData();
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }, []);

  async function handleLogin(email: string, password: string) {
    const token = await api.login(email, password);
    localStorage.setItem("token", token.access_token);
    const me = await api.me();
    setUser(me);
    await loadInitialData();
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setOperaciones([]);
    setConciliaciones([]);
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white/90 p-8 shadow-lg shadow-slate-900/5">
          <LoginForm onLogin={handleLogin} />
        </div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardHomePage user={user} />} />
        <Route
          path="/conciliaciones"
          element={
            <DashboardPage
              user={user}
              operaciones={operaciones}
              conciliaciones={conciliaciones}
              onRefreshConciliaciones={async () => {
                const con = await api.conciliaciones();
                setConciliaciones(con);
              }}
            />
          }
        />
        <Route path="/operaciones" element={<OperacionesPage user={user} />} />
        <Route path="/clientes" element={<ClientesPage user={user} />} />
        <Route path="/terceros" element={<TercerosPage user={user} />} />
        <Route path="/usuarios" element={<UsuariosPage user={user} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}
