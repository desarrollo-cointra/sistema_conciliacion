import type { User } from "../types";

interface Props {
  user: User;
}

export function OperacionesPage({ user }: Props) {
  const soloCointra = user.rol === "COINTRA";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Operaciones</h2>
      {!soloCointra ? (
        <p className="text-sm text-danger">
          Solo los usuarios con rol COINTRA pueden acceder a esta sección.
        </p>
      ) : (
        <p className="text-sm text-neutral">
          Gestión de operaciones Cointra —{" "}
          <span className="font-semibold text-warning">en construcción</span>.
        </p>
      )}
    </div>
  );
}

