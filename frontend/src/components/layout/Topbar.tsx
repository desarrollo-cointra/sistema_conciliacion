import type { User } from "../../types";

interface TopbarProps {
  user: User;
  onLogout: () => void;
}

export function Topbar({ user, onLogout }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border/80 bg-white/90 px-6 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold text-slate-900">Panel de conciliaciones</h1>
        <p className="text-xs text-neutral">
          Sesión activa como{" "}
          <span className="font-medium text-slate-900">
            {user.nombre} ({user.rol})
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        Cerrar sesión
      </button>
    </header>
  );
}

