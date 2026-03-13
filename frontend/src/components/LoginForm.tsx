import { FormEvent, useState } from "react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState("cointra@cointra.com");
  const [password, setPassword] = useState("cointra123");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onLogin(email, password);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sistema de Conciliación</h1>
        <p className="text-sm text-neutral">Cointra S.A.S.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 placeholder:text-slate-400 focus:border-primary focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
            Contraseña
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 placeholder:text-slate-400 focus:border-primary focus:ring-2"
          />
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Ingresar
      </button>

      <p className="text-xs leading-relaxed text-neutral">
        Demo: cointra@cointra.com / cliente@cointra.com / tercero@cointra.com (clave terminada en 123)
      </p>
    </form>
  );
}
