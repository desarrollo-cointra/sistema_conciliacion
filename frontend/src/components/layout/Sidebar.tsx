import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "../../types";

interface SidebarProps {
  user: User;
}

type NavItem = {
  key: string;
  label: string;
  path: string;
};

function getNavItemsForRole(rol: User["rol"]): NavItem[] {
  if (rol === "COINTRA") {
    return [
      { key: "dashboard", label: "Dashboard", path: "/dashboard" },
      { key: "operaciones", label: "Operaciones", path: "/operaciones" },
      { key: "conciliaciones", label: "Conciliaciones", path: "/conciliaciones" },
      { key: "clientes", label: "Clientes", path: "/clientes" },
      { key: "terceros", label: "Terceros", path: "/terceros" },
      { key: "usuarios", label: "Usuarios", path: "/usuarios" },
    ];
  }

  if (rol === "CLIENTE") {
    return [
      { key: "dashboard", label: "Dashboard", path: "/dashboard" },
      { key: "mis-conciliaciones", label: "Mis Conciliaciones", path: "/conciliaciones" },
    ];
  }

  return [
    { key: "dashboard", label: "Dashboard", path: "/dashboard" },
    { key: "mis-conciliaciones", label: "Mis Conciliaciones", path: "/conciliaciones" },
  ];
}

export function Sidebar({ user }: SidebarProps) {
  const items = getNavItemsForRole(user.rol);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800/40 bg-sidebar text-slate-100">
      <div className="flex h-16 items-center px-5">
        <div className="h-8 w-8 rounded-lg bg-primary/90" />
        <div className="ml-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Cointra</p>
          <p className="text-sm font-semibold text-slate-50">Conciliaciones</p>
        </div>
      </div>
      <nav className="mt-4 flex-1 space-y-1 px-3 text-sm">
        {items.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-slate-700 text-white"
                  : "text-slate-200 hover:bg-slate-700/80 hover:text-white"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  active ? "bg-primary" : "bg-slate-400"
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-800/60 px-4 py-4 text-xs text-slate-500">
        <p className="font-medium text-slate-300">{user.nombre}</p>
        <p>Rol: {user.rol}</p>
      </div>
    </aside>
  );
}

