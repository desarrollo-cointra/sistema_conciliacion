import type { User } from "../types";

interface Props {
  user: User;
}

export function DashboardHomePage({ user }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Dashboard</h2>
      <p className="text-sm text-neutral">
        Hola {user.nombre}, este dashboard de resumen está{" "}
        <span className="font-semibold text-warning">en construcción</span>. Aquí verás tarjetas de
        indicadores y las últimas conciliaciones según tu rol.
      </p>
    </div>
  );
}

