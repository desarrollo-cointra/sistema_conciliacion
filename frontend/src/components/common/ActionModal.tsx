import { ReactNode, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: "primary" | "danger" | "success";
  onConfirm?: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}

const confirmToneClass: Record<NonNullable<Props["confirmTone"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary/90",
  danger: "bg-danger text-white hover:bg-danger/90",
  success: "bg-success text-white hover:bg-success/90",
};

export function ActionModal({
  open,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmTone = "primary",
  onConfirm,
  onClose,
  children,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!onConfirm || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Confirmación</p>
        <h3 className="mt-2 text-xl font-bold text-slate-900">{title}</h3>
        {description && <p className="mt-2 text-sm text-slate-700">{description}</p>}
        {children && <div className="mt-4 space-y-3">{children}</div>}
        {submitting && (
          <div className="mt-4 rounded-xl border border-border bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
              <p className="text-sm font-medium text-slate-700">Procesando solicitud, por favor espera...</p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-2 animate-pulse rounded bg-slate-200" />
              <div className="h-2 w-4/5 animate-pulse rounded bg-slate-200" />
              <div className="h-2 w-3/5 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${confirmToneClass[confirmTone]}`}
          >
            {submitting ? "Enviando..." : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
