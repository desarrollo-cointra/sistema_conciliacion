import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
            placeholder="Ej. usuario@empresa.com"
            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 placeholder:text-slate-400 focus:border-primary focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral">
            Contraseña
          </label>
          <div className="relative">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              required
              placeholder="Escribe tu contraseña"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none ring-primary/10 placeholder:text-slate-400 focus:border-primary focus:ring-2"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Ingresar
      </button>

      <p className="text-sm text-neutral">
        <Link to="/forgot-password" className="font-medium text-emerald-700 hover:text-emerald-800">
          Olvide mi contraseña
        </Link>
      </p>
    </form>
  );
}
