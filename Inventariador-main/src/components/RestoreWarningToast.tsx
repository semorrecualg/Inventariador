import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface RestoreWarningToastProps {
  /** Texto do aviso; `null` mantém o toast fora do ecrã. */
  message: string | null;
  onDismiss: () => void;
  /** Auto-dismiss em ms (0 desliga). */
  autoDismissMs?: number;
}

/**
 * Toast do restauro manual de backup: canto inferior, vermelho e auto-dismiss.
 *
 * Vive no próprio painel em vez de passar pelo canal global de mensagens do App
 * — esse canal abre um modal "Controle de Fluxo SRE" e descarta o tipo, o que
 * transformava este alerta num modal (ou o perdia para o toast de sucesso).
 */
export const RestoreWarningToast: React.FC<RestoreWarningToastProps> = ({
  message,
  onDismiss,
  autoDismissMs = 8000
}) => {
  useEffect(() => {
    if (!message || autoDismissMs <= 0) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, autoDismissMs]);

  if (!message) return null;

  return (
    <div
      role="alert"
      data-testid="restore-warning-toast"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] w-[90%] max-w-sm bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-3 border border-white/20"
    >
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-widest">Aviso de contrato</span>
        <span className="text-[11px] font-semibold leading-tight">{message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="ml-auto shrink-0 text-white/80 hover:text-white transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>
    </div>
  );
};
